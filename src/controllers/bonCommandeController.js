const mongoose = require("mongoose");
const BonCommande = require("../models/BonCommande");
const BonCommandeLine = require("../models/BonCommandeLine");
const Commande = require("../models/Commande");
const CommandeItem = require("../models/CommandeItem");
const logHistory = require("../utils/historyLogger");
const { createNotificationsForRole } = require("../utils/notificationService");

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function buildBonNumber() {
  const stamp = new Date().toISOString().replace(/[TZ:\-.]/g, "").slice(0, 14);
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `BC-${stamp}-${random}`;
}

async function generateUniqueBonNumber(session) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const bonNumber = buildBonNumber();
    const exists = await BonCommande.findOne({ bonNumber }).session(session);
    if (!exists) return bonNumber;
  }
  throw httpError(500, "Failed to generate unique bon de commande number");
}

function normalizeLines(rawLines) {
  if (rawLines === undefined || rawLines === null) return [];

  let parsedLines = rawLines;
  if (typeof parsedLines === "string") {
    try {
      parsedLines = JSON.parse(parsedLines);
    } catch (_error) {
      throw httpError(400, "lines must be a valid JSON array");
    }
  }

  if (!Array.isArray(parsedLines)) {
    throw httpError(400, "lines must be an array");
  }

  return parsedLines;
}

function computeLineStatus(requestedQuantity, deliveredQuantity) {
  if (deliveredQuantity <= 0) return "PENDING";
  if (deliveredQuantity < requestedQuantity) return "PARTIALLY_DELIVERED";
  return "DELIVERED";
}

function computeBonStatus(lines, previousStatus = "PENDING") {
  if (previousStatus === "CANCELLED") return "CANCELLED";
  if (!Array.isArray(lines) || lines.length === 0) return "PENDING";

  const allDelivered = lines.every(line => line.status === "DELIVERED");
  if (allDelivered) return "DELIVERED";

  const hasDeliveryProgress = lines.some(
    line => Number(line.deliveredQuantity || 0) > 0 || line.status === "PARTIALLY_DELIVERED"
  );
  if (hasDeliveryProgress) return "PARTIALLY_DELIVERED";

  return "PENDING";
}

async function getAllocatedPendingQuantityForItem({ commandeItemId, excludeLineId, session }) {
  const filter = {
    commandeItem: commandeItemId,
    status: { $ne: "DELIVERED" },
    remainingQuantity: { $gt: 0 },
  };

  if (excludeLineId) {
    filter._id = { $ne: excludeLineId };
  }

  const pendingLines = await BonCommandeLine.find(filter)
    .select("remainingQuantity")
    .session(session);

  return pendingLines.reduce((sum, line) => sum + Number(line.remainingQuantity || 0), 0);
}

function enrichBonCommandeTotals(bonCommande) {
  const lines = Array.isArray(bonCommande?.lines) ? bonCommande.lines : [];
  let totalHT = 0;
  let tvaAmount = 0;

  lines.forEach((line) => {
    const quantity = Number(line?.requestedQuantity || 0);
    const unitPrice = Number(line?.commandeItem?.unitPrice || 0);
    const tvaRate = Number(
      line?.commandeItem?.product?.tvaRate ??
      line?.commandeItem?.product?.taxRate ??
      line?.commandeItem?.product?.rate ??
      0
    ) || 0;

    const lineHT = quantity * unitPrice;
    totalHT += lineHT;
    tvaAmount += lineHT * tvaRate;
  });

  totalHT = Number(totalHT.toFixed(2));
  tvaAmount = Number(tvaAmount.toFixed(2));

  const totalAmountTTC = Number((totalHT + tvaAmount).toFixed(2));
  const totalAmountDisplay = totalAmountTTC.toLocaleString("fr-TN", { style: "currency", currency: "TND" });

  if (bonCommande && typeof bonCommande.toObject === "function") {
    return {
      ...bonCommande.toObject(),
      totalHT,
      tvaAmount,
      totalAmountTTC,
      totalAmountDisplay,
    };
  }

  return {
    ...bonCommande,
    totalHT,
    tvaAmount,
    totalAmountTTC,
    totalAmountDisplay,
  };
}

async function createBonCommande(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { commandeId, date, note = "", lines } = req.body;
    if (!commandeId || !mongoose.Types.ObjectId.isValid(commandeId)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Valid commandeId is required" });
    }

    const commande = await Commande.findById(commandeId).session(session);
    if (!commande) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Commande not found" });
    }

    if (commande.status === "CANCELLED") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Cancelled commandes cannot generate bon de commande" });
    }

    const normalizedLines = normalizeLines(lines);
    if (normalizedLines.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: "At least one line is required" });
    }

    const bonNumber = await generateUniqueBonNumber(session);
    const [bonCommande] = await BonCommande.create(
      [
        {
          bonNumber,
          commande: commande._id,
          date,
          note,
          lines: [],
          createdBy: req.user.id,
        },
      ],
      { session }
    );

    const createdLines = [];

    for (const rawLine of normalizedLines) {
      const commandeItemId = rawLine.commandeItemId || rawLine.commandeItem;
      const requestedQuantity = Number(rawLine.quantity || rawLine.requestedQuantity);

      if (!commandeItemId || !mongoose.Types.ObjectId.isValid(commandeItemId)) {
        throw httpError(400, "Each line must include a valid commandeItemId");
      }
      if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
        throw httpError(400, "Each line quantity must be greater than 0");
      }

      const commandeItem = await CommandeItem.findById(commandeItemId).session(session);
      if (!commandeItem) {
        throw httpError(404, `Commande item not found: ${commandeItemId}`);
      }
      if (String(commandeItem.commande) !== String(commande._id)) {
        throw httpError(400, "All lines must belong to the selected commande");
      }

      const itemPendingQuantity = Number(
        commandeItem.pendingQuantity !== undefined
          ? commandeItem.pendingQuantity
          : Number(commandeItem.quantity || 0) - Number(commandeItem.deliveredQuantity || 0)
      );

      if (itemPendingQuantity <= 0) {
        throw httpError(400, "One line targets an already fully delivered commande item");
      }

      const allocatedPending = await getAllocatedPendingQuantityForItem({
        commandeItemId: commandeItem._id,
        session,
      });

      const maxAllowed = Math.max(itemPendingQuantity - allocatedPending, 0);
      if (requestedQuantity > maxAllowed) {
        throw httpError(
          400,
          `Requested quantity (${requestedQuantity}) exceeds remaining allocatable quantity (${maxAllowed})`
        );
      }

      const [line] = await BonCommandeLine.create(
        [
          {
            bonCommande: bonCommande._id,
            commandeItem: commandeItem._id,
            requestedQuantity,
            deliveredQuantity: 0,
            remainingQuantity: requestedQuantity,
            status: "PENDING",
          },
        ],
        { session }
      );

      createdLines.push(line);
    }

    bonCommande.lines = createdLines.map(line => line._id);
    bonCommande.status = computeBonStatus(createdLines);
    await bonCommande.save({ session });

    await session.commitTransaction();

    await logHistory({
      action: "BON_COMMANDE_CREATED",
      description: `Bon de commande ${bonCommande.bonNumber} created`,
      user: req.user.id,
      entityType: "BonCommande",
      entityId: bonCommande._id,
      metaData: { commandeId: String(commande._id), lines: createdLines.length },
    });
    await createNotificationsForRole("LOGISTICS_MANAGER", {
      type: "BON_COMMANDE_CREATED",
      title: "Nouveau bon de commande",
      message: `Le bon de commande ${bonCommande.bonNumber} vient d'être créé.`,
      entityType: "BonCommande",
      entityId: bonCommande._id,
      metadata: {
        bonNumber: bonCommande.bonNumber,
        commandeId: String(commande._id),
        lineCount: createdLines.length,
      },
      createdBy: req.user.id,
    });

    const populated = await BonCommande.findById(bonCommande._id)
      .populate("commande", "commandeNumber status client")
      .populate("createdBy", "firstName lastName email role")
      .populate({
        path: "lines",
        populate: {
          path: "commandeItem",
          populate: [
            { path: "product", select: "name reference tvaRate" },
            { path: "commande", select: "commandeNumber status" },
          ],
        },
      });

    return res.status(201).json(enrichBonCommandeTotals(populated));
  } catch (error) {
    await session.abortTransaction();
    return res.status(error.status || 500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

async function listBonCommandes(_req, res) {
  try {
    const list = await BonCommande.find()
      .populate("commande", "commandeNumber status client")
      .populate("createdBy", "firstName lastName email role")
      .populate({
        path: "lines",
        populate: {
          path: "commandeItem",
          populate: [
            { path: "product", select: "name reference tvaRate" },
            { path: "commande", select: "commandeNumber status" },
          ],
        },
      })
      .sort({ createdAt: -1 });

    return res.json(list.map(enrichBonCommandeTotals));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getBonCommandeById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid bon de commande id" });
    }

    const bonCommande = await BonCommande.findById(id)
      .populate("commande", "commandeNumber status client")
      .populate("createdBy", "firstName lastName email role")
      .populate({
        path: "lines",
        populate: {
          path: "commandeItem",
          populate: [
            { path: "product", select: "name reference tvaRate" },
            { path: "commande", select: "commandeNumber status" },
          ],
        },
      });

    if (!bonCommande) {
      return res.status(404).json({ message: "Bon de commande not found" });
    }

    return res.json(enrichBonCommandeTotals(bonCommande));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateBonCommande(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid bon de commande id" });
    }

    const bonCommande = await BonCommande.findById(id).session(session);
    if (!bonCommande) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Bon de commande not found" });
    }

    if (bonCommande.status === "DELIVERED" || bonCommande.status === "CANCELLED") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Delivered/cancelled bon de commande cannot be updated" });
    }

    if (req.body.date !== undefined) {
      bonCommande.date = req.body.date;
    }

    if (req.body.note !== undefined) {
      bonCommande.note = String(req.body.note || "").trim();
    }

    await bonCommande.save({ session });
    await session.commitTransaction();

    await logHistory({
      action: "BON_COMMANDE_UPDATED",
      description: `Bon de commande ${bonCommande.bonNumber} updated`,
      user: req.user.id,
      entityType: "BonCommande",
      entityId: bonCommande._id,
    });

    const populated = await BonCommande.findById(id)
      .populate("commande", "commandeNumber status client")
      .populate("createdBy", "firstName lastName email role")
      .populate({
        path: "lines",
        populate: {
          path: "commandeItem",
          populate: [
            { path: "product", select: "name reference tvaRate" },
            { path: "commande", select: "commandeNumber status" },
          ],
        },
      });

    return res.json(populated);
  } catch (error) {
    await session.abortTransaction();
    return res.status(error.status || 500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

async function updateBonCommandeLineQuantity(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id, lineId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(lineId)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid bon de commande id or line id" });
    }

    const bonCommande = await BonCommande.findById(id).session(session);
    if (!bonCommande) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Bon de commande not found" });
    }

    if (bonCommande.status === "DELIVERED" || bonCommande.status === "CANCELLED") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Delivered/cancelled bon de commande cannot be updated" });
    }

    const line = await BonCommandeLine.findOne({ _id: lineId, bonCommande: bonCommande._id }).session(session);
    if (!line) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Bon de commande line not found" });
    }

    const nextRequestedQuantity = Number(req.body.quantity);
    if (!Number.isFinite(nextRequestedQuantity) || nextRequestedQuantity <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: "quantity must be greater than 0" });
    }

    if (nextRequestedQuantity < Number(line.deliveredQuantity || 0)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "quantity cannot be lower than deliveredQuantity" });
    }

    const commandeItem = await CommandeItem.findById(line.commandeItem).session(session);
    if (!commandeItem) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Commande item not found" });
    }

    const itemPendingQuantity = Number(
      commandeItem.pendingQuantity !== undefined
        ? commandeItem.pendingQuantity
        : Number(commandeItem.quantity || 0) - Number(commandeItem.deliveredQuantity || 0)
    );

    const allocatedPending = await getAllocatedPendingQuantityForItem({
      commandeItemId: commandeItem._id,
      excludeLineId: line._id,
      session,
    });

    const maxAllowed = Math.max(itemPendingQuantity - allocatedPending + Number(line.remainingQuantity || 0), 0);
    if (nextRequestedQuantity > maxAllowed) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `Requested quantity (${nextRequestedQuantity}) exceeds remaining allocatable quantity (${maxAllowed})`,
      });
    }

    line.requestedQuantity = nextRequestedQuantity;
    line.remainingQuantity = Math.max(nextRequestedQuantity - Number(line.deliveredQuantity || 0), 0);
    line.status = computeLineStatus(line.requestedQuantity, line.deliveredQuantity);
    await line.save({ session });

    const allLines = await BonCommandeLine.find({ bonCommande: bonCommande._id }).session(session);
    bonCommande.status = computeBonStatus(allLines, bonCommande.status);
    await bonCommande.save({ session });

    await session.commitTransaction();

    await logHistory({
      action: "BON_COMMANDE_LINE_UPDATED",
      description: `Line ${line._id} updated on bon ${bonCommande.bonNumber}`,
      user: req.user.id,
      entityType: "BonCommandeLine",
      entityId: line._id,
      metaData: { bonCommandeId: String(bonCommande._id) },
    });

    const populated = await BonCommande.findById(id)
      .populate("commande", "commandeNumber status client")
      .populate("createdBy", "firstName lastName email role")
      .populate({
        path: "lines",
        populate: {
          path: "commandeItem",
          populate: [
            { path: "product", select: "name reference tvaRate" },
            { path: "commande", select: "commandeNumber status" },
          ],
        },
      });

    return res.json(populated);
  } catch (error) {
    await session.abortTransaction();
    return res.status(error.status || 500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

module.exports = {
  createBonCommande,
  listBonCommandes,
  getBonCommandeById,
  updateBonCommande,
  updateBonCommandeLineQuantity,
};
