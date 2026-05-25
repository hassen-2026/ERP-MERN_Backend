const mongoose = require("mongoose");
const Commande = require("../models/Commande");
const CommandeItem = require("../models/CommandeItem");
const Product = require("../models/Product");
const logHistory = require("../utils/historyLogger");
const { computeCommercialTotals } = require("../utils/commercialTotals");

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseItemPayload(body) {
  const productId = body.productId || body.product;
  const quantity = Number(body.quantity);
  const unitPrice = Number(body.unitPrice);

  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    throw httpError(400, "Valid productId is required");
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw httpError(400, "quantity must be a number greater than 0");
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw httpError(400, "unitPrice must be a number greater than or equal to 0");
  }

  return { productId, quantity, unitPrice };
}

async function assertCommandeMutable(commande) {
  if (commande.stockApplied) {
    throw httpError(400, "Cannot modify items after stock has already been applied");
  }
  if (commande.facture) {
    throw httpError(400, "Cannot modify items after invoice has been created");
  }
}

async function syncCommandeItemsAndTotal(commande, session) {
  const items = await CommandeItem.find({ commande: commande._id })
    .select("_id product orderedQuantity quantity unitPrice")
    .populate("product", "tvaRate")
    .session(session);

  commande.items = items.map(item => item._id);
  const totals = await computeCommercialTotals(
    items.map((item) => ({
      product: item.product?._id || item.product,
      quantity: Number(item.orderedQuantity || item.quantity),
      unitPrice: Number(item.unitPrice),
    })),
    { session, priceField: "unitPrice" },
  );

  commande.totalHT = totals.totalHT;
  commande.tvaAmount = totals.tvaAmount;
  commande.totalAmount = totals.totalAmountTTC;
  commande.totalAmountTTC = totals.totalAmountTTC;

  await commande.save({ session });
}

async function createCommandeItem(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { commandeId } = req.body;
    if (!commandeId || !mongoose.Types.ObjectId.isValid(commandeId)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Valid commandeId is required" });
    }

    const commande = await Commande.findById(commandeId).session(session);
    if (!commande) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Commande not found" });
    }

    await assertCommandeMutable(commande);

    const { productId, quantity, unitPrice } = parseItemPayload(req.body);
    const product = await Product.findById(productId).session(session);
    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Product not found" });
    }

    const [createdItem] = await CommandeItem.create(
      [
        {
          commande: commande._id,
          product: productId,
          quantity,
          orderedQuantity: quantity,
          deliveredQuantity: 0,
          pendingQuantity: quantity,
          unitPrice,
        },
      ],
      { session }
    );

    await syncCommandeItemsAndTotal(commande, session);
    await session.commitTransaction();

    await logHistory({
      action: "COMMANDE_ITEM_CREATED",
      description: `Commande item ${createdItem._id} created for commande ${commande._id}`,
      user: req.user.id,
      entityType: "CommandeItem",
      entityId: createdItem._id,
      metaData: { commandeId: commande._id.toString() },
    });

    const populatedItem = await CommandeItem.findById(createdItem._id)
      .populate("commande", "date status totalAmount")
      .populate("product", "name reference");

    return res.status(201).json(populatedItem);
  } catch (error) {
    await session.abortTransaction();
    return res.status(error.status || 500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

async function listCommandeItems(req, res) {
  try {
    const filter = {};
    if (req.query.commandeId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.commandeId)) {
        return res.status(400).json({ message: "Invalid commandeId" });
      }
      filter.commande = req.query.commandeId;
    }

    const items = await CommandeItem.find(filter)
      .populate("commande", "date status totalAmount")
      .populate("product", "name reference")
      .sort({ createdAt: -1 });

    return res.json(items);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getCommandeItemById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid commande item id" });
    }

    const item = await CommandeItem.findById(id)
      .populate("commande", "date status totalAmount")
      .populate("product", "name reference");

    if (!item) return res.status(404).json({ message: "Commande item not found" });
    return res.json(item);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateCommandeItem(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid commande item id" });
    }

    const item = await CommandeItem.findById(id).session(session);
    if (!item) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Commande item not found" });
    }

    const commande = await Commande.findById(item.commande).session(session);
    if (!commande) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Commande not found" });
    }

    await assertCommandeMutable(commande);

    if (req.body.productId || req.body.product) {
      const productId = req.body.productId || req.body.product;
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        await session.abortTransaction();
        return res.status(400).json({ message: "Invalid productId" });
      }
      const product = await Product.findById(productId).session(session);
      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({ message: "Product not found" });
      }
      item.product = productId;
    }

    if (req.body.quantity !== undefined) {
      const quantity = Number(req.body.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        await session.abortTransaction();
        return res.status(400).json({ message: "quantity must be a number greater than 0" });
      }
      if (quantity < Number(item.deliveredQuantity || 0)) {
        await session.abortTransaction();
        return res.status(400).json({ message: "quantity cannot be lower than delivered quantity" });
      }
      item.quantity = quantity;
      item.orderedQuantity = quantity;
      item.pendingQuantity = Math.max(quantity - Number(item.deliveredQuantity || 0), 0);
      if (item.pendingQuantity <= 0) {
        item.status = "DELIVERED";
      } else if (Number(item.deliveredQuantity || 0) > 0) {
        item.status = "PARTIALLY_DELIVERED";
      } else {
        item.status = "PENDING";
      }
    }

    if (req.body.unitPrice !== undefined) {
      const unitPrice = Number(req.body.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        await session.abortTransaction();
        return res.status(400).json({ message: "unitPrice must be a number greater than or equal to 0" });
      }
      item.unitPrice = unitPrice;
    }

    await item.save({ session });
    await syncCommandeItemsAndTotal(commande, session);
    await session.commitTransaction();

    await logHistory({
      action: "COMMANDE_ITEM_UPDATED",
      description: `Commande item ${item._id} updated`,
      user: req.user.id,
      entityType: "CommandeItem",
      entityId: item._id,
      metaData: { commandeId: commande._id.toString() },
    });

    const populatedItem = await CommandeItem.findById(item._id)
      .populate("commande", "date status totalAmount")
      .populate("product", "name reference");

    return res.json(populatedItem);
  } catch (error) {
    await session.abortTransaction();
    return res.status(error.status || 500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

async function deleteCommandeItem(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid commande item id" });
    }

    const item = await CommandeItem.findById(id).session(session);
    if (!item) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Commande item not found" });
    }

    const commande = await Commande.findById(item.commande).session(session);
    if (!commande) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Commande not found" });
    }

    await assertCommandeMutable(commande);

    await CommandeItem.deleteOne({ _id: id }).session(session);
    await syncCommandeItemsAndTotal(commande, session);
    await session.commitTransaction();

    await logHistory({
      action: "COMMANDE_ITEM_DELETED",
      description: `Commande item ${item._id} deleted`,
      user: req.user.id,
      entityType: "CommandeItem",
      entityId: item._id,
      metaData: { commandeId: commande._id.toString() },
    });

    return res.json({ message: "Commande item deleted" });
  } catch (error) {
    await session.abortTransaction();
    return res.status(error.status || 500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

module.exports = {
  createCommandeItem,
  listCommandeItems,
  getCommandeItemById,
  updateCommandeItem,
  deleteCommandeItem,
};
