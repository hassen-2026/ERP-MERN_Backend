const mongoose = require("mongoose");
const Devis = require("../models/Devis");
const DevisItem = require("../models/DevisItem");
const Commande = require("../models/Commande");
const CommandeItem = require("../models/CommandeItem");
const Client = require("../models/Client");
const Product = require("../models/Product");
const logHistory = require("../utils/historyLogger");

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function computeTotalFromItems(itemIds, session = null) {
  let query = DevisItem.find({ _id: { $in: itemIds } });
  if (session) query = query.session(session);
  const items = await query;
  return items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
}

async function validateItemsProducts(items, session = null) {
  for (const item of items) {
    if (!mongoose.Types.ObjectId.isValid(item.product)) {
      throw httpError(400, "Invalid product id in items");
    }
    const query = Product.findById(item.product);
    if (session) query.session(session);
    const product = await query;
    if (!product) throw httpError(404, `Product not found: ${item.product}`);
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw httpError(400, "Invalid quantity in items");
    }
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      throw httpError(400, "Invalid unitPrice in items");
    }
  }
}

async function createCommandeFromDevis({ devis, userId, session }) {
  if (devis.commande) return null;
  if (!Array.isArray(devis.items) || devis.items.length === 0) {
    throw httpError(400, "Cannot convert quote without items");
  }

  let devisItemsQuery = DevisItem.find({ _id: { $in: devis.items } });
  if (session) devisItemsQuery = devisItemsQuery.session(session);
  const devisItems = await devisItemsQuery;

  const totalAmount = devisItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
  
  const commandeItemDocs = devisItems.map(di => ({
    commande: null,
    product: di.product,
    quantity: di.quantity,
    orderedQuantity: di.quantity,
    deliveredQuantity: 0,
    pendingQuantity: di.quantity,
    unitPrice: di.unitPrice,
  }));

  const createdCommandeItems = await CommandeItem.create(commandeItemDocs, { session });
  const commandeItemIds = createdCommandeItems.map(ci => ci._id);

  const [commande] = await Commande.create(
    [
      {
        date: new Date(),
        status: "CONFIRMED",
        client: devis.client,
        managedBy: userId,
        items: commandeItemIds,
        totalAmount,
      },
    ],
    { session }
  );

  await CommandeItem.updateMany(
    { _id: { $in: commandeItemIds } },
    { commande: commande._id },
    { session }
  );

  devis.commande = commande._id;
  devis.convertedAt = new Date();
  await devis.save({ session });

  return commande;
}

async function createDevis(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { quoteNumber, date, status, file, clientId, items = [] } = req.body;
    if (!quoteNumber || !clientId) {
      await session.abortTransaction();
      return res.status(400).json({ message: "quoteNumber and clientId are required" });
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

    await validateItemsProducts(items, session);

    const createdDevisItems = await DevisItem.create(
      items.map(item => ({
        devis: null,
        product: item.product,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      { session }
    );
    const itemIds = createdDevisItems.map(dvi => dvi._id);

    const totalAmount = createdDevisItems.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
      0
    );

    const [devis] = await Devis.create(
      [
        {
          quoteNumber,
          date,
          status,
          file,
          client: clientId,
          createdBy: req.user.id,
          items: itemIds,
          totalAmount,
        },
      ],
      { session }
    );

    await DevisItem.updateMany(
      { _id: { $in: itemIds } },
      { devis: devis._id },
      { session }
    );

    let createdCommande = null;
    if (devis.status === "ACCEPTED") {
      createdCommande = await createCommandeFromDevis({ devis, userId: req.user.id, session });
    }

    await session.commitTransaction();

    await logHistory({
      action: "DEVIS_CREATED",
      description: `Devis ${devis.quoteNumber} created`,
      user: req.user.id,
      entityType: "Devis",
      entityId: devis._id,
      metaData: { totalAmount, status: devis.status, itemCount: itemIds.length },
    });

    if (createdCommande) {
      await logHistory({
        action: "DEVIS_CONVERTED_TO_COMMANDE",
        description: `Devis ${devis.quoteNumber} converted to commande ${createdCommande._id}`,
        user: req.user.id,
        entityType: "Devis",
        entityId: devis._id,
        metaData: { commandeId: createdCommande._id.toString() },
      });
    }

    const populatedDevis = await Devis.findById(devis._id)
      .populate("client", "name phone address")
      .populate("createdBy", "firstName lastName email role")
      .populate({
        path: "items",
        populate: { path: "product", select: "name reference" },
      })
      .populate("commande");
    return res.status(201).json(populatedDevis);
  } catch (error) {
    await session.abortTransaction();
    return res.status(error.status || 500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

async function listDevis(_req, res) {
  try {
    const list = await Devis.find()
      .populate("client", "name phone address")
      .populate("createdBy", "firstName lastName email role")
      .populate({
        path: "items",
        populate: { path: "product", select: "name reference" },
      })
      .populate("commande")
      .sort({ createdAt: -1 });
    return res.json(list);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getDevisById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid devis id" });
    const devis = await Devis.findById(id)
      .populate("client", "name phone address")
      .populate("createdBy", "firstName lastName email role")
      .populate({
        path: "items",
        populate: { path: "product", select: "name reference" },
      })
      .populate("commande");
    if (!devis) return res.status(404).json({ message: "Devis not found" });
    return res.json(devis);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateDevis(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid devis id" });
    }

    const devis = await Devis.findById(id).session(session);
    if (!devis) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Devis not found" });
    }

    const payload = { ...req.body };
    let itemsToAdd = [];

    if (payload.items) {
      if (devis.commande) {
        await session.abortTransaction();
        return res.status(400).json({ message: "Cannot change items after quote conversion" });
      }

      await validateItemsProducts(payload.items, session);

      itemsToAdd = await DevisItem.create(
        payload.items.map(item => ({
          devis: devis._id,
          product: item.product,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        { session }
      );

      await DevisItem.deleteMany({ _id: { $in: devis.items } }, { session });
      payload.items = itemsToAdd.map(item => item._id);
      payload.totalAmount = itemsToAdd.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
        0
      );
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

    if (devis.commande && payload.client) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Cannot change client after quote conversion" });
    }

    if (devis.commande && payload.status && payload.status !== "ACCEPTED") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Cannot move status away from ACCEPTED after conversion" });
    }

    Object.assign(devis, payload);

    let createdCommande = null;
    if (!devis.commande && devis.status === "ACCEPTED") {
      createdCommande = await createCommandeFromDevis({ devis, userId: req.user.id, session });
    }

    await devis.save({ session });
    await session.commitTransaction();

    await logHistory({
      action: "DEVIS_UPDATED",
      description: `Devis ${devis.quoteNumber} updated`,
      user: req.user.id,
      entityType: "Devis",
      entityId: devis._id,
    });

    if (createdCommande) {
      await logHistory({
        action: "DEVIS_CONVERTED_TO_COMMANDE",
        description: `Devis ${devis.quoteNumber} converted to commande ${createdCommande._id}`,
        user: req.user.id,
        entityType: "Devis",
        entityId: devis._id,
        metaData: { commandeId: createdCommande._id.toString() },
      });
    }

    const populated = await Devis.findById(id)
      .populate("client", "name phone address")
      .populate("createdBy", "firstName lastName email role")
      .populate({
        path: "items",
        populate: { path: "product", select: "name reference" },
      })
      .populate("commande");
    return res.json(populated);
  } catch (error) {
    await session.abortTransaction();
    return res.status(error.status || 500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

async function deleteDevis(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid devis id" });
    }

    const devis = await Devis.findById(id).session(session);
    if (!devis) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Devis not found" });
    }

    await DevisItem.deleteMany({ _id: { $in: devis.items } }, { session });
    await Devis.findByIdAndDelete(id, { session });

    await session.commitTransaction();

    await logHistory({
      action: "DEVIS_DELETED",
      description: `Devis ${devis.quoteNumber} deleted`,
      user: req.user.id,
      entityType: "Devis",
      entityId: devis._id,
    });
    return res.json({ message: "Devis deleted" });
  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

module.exports = { createDevis, listDevis, getDevisById, updateDevis, deleteDevis };
