const mongoose = require("mongoose");
const Commande = require("../models/Commande");
const CommandeItem = require("../models/CommandeItem");
const Client = require("../models/Client");
const Product = require("../models/Product");
const logHistory = require("../utils/historyLogger");
const { computeCommercialTotals } = require("../utils/commercialTotals");

function computeTotal(items) {
  return items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeIncomingItems(rawItems) {
  if (rawItems === undefined || rawItems === null) return [];

  let parsedItems = rawItems;
  if (typeof parsedItems === "string") {
    try {
      parsedItems = JSON.parse(parsedItems);
    } catch (_error) {
      throw httpError(400, "items must be a valid JSON array");
    }
  }

  if (
    Array.isArray(parsedItems) &&
    parsedItems.length === 1 &&
    typeof parsedItems[0] === "string" &&
    parsedItems[0].trim().startsWith("[")
  ) {
    try {
      parsedItems = JSON.parse(parsedItems[0]);
    } catch (_error) {
      throw httpError(400, "items must be a valid array");
    }
  }

  if (!Array.isArray(parsedItems)) {
    throw httpError(400, "items must be an array");
  }

  return parsedItems;
}

function mapToCommandeItemDoc(item) {
  const quantity = Number(item.quantity);
  return {
    product: item.product || item.productId,
    quantity,
    orderedQuantity: quantity,
    deliveredQuantity: 0,
    pendingQuantity: quantity,
    unitPrice: Number(item.unitPrice),
  };
}

function buildCommandeNumber() {
  const stamp = new Date().toISOString().replace(/[TZ:\-.]/g, "").slice(0, 14);
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `CMD-${stamp}-${random}`;
}

async function generateUniqueCommandeNumber(session) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const commandeNumber = buildCommandeNumber();
    const exists = await Commande.findOne({ commandeNumber }).session(session);
    if (!exists) return commandeNumber;
  }
  throw httpError(500, "Failed to generate unique commande number");
}

async function createCommandeItemsFromPayload(items, commandeId, session) {
  const docs = items.map(item => ({ ...mapToCommandeItemDoc(item), commande: commandeId }));
  if (docs.length === 0) return [];
  return CommandeItem.create(docs, { session, ordered: true });
}

async function validateItemsProducts(items, session = null) {
  for (const item of items) {
    const productId = item.product || item.productId;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw httpError(400, "Invalid product id in items");
    }
    const qty = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw httpError(400, "Invalid quantity in items");
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw httpError(400, "Invalid unitPrice in items");
    }

    const query = Product.findById(productId);
    if (session) query.session(session);
    const product = await query;
    if (!product) throw httpError(404, `Product not found: ${productId}`);
  }
}

async function createCommande(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { date, status, clientId, items, currencyCode, exchangeRateToTnd, originalCurrencyTotals } = req.body;
    const normalizedItems = normalizeIncomingItems(items);
    if (!clientId) {
      await session.abortTransaction();
      return res.status(400).json({ message: "clientId is required" });
    }

    if (status === "DELIVERED" || status === "PARTIALLY_DELIVERED") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Commande delivery status is managed by livraison items" });
    }

    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid client id" });
    }
    const client = await Client.findById(clientId).session(session);
    if (!client) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Client not found" });
    }

    await validateItemsProducts(normalizedItems, session);
    const totals = await computeCommercialTotals(normalizedItems, { session, priceField: "unitPrice" });

    const commandeNumber = await generateUniqueCommandeNumber(session);
    const [commande] = await Commande.create(
      [
        {
          commandeNumber,
          date,
          status,
          client: clientId,
          items: [],
          totalHT: totals.totalHT,
          tvaAmount: totals.tvaAmount,
          totalAmount: totals.totalAmountTTC,
          totalAmountTTC: totals.totalAmountTTC,
          currencyCode: String(currencyCode || "TND").toUpperCase(),
          exchangeRateToTnd: Number(exchangeRateToTnd || 1) || 1,
          originalCurrencyTotals: originalCurrencyTotals || null,
          managedBy: req.user.id,
        },
      ],
      { session }
    );

    const createdCommandeItems = await createCommandeItemsFromPayload(normalizedItems, commande._id, session);
    const commandeItemIds = createdCommandeItems.map(ci => ci._id);
    if (commandeItemIds.length > 0) {
      commande.items = commandeItemIds;
      await commande.save({ session });
    }

    await session.commitTransaction();

    await logHistory({
      action: "COMMANDE_CREATED",
      description: `Commande ${commande._id} created`,
      user: req.user.id,
      entityType: "Commande",
      entityId: commande._id,
      metaData: { totalHT: totals.totalHT, tvaAmount: totals.tvaAmount, totalAmountTTC: totals.totalAmountTTC, status: commande.status },
    });

    return res.status(201).json(commande);
  } catch (error) {
    await session.abortTransaction();
    return res.status(error.status || 500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

async function listCommandes(_req, res) {
  try {
    const commandes = await Commande.find()
      .populate("client", "name phone")
      .populate("facture", "invoiceNumber totalAmountTTC paymentStatus")
      .populate("managedBy", "firstName lastName email role")
      .populate({
        path: "items",
        select: "product quantity orderedQuantity deliveredQuantity pendingQuantity unitPrice status deliveredAt deliveredBy",
        populate: [
          { path: "product", select: "name reference" },
          { path: "deliveredBy", select: "firstName lastName email role" },
        ],
      })
      .sort({ createdAt: -1 });
    return res.json(commandes);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getCommandeById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid commande id" });
    const commande = await Commande.findById(id)
      .populate("client", "name phone address")
      .populate("facture", "invoiceNumber totalAmountTTC paymentStatus")
      .populate("managedBy", "firstName lastName email role")
      .populate({
        path: "items",
        select: "product quantity orderedQuantity deliveredQuantity pendingQuantity unitPrice status deliveredAt deliveredBy",
        populate: [
          { path: "product", select: "name reference" },
          { path: "deliveredBy", select: "firstName lastName email role" },
        ],
      });
    if (!commande) return res.status(404).json({ message: "Commande not found" });
    return res.json(commande);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateCommande(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid commande id" });
    }

    const payload = { ...req.body };
    if (payload.commandeNumber !== undefined) {
      await session.abortTransaction();
      return res.status(400).json({ message: "commandeNumber is auto-generated and cannot be updated" });
    }

    let nextItemsDetailed = null;
    if (payload.items !== undefined) {
      const normalizedItems = normalizeIncomingItems(payload.items);
      await validateItemsProducts(normalizedItems, session);
      const totals = await computeCommercialTotals(normalizedItems, { session, priceField: "unitPrice" });
      payload.totalHT = totals.totalHT;
      payload.tvaAmount = totals.tvaAmount;
      payload.totalAmount = totals.totalAmountTTC;
      payload.totalAmountTTC = totals.totalAmountTTC;
      nextItemsDetailed = normalizedItems.map(mapToCommandeItemDoc);
    }

    const commande = await Commande.findById(id).session(session);
    if (!commande) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Commande not found" });
    }

    if (payload.clientId) {
      if (!mongoose.Types.ObjectId.isValid(payload.clientId)) {
        await session.abortTransaction();
        return res.status(400).json({ message: "Invalid client id" });
      }
      const client = await Client.findById(payload.clientId).session(session);
      if (!client) {
        await session.abortTransaction();
        return res.status(404).json({ message: "Client not found" });
      }
      payload.client = payload.clientId;
      delete payload.clientId;
    }

    if (payload.currencyCode !== undefined) {
      payload.currencyCode = String(payload.currencyCode || "TND").toUpperCase();
    }

    if (payload.exchangeRateToTnd !== undefined) {
      payload.exchangeRateToTnd = Number(payload.exchangeRateToTnd || 1) || 1;
    }

    if (commande.stockApplied && payload.items) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Cannot change items after stock has already been applied" });
    }

    if (payload.status === "DELIVERED" || payload.status === "PARTIALLY_DELIVERED") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Commande delivery status is managed by livraison items" });
    }

    if (commande.stockApplied && payload.status && payload.status !== commande.status) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Cannot manually change status after item delivery has started" });
    }

    if (commande.facture && (payload.client || payload.totalAmount !== undefined || payload.totalAmountTTC !== undefined || payload.totalHT !== undefined || payload.tvaAmount !== undefined)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Cannot change client or totalAmount after invoice has been created" });
    }

    if (payload.items !== undefined) {
      const oldItemIds = [...(commande.items || [])];
      const createdItems = await createCommandeItemsFromPayload(nextItemsDetailed, commande._id, session);
      const createdItemIds = createdItems.map(ci => ci._id);

      if (oldItemIds.length > 0) {
        await CommandeItem.deleteMany({ _id: { $in: oldItemIds } }).session(session);
      }

      payload.items = createdItemIds;
      nextItemsDetailed = createdItems;
    }

    if (!nextItemsDetailed) {
      if (!Array.isArray(commande.items) || commande.items.length === 0) {
        nextItemsDetailed = [];
      } else {
        nextItemsDetailed = await CommandeItem.find({ _id: { $in: commande.items } }).session(session);
      }
    }

    const updatedCommande = await Commande.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
      session,
    });

    await session.commitTransaction();

    await logHistory({
      action: "COMMANDE_UPDATED",
      description: `Commande ${updatedCommande._id} updated`,
      user: req.user.id,
      entityType: "Commande",
      entityId: updatedCommande._id,
    });

    return res.json(updatedCommande);
  } catch (error) {
    await session.abortTransaction();
    return res.status(error.status || 500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

async function deleteCommande(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid commande id" });
    }

    const commande = await Commande.findById(id).session(session);
    if (!commande) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Commande not found" });
    }

    if (Array.isArray(commande.items) && commande.items.length > 0) {
      await CommandeItem.deleteMany({ _id: { $in: commande.items } }).session(session);
    }

    await Commande.deleteOne({ _id: id }).session(session);
    await session.commitTransaction();

    await logHistory({
      action: "COMMANDE_DELETED",
      description: `Commande ${commande._id} deleted`,
      user: req.user.id,
      entityType: "Commande",
      entityId: commande._id,
    });
    return res.json({ message: "Commande deleted" });
  } catch (error) {
    await session.abortTransaction();
    return res.status(error.status || 500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

module.exports = { createCommande, listCommandes, getCommandeById, updateCommande, deleteCommande };

async function salesByCategory(_req, res) {
  try {
    // Aggregate delivered commandes items grouped by product category
    const results = await CommandeItem.aggregate([
      {
        $lookup: {
          from: "commandes",
          localField: "commande",
          foreignField: "_id",
          as: "commandeDoc",
        },
      },
      { $unwind: { path: "$commandeDoc", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          $or: [
            { "commandeDoc.status": "DELIVERED" },
            { "commandeDoc.status": "delivered" },
            { "commandeDoc.status": "Delivered" },
          ],
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "productDoc",
        },
      },
      { $unwind: { path: "$productDoc", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "categories",
          localField: "productDoc.categoryId",
          foreignField: "_id",
          as: "categoryDoc",
        },
      },
      { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          categoryName: {
            $cond: [
              { $and: [{ $ifNull: ["$categoryDoc.name", false] }] },
              "$categoryDoc.name",
              { $ifNull: ["$productDoc.categorie", "Autres"] },
            ],
          },
          lineTotal: { $multiply: [{ $ifNull: ["$quantity", 0] }, { $ifNull: ["$unitPrice", 0] }] },
        },
      },
      {
        $group: {
          _id: "$categoryName",
          value: { $sum: "$lineTotal" },
          count: { $sum: { $ifNull: ["$quantity", 0] } },
        },
      },
      {
        $project: { _id: 0, name: "$_id", value: { $floor: ["$value"] }, count: 1 },
      },
      { $sort: { value: -1 } },
    ]);

    return res.json(results || []);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// Export salesByCategory so routes can use it
module.exports.salesByCategory = salesByCategory;

async function salesByProduct(_req, res) {
  try {
    const results = await CommandeItem.aggregate([
      {
        $lookup: {
          from: "commandes",
          localField: "commande",
          foreignField: "_id",
          as: "commandeDoc",
        },
      },
      { $unwind: { path: "$commandeDoc", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          $or: [
            { "commandeDoc.status": "DELIVERED" },
            { "commandeDoc.status": "delivered" },
            { "commandeDoc.status": "Delivered" },
          ],
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "productDoc",
        },
      },
      { $unwind: { path: "$productDoc", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          productName: { $ifNull: ["$productDoc.name", "$product"] },
          lineTotal: { $multiply: [{ $ifNull: ["$quantity", 0] }, { $ifNull: ["$unitPrice", 0] }] },
        },
      },
      {
        $group: {
          _id: "$productDoc._id",
          name: { $first: "$productName" },
          value: { $sum: "$lineTotal" },
          quantity: { $sum: { $ifNull: ["$quantity", 0] } },
        },
      },
      { $project: { _id: 0, id: "$_id", name: "$name", value: { $floor: ["$value"] }, quantity: 1 } },
      { $sort: { value: -1 } },
      { $limit: 10 },
    ]);

    return res.json(results || []);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports.salesByProduct = salesByProduct;
