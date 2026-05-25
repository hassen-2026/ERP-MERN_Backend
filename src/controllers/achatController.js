const mongoose = require("mongoose");
const Achat = require("../models/Achat");
const Product = require("../models/Product");
const Supplier = require("../models/Supplier");
const logHistory = require("../utils/historyLogger");
const { computeCommercialTotals } = require("../utils/commercialTotals");
const { createNotificationsForRole } = require("../utils/notificationService");

function computeTotal(items) {
  return items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitCost), 0);
}

function normalizeAchatItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    product: item?.product || item?.productId || item?.product_id || null,
    quantity: Number(item?.quantity) || 0,
    unitCost: Number(item?.unitCost ?? item?.unitPrice ?? 0),
    receivedQuantity: Number(item?.receivedQuantity || 0),
    status: String(item?.status || "PENDING").toUpperCase(),
  }));
}

function computeAchatStatus(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return "PENDING";
  }

  const normalizedItems = items.map((item) => ({
    quantity: Number(item?.quantity || 0),
    receivedQuantity: Number(item?.receivedQuantity || 0),
  }));

  const allReceived = normalizedItems.every((item) => item.receivedQuantity >= item.quantity && item.quantity > 0);
  if (allReceived) {
    return "RECEIVED";
  }

  const anyReceived = normalizedItems.some((item) => item.receivedQuantity > 0);
  return anyReceived ? "PARTIALLY_RECEIVED" : "PENDING";
}

function parseAchatDate(rawDate) {
  if (!rawDate) return undefined;
  if (rawDate instanceof Date) return rawDate;

  const input = String(rawDate).trim();
  if (!input) return undefined;

  const ddmmyyyy = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const isoCandidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const parsed = new Date(isoCandidate);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

async function createAchat(req, res) {
  try {
    const {
      purchaseNumber,
      date,
      status,
      supplierId,
      items = [],
      ocrSource = "",
      currencyCode = "TND",
      exchangeRateToTnd = 1,
      originalCurrencyTotals = null,
    } = req.body;
    if (!purchaseNumber || !supplierId) {
      return res.status(400).json({ message: "purchaseNumber and supplierId are required !" });
    }
    if (!mongoose.Types.ObjectId.isValid(supplierId)) {
      return res.status(400).json({ message: "Invalid supplier id" });
    }
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    const normalizedItems = normalizeAchatItems(items);
    const normalizedDate = parseAchatDate(date);
    const totals = await computeCommercialTotals(normalizedItems, { priceField: "unitCost" });

    const achat = await Achat.create({
      purchaseNumber,
      date: normalizedDate,
      status,
      supplier: supplierId,
      items: normalizedItems,
      currencyCode: String(currencyCode || "TND").toUpperCase(),
      exchangeRateToTnd: Number(exchangeRateToTnd) > 0 ? Number(exchangeRateToTnd) : 1,
      originalCurrencyTotals: originalCurrencyTotals || {
        totalHT: totals.totalHT,
        tvaAmount: totals.tvaAmount,
        totalAmountTTC: totals.totalAmountTTC,
      },
      totalHT: totals.totalHT,
      tvaAmount: totals.tvaAmount,
      totalAmount: totals.totalAmountTTC,
      totalAmountTTC: totals.totalAmountTTC,
      ocrSource,
      createdBy: req.user.id,
    });

    achat.items = achat.items.map((item) => ({
      ...item.toObject ? item.toObject() : item,
      receivedQuantity: Number(item.receivedQuantity || 0),
      status: String(item.status || "PENDING").toUpperCase(),
    }));
    achat.status = computeAchatStatus(achat.items);
    await achat.save();

    await logHistory({
      action: "ACHAT_CREATED",
      description: `Achat ${achat.purchaseNumber} created`,
      user: req.user.id,
      entityType: "Achat",
      entityId: achat._id,
      metaData: {
        totalHT: totals.totalHT,
        tvaAmount: totals.tvaAmount,
        totalAmountTTC: totals.totalAmountTTC,
        currencyCode: achat.currencyCode,
        exchangeRateToTnd: achat.exchangeRateToTnd,
      },
    });
    await createNotificationsForRole("LOGISTICS_MANAGER", {
      type: "ACHAT_CREATED",
      title: "Nouvel achat créé",
      message: `L'achat ${achat.purchaseNumber} a été créé et attend le suivi du stock.`,
      entityType: "Achat",
      entityId: achat._id,
      metadata: {
        purchaseNumber: achat.purchaseNumber,
        supplierId: supplier._id,
      },
      createdBy: req.user.id,
    });
    return res.status(201).json(achat);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listAchats(_req, res) {
  try {
    const achats = await Achat.find()
      .populate("supplier", "firstName lastName email phone")
      .populate("createdBy", "firstName lastName email role")
      .populate("items.product", "name reference")
      .sort({ createdAt: -1 });
    return res.json(achats);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getAchatById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid achat id" });
    const achat = await Achat.findById(id)
      .populate("supplier", "firstName lastName email phone")
      .populate("createdBy", "firstName lastName email role")
      .populate("items.product", "name reference");
    if (!achat) return res.status(404).json({ message: "Achat not found" });
    return res.json(achat);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateAchat(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid achat id" });
    const payload = { ...req.body };
    if (payload.items) {
      payload.items = normalizeAchatItems(payload.items);
      const totals = await computeCommercialTotals(payload.items, { priceField: "unitCost" });
      payload.totalHT = totals.totalHT;
      payload.tvaAmount = totals.tvaAmount;
      payload.totalAmount = totals.totalAmountTTC;
      payload.totalAmountTTC = totals.totalAmountTTC;
    }
    if (payload.date !== undefined) {
      payload.date = parseAchatDate(payload.date);
    }
    if (payload.currencyCode) {
      payload.currencyCode = String(payload.currencyCode).toUpperCase();
    }
    if (payload.exchangeRateToTnd !== undefined) {
      const normalizedRate = Number(payload.exchangeRateToTnd);
      payload.exchangeRateToTnd = Number.isFinite(normalizedRate) && normalizedRate > 0 ? normalizedRate : 1;
    }

    const achat = await Achat.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
    if (!achat) return res.status(404).json({ message: "Achat not found" });
    await logHistory({
      action: "ACHAT_UPDATED",
      description: `Achat ${achat.purchaseNumber} updated`,
      user: req.user.id,
      entityType: "Achat",
      entityId: achat._id,
    });
    return res.json(achat);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function deleteAchat(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid achat id" });
    const achat = await Achat.findByIdAndDelete(id);
    if (!achat) return res.status(404).json({ message: "Achat not found" });
    await logHistory({
      action: "ACHAT_DELETED",
      description: `Achat ${achat.purchaseNumber} deleted`,
      user: req.user.id,
      entityType: "Achat",
      entityId: achat._id,
    });
    return res.json({ message: "Achat deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function receiveAchat(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const userRole = String(req.user?.role || "").toUpperCase();
    if (!['ADMIN', 'PROCUREMENT_MANAGER', 'LOGISTICS_MANAGER'].includes(userRole)) {
      await session.abortTransaction();
      return res.status(403).json({ message: "Unauthorized to receive purchase lines" });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid achat id" });
    }
    const achat = await Achat.findById(id).session(session);
    if (!achat) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Achat not found" });
    }

    const body = req.body || {};

    // Build a map of requested quantities by index if provided.
    // Accept legacy `itemIndexes` (array of numbers) or `items` which may be numbers or objects { index, receivedQuantity }
    const requestedMap = new Map();

    if (Array.isArray(body.itemIndexes)) {
      body.itemIndexes.forEach((v) => {
        const idx = Number(v);
        if (Number.isInteger(idx)) requestedMap.set(idx, null);
      });
    }

    if (Array.isArray(body.items)) {
      body.items.forEach((it) => {
        if (typeof it === "number") {
          const idx = Number(it);
          if (Number.isInteger(idx)) requestedMap.set(idx, null);
        } else if (it && (it.index !== undefined)) {
          const idx = Number(it.index);
          if (!Number.isInteger(idx)) return;
          const q = Number(it.receivedQuantity);
          requestedMap.set(idx, Number.isFinite(q) ? q : null);
        }
      });
    }

    const selectedIndexes = Array.from(requestedMap.keys())
      .filter((value) => Number.isInteger(value) && value >= 0 && value < achat.items.length);

    const targetIndexes = selectedIndexes.length > 0
      ? [...new Set(selectedIndexes)]
      : achat.items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => Number(item.quantity || 0) > Number(item.receivedQuantity || 0))
        .map(({ index }) => index);

    if (targetIndexes.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: "No purchase lines are available for reception" });
    }

    let touchedAnyLine = false;

    for (const index of targetIndexes) {
      const item = achat.items[index];
      if (!item) {
        continue;
      }

      const product = await Product.findById(item.product).session(session);
      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({ message: `Product not found: ${item.product}` });
      }

      const quantity = Number(item.quantity || 0);
      const receivedQuantity = Number(item.receivedQuantity || 0);
      const remainingQuantity = Math.max(quantity - receivedQuantity, 0);

      if (remainingQuantity <= 0) {
        continue;
      }

      const requested = requestedMap.has(index) ? requestedMap.get(index) : null;
      let toReceive = remainingQuantity;
      if (requested !== null && requested !== undefined) {
        const r = Number(requested || 0);
        if (Number.isFinite(r)) {
          toReceive = Math.max(0, Math.min(r, remainingQuantity));
        }
      }

      if (toReceive <= 0) continue;

      product.quantity += toReceive;
      await product.save({ session });

      item.receivedQuantity = Number(item.receivedQuantity || 0) + toReceive;
      item.status = item.receivedQuantity >= quantity ? "RECEIVED" : "PARTIALLY_RECEIVED";
      touchedAnyLine = true;
    }

    if (!touchedAnyLine) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Selected purchase lines are already received" });
    }

    achat.status = computeAchatStatus(achat.items);
    await achat.save({ session });
    await session.commitTransaction();

    await logHistory({
      action: "ACHAT_RECEIVED",
      description: `Achat ${achat.purchaseNumber} received`,
      user: req.user.id,
      entityType: "Achat",
      entityId: achat._id,
    });

    return res.json({ message: "Achat updated and stock reception saved", achat });
  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

module.exports = {
  createAchat,
  listAchats,
  getAchatById,
  updateAchat,
  deleteAchat,
  receiveAchat,
};
