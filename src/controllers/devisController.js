const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const Devis = require("../models/Devis");
const DevisItem = require("../models/DevisItem");
const Commande = require("../models/Commande");
const CommandeItem = require("../models/CommandeItem");
const Client = require("../models/Client");
const Product = require("../models/Product");
const logHistory = require("../utils/historyLogger");
const sendEmail = require("../utils/mailer");
const { computeCommercialTotals } = require("../utils/commercialTotals");
const fs = require("fs");
const os = require("os");
const path = require("path");

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

function mapToDevisItemDoc(item) {
  return {
    product: item.product || item.productId,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
  };
}

function buildQuoteNumber() {
  const stamp = new Date().toISOString().replace(/[TZ:\-.]/g, "").slice(0, 14);
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `DEV-${stamp}-${random}`;
}

function resolveClientField(client, ...keys) {
  for (const key of keys) {
    if (client && client[key] !== undefined && client[key] !== null && String(client[key]).trim() !== "") {
      return client[key];
    }
  }
  return "-";
}

function getAnalyticsWindow(period = "year") {
  const normalized = String(period || "year").toLowerCase();
  const now = new Date();
  const start = new Date(now);

  switch (normalized) {
    case "day":
      start.setDate(start.getDate() - 14);
      break;
    case "month":
      start.setMonth(start.getMonth() - 1);
      break;
    case "quarter":
      start.setMonth(start.getMonth() - 3);
      break;
    case "year":
    default:
      start.setFullYear(start.getFullYear() - 1);
      break;
  }

  return { start, end: now };
}

function formatAnalyticsLabel(date, period = "year") {
  if (period === "day") {
    return date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
    });
  }

  if (period === "month") {
    return date.toLocaleDateString("fr-FR", {
      month: "short",
      year: "numeric",
    });
  }

  return String(date.getFullYear());
}

function buildBucketKey(date, period = "year") {
  if (period === "day") {
    return date.toISOString().slice(0, 10);
  }

  if (period === "month") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  return String(date.getFullYear());
}

function getQuoteLifecycleStatus(devis) {
  const status = String(devis?.status || "DRAFT").toUpperCase();
  const isConverted = Boolean(devis?.commande || devis?.convertedAt);

  return {
    status,
    isConverted,
    isSent: status === "SENT",
    isAccepted: status === "ACCEPTED",
    isRejected: status === "REJECTED",
  };
}

async function fetchDevisAnalytics({ period = "year" } = {}) {
  const { start, end } = getAnalyticsWindow(period);
  const query = {
    createdAt: {
      $gte: start,
      $lte: end,
    },
  };

  const devisList = await Devis.find(query)
    .select("status commande convertedAt createdAt")
    .lean();

  return devisList;
}

async function getDevisFunnel(req, res) {
  try {
    const devisList = await fetchDevisAnalytics({ period: req.query.period || "year" });
    const totals = devisList.reduce(
      (accumulator, devis) => {
        const lifecycle = getQuoteLifecycleStatus(devis);

        accumulator.totalQuotes += 1;
        if (lifecycle.isSent) accumulator.sentCount += 1;
        if (lifecycle.isAccepted) accumulator.acceptedCount += 1;
        if (lifecycle.isConverted) accumulator.convertedCount += 1;
        if (lifecycle.isRejected) accumulator.rejectedCount += 1;

        return accumulator;
      },
      {
        totalQuotes: 0,
        sentCount: 0,
        acceptedCount: 0,
        convertedCount: 0,
        rejectedCount: 0,
      },
    );

    const funnel = [
      { name: "Devis créés", value: totals.totalQuotes },
      { name: "Devis envoyés", value: totals.sentCount },
      { name: "Devis acceptés", value: totals.acceptedCount },
      { name: "Devis convertis", value: totals.convertedCount },
    ].map((stage, index, stages) => {
      const firstStageValue = stages[0]?.value || 0;
      return {
        ...stage,
        rate: firstStageValue > 0 ? Number(((stage.value / firstStageValue) * 100).toFixed(1)) : 0,
      };
    });

    return res.json({
      data: funnel,
      summary: {
        ...totals,
        sentRate: totals.totalQuotes > 0 ? Number(((totals.sentCount / totals.totalQuotes) * 100).toFixed(1)) : 0,
        acceptanceRate: totals.sentCount > 0 ? Number(((totals.acceptedCount / totals.sentCount) * 100).toFixed(1)) : 0,
        conversionRate: totals.sentCount > 0 ? Number(((totals.convertedCount / totals.sentCount) * 100).toFixed(1)) : 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getDevisConversionCurve(req, res) {
  try {
    const period = String(req.query.period || "year").toLowerCase();
    const devisList = await fetchDevisAnalytics({ period });
    const bucketMap = new Map();

    devisList.forEach((devis) => {
      const date = new Date(devis?.createdAt || new Date());
      const key = buildBucketKey(date, period);
      const label = formatAnalyticsLabel(date, period);
      const lifecycle = getQuoteLifecycleStatus(devis);

      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          key,
          name: label,
          sent: 0,
          accepted: 0,
          rejected: 0,
        });
      }

      const bucket = bucketMap.get(key);
      if (lifecycle.status === "SENT") bucket.sent += 1;
      if (lifecycle.status === "ACCEPTED") bucket.accepted += 1;
      if (lifecycle.status === "REJECTED") bucket.rejected += 1;
    });

    const series = Array.from(bucketMap.values())
      .sort((left, right) => String(left.key).localeCompare(String(right.key)))
      .map((bucket) => ({
        name: bucket.name,
        sent: bucket.sent,
        accepted: bucket.accepted,
        rejected: bucket.rejected,
      }));

    const summary = series.reduce(
      (accumulator, bucket) => ({
        sentCount: accumulator.sentCount + bucket.sent,
        acceptedCount: accumulator.acceptedCount + bucket.accepted,
        rejectedCount: accumulator.rejectedCount + bucket.rejected,
      }),
      { sentCount: 0, acceptedCount: 0, rejectedCount: 0 },
    );

    return res.json({
      data: series,
      summary: {
        ...summary,
        acceptanceRate: summary.sentCount > 0 ? Number(((summary.acceptedCount / summary.sentCount) * 100).toFixed(1)) : 0,
        rejectionRate: summary.sentCount > 0 ? Number(((summary.rejectedCount / summary.sentCount) * 100).toFixed(1)) : 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function generateUniqueQuoteNumber(session) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const quoteNumber = buildQuoteNumber();
    const exists = await Devis.findOne({ quoteNumber }).session(session);
    if (!exists) return quoteNumber;
  }
  throw httpError(500, "Failed to generate unique quote number");
}

async function createDevisItemsFromPayload(items, devisId, session) {
  const docs = items.map(item => ({ ...mapToDevisItemDoc(item), devis: devisId }));
  if (docs.length === 0) return [];
  return DevisItem.create(docs, { session, ordered: true });
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

async function createCommandeFromDevis({ devis, userId, session }) {
  if (devis.commande) return null;
  if (!Array.isArray(devis.items) || devis.items.length === 0) {
    throw httpError(400, "Cannot convert quote without items");
  }

  const devisItems = await DevisItem.find({ _id: { $in: devis.items } }).session(session);
  if (devisItems.length === 0) {
    throw httpError(400, "Cannot convert quote without items");
  }

  const totals = devis.totalAmountTTC !== undefined && devis.totalAmountTTC !== null
    ? {
        totalHT: Number(devis.totalHT || 0),
        tvaAmount: Number(devis.tvaAmount || 0),
        totalAmountTTC: Number(devis.totalAmountTTC || devis.totalAmount || 0),
      }
    : await computeCommercialTotals(
        devisItems.map((item) => ({ product: item.product, quantity: item.quantity, unitPrice: item.unitPrice })),
        { session, priceField: "unitPrice" },
      );
  const [commande] = await Commande.create(
    [
      {
        date: new Date(),
        status: "CONFIRMED",
        client: devis.client,
        managedBy: userId,
        items: [],
        totalHT: totals.totalHT,
        tvaAmount: totals.tvaAmount,
        totalAmount: totals.totalAmountTTC,
        totalAmountTTC: totals.totalAmountTTC,
        currencyCode: String(devis.currencyCode || "TND").toUpperCase(),
        exchangeRateToTnd: Number(devis.exchangeRateToTnd || 1) || 1,
        originalCurrencyTotals: devis.originalCurrencyTotals || null,
        commandeNumber: `CMD-${new Date().toISOString().replace(/[TZ:\-.]/g, "").slice(0, 14)}-${Math.floor(Math.random() * 9000) + 1000}`,
      },
    ],
    { session }
  );

  const createdCommandeItems = await CommandeItem.create(
    devisItems.map(item => ({
      commande: commande._id,
      product: item.product,
      quantity: Number(item.quantity),
      orderedQuantity: Number(item.quantity),
      deliveredQuantity: 0,
      pendingQuantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    })),
    { session, ordered: true }
  );

  commande.items = createdCommandeItems.map(item => item._id);
  await commande.save({ session });

  devis.commande = commande._id;
  devis.convertedAt = new Date();
  await devis.save({ session });

  return commande;
}

async function createDevis(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { date, status, file, clientId, items, currencyCode, exchangeRateToTnd, originalCurrencyTotals } = req.body;
    console.log(`[DEVIS][CREATE] Requete creation statut=${status || "(vide)"} clientId=${clientId || "(vide)"}`);
    const normalizedItems = normalizeIncomingItems(items);
    if (!clientId) {
      await session.abortTransaction();
      return res.status(400).json({ message: "clientId is required" });
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

    const quoteNumber = await generateUniqueQuoteNumber(session);
    const [devis] = await Devis.create(
      [
        {
          quoteNumber,
          date,
          status,
          file,
          client: clientId,
          createdBy: req.user.id,
          items: [],
          totalHT: totals.totalHT,
          tvaAmount: totals.tvaAmount,
          totalAmount: totals.totalAmountTTC,
          totalAmountTTC: totals.totalAmountTTC,
          currencyCode: String(currencyCode || "TND").toUpperCase(),
          exchangeRateToTnd: Number(exchangeRateToTnd || 1) || 1,
          originalCurrencyTotals: originalCurrencyTotals || null,
           commandeNumber: `CMD-${new Date().toISOString().replace(/[TZ:\-.]/g, "").slice(0, 14)}-${Math.floor(Math.random() * 9000) + 1000}`,
        },
      ],
      { session }
    );

    const createdDevisItems = await createDevisItemsFromPayload(normalizedItems, devis._id, session);
    const devisItemIds = createdDevisItems.map(item => item._id);
    if (devisItemIds.length > 0) {
      devis.items = devisItemIds;
      await devis.save({ session });
    }

    let createdCommande = null;
    if (devis.status === "ACCEPTED") {
      createdCommande = await createCommandeFromDevis({ devis, userId: req.user.id, session });
    }

    const shouldSendDevisEmail = devis.status === "SENT";

    await session.commitTransaction();

    await logHistory({
      action: "DEVIS_CREATED",
      description: `Devis ${devis.quoteNumber} created`,
      user: req.user.id,
      entityType: "Devis",
      entityId: devis._id,
      metaData: { totalHT: totals.totalHT, tvaAmount: totals.tvaAmount, totalAmountTTC: totals.totalAmountTTC, status: devis.status, itemCount: devisItemIds.length },
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
      .populate("client", "name phone address nom adresse telephone email")
      .populate("createdBy", "firstName lastName email role")
      .populate({ path: "items", populate: { path: "product", select: "name reference" } })
      .populate("commande");

    // Schedule email sending in background to avoid blocking the response and the DB transaction
    if (shouldSendDevisEmail) {
      setImmediate(async () => {
        try {
          
          const devisForEmail = await Devis.findById(devis._id)
            .populate("client", "nom name telephone phone adresse address email")
            .populate({ path: "items", populate: { path: "product", select: "name reference" } });

          const pdfBuffer = await buildDevisPdfBuffer(devisForEmail);

          await sendDevisSentEmail(devisForEmail, pdfBuffer);
          console.log(`[DEVIS][MAIL_BG] Email sent for devis=${devis.quoteNumber} id=${devis._id}`);
        } catch (err) {
          console.error(`[DEVIS][MAIL_BG] Failed to send email for devis=${devis._id}: ${err.message}`);
        }
      });
    }

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
      .populate({ path: "items", populate: { path: "product", select: "name reference" } })
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
      .populate("commande")
      .populate({ path: "items", populate: { path: "product", select: "name reference" } });
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

    const payload = { ...req.body };
    if (payload.quoteNumber !== undefined) {
      await session.abortTransaction();
      return res.status(400).json({ message: "quoteNumber is auto-generated and cannot be updated" });
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
      nextItemsDetailed = normalizedItems.map(mapToDevisItemDoc);
    }

    const devis = await Devis.findById(id).session(session);
    if (!devis) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Devis not found" });
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

    if (devis.commande && (payload.items !== undefined || payload.client || payload.totalAmount !== undefined || payload.totalAmountTTC !== undefined || payload.totalHT !== undefined || payload.tvaAmount !== undefined)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Cannot change client/items/total after quote conversion" });
    }

    if (devis.commande && payload.status && payload.status !== "ACCEPTED") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Cannot move status away from ACCEPTED after conversion" });
    }

    if (payload.items !== undefined) {
      const oldItemIds = [...(devis.items || [])];
      const createdItems = await createDevisItemsFromPayload(nextItemsDetailed, devis._id, session);
      const createdItemIds = createdItems.map(item => item._id);

      if (oldItemIds.length > 0) {
        await DevisItem.deleteMany({ _id: { $in: oldItemIds } }).session(session);
      }

      payload.items = createdItemIds;
    }

    const previousStatus = devis.status;

    Object.assign(devis, payload);
    await devis.save({ session });

    let createdCommande = null;
    if (!devis.commande && devis.status === "ACCEPTED") {
      createdCommande = await createCommandeFromDevis({ devis, userId: req.user.id, session });
    }

    const shouldSendDevisEmail = previousStatus !== "SENT" && devis.status === "SENT";

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
      .populate("client", "name phone address nom adresse telephone email")
      .populate("createdBy", "firstName lastName email role")
      .populate("commande")
      .populate({ path: "items", populate: { path: "product", select: "name reference" } });

    if (shouldSendDevisEmail) {
      setImmediate(async () => {
        try {
          console.log(`[DEVIS][MAIL_BG] Preparing email for updated devis=${devis.quoteNumber} id=${devis._id}`);
          const devisForEmail = await Devis.findById(devis._id)
            .populate("client", "nom name telephone phone adresse address email")
            .populate({ path: "items", populate: { path: "product", select: "name reference" } });

          const pdfBuffer = await buildDevisPdfBuffer(devisForEmail);
          await sendDevisSentEmail(devisForEmail, pdfBuffer);
          console.log(`[DEVIS][MAIL_BG] Email sent for updated devis=${devis.quoteNumber} id=${devis._id}`);
        } catch (err) {
          console.error(`[DEVIS][MAIL_BG] Failed to send email for updated devis=${devis._id}: ${err.message}`);
        }
      });
    }

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

    if (Array.isArray(devis.items) && devis.items.length > 0) {
      await DevisItem.deleteMany({ _id: { $in: devis.items } }).session(session);
    }

    await Devis.deleteOne({ _id: id }).session(session);
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
    return res.status(error.status || 500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

async function buildDevisPdfBuffer(devis) {
  const devisLines = Array.isArray(devis.items) ? devis.items : [];
  const totals = await computeCommercialTotals(
    devisLines.map((item) => ({
      product: item?.product?._id || item?.product?.id || item?.product,
      quantity: item?.quantity,
      unitPrice: item?.unitPrice,
    })),
    { priceField: "unitPrice" },
  ).catch(() => ({
    totalHT: Number(devis.totalHT || 0),
    tvaAmount: Number(devis.tvaAmount || 0),
    totalAmountTTC: Number(devis.totalAmountTTC || devis.totalAmount || 0),
  }));

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "A4" });
    const chunks = [];

    doc.on("data", chunk => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const colors = {
      primary: "#0f5e96",
      accent: "#0d3b66",
      light: "#f5f8fc",
      border: "#d9e2ef",
      text: "#1f2937",
      muted: "#6b7280",
      success: "#15803d",
    };

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const contentLeft = doc.page.margins.left;

    const displayCurrencyCode = String(devis.currencyCode || "TND").toUpperCase();
    const exchangeRate = Number(devis.exchangeRateToTnd || 1) || 1;
    const hasCurrencyConversion = displayCurrencyCode !== "TND" && Number.isFinite(exchangeRate) && exchangeRate > 0;
    const convertForDisplay = (value) => {
      const numericValue = Number(value || 0);
      if (!hasCurrencyConversion) return numericValue;
      return Number((numericValue / exchangeRate).toFixed(3));
    };
    const money = (value) => Number(value || 0).toLocaleString("fr-TN", { style: "currency", currency: displayCurrencyCode });

    const displayTotals = hasCurrencyConversion && devis.originalCurrencyTotals
      ? {
          totalHT: Number(devis.originalCurrencyTotals.totalHT || 0),
          tvaAmount: Number(devis.originalCurrencyTotals.tvaAmount || 0),
          totalAmountTTC: Number(devis.originalCurrencyTotals.totalAmountTTC || devis.originalCurrencyTotals.totalAmount || 0),
        }
      : {
          totalHT: convertForDisplay(totals.totalHT),
          tvaAmount: convertForDisplay(totals.tvaAmount),
          totalAmountTTC: convertForDisplay(totals.totalAmountTTC || totals.totalHT + totals.tvaAmount),
        };

    const drawHeader = () => {
      doc.save();
      doc.rect(contentLeft, 22, pageWidth, 70).fill(colors.primary);
      doc.fillColor("white").fontSize(22).font("Helvetica-Bold").text("DEVIS", contentLeft + 18, 40);
      doc.fontSize(10).font("Helvetica").text(`Reference: ${devis.quoteNumber || "-"}`, contentLeft + 18, 66);
      doc.restore();
      doc.moveDown(5.2);
    };

    const drawSectionTitle = (title, y) => {
      doc.save();
      doc.roundedRect(contentLeft, y, pageWidth, 22, 4).fill(colors.light);
      doc.fillColor(colors.accent).fontSize(11).font("Helvetica-Bold").text(title, contentLeft + 10, y + 6);
      doc.restore();
    };

    const drawInfoCard = (x, y, width, title, lines) => {
      const height = 68;
      doc.save();
      doc.roundedRect(x, y, width, height, 6).fillAndStroke("white", colors.border);
      doc.roundedRect(x, y, width, 20, 6).fill(colors.light);
      doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(10).text(title, x + 10, y + 6);
      doc.fillColor(colors.text).font("Helvetica").fontSize(9);
      lines.forEach((line, index) => {
        doc.text(line, x + 10, y + 26 + (index * 14), { width: width - 20 });
      });
      doc.restore();
    };

    const drawTableHeader = (y, widths) => {
      const headers = ["#", "Produit", "Ref", "Qte", "PU", "Total"];
      const xPositions = [contentLeft, contentLeft + widths[0], contentLeft + widths[0] + widths[1], contentLeft + widths[0] + widths[1] + widths[2], contentLeft + widths[0] + widths[1] + widths[2] + widths[3], contentLeft + widths[0] + widths[1] + widths[2] + widths[3] + widths[4]];

      doc.save();
      doc.rect(contentLeft, y, pageWidth, 22).fill(colors.accent);
      doc.fillColor("white").font("Helvetica-Bold").fontSize(9);
      headers.forEach((header, index) => {
        doc.text(header, xPositions[index] + 6, y + 7, { width: widths[index] - 12, align: index >= 3 ? "right" : "left" });
      });
      doc.restore();
    };

    drawHeader();

    const devisDate = devis.date ? new Date(devis.date).toLocaleDateString("fr-FR") : "-";
    const clientName = resolveClientField(devis.client, "nom", "name");
    const clientPhone = resolveClientField(devis.client, "telephone", "phone");
    const clientAddress = resolveClientField(devis.client, "adresse", "address");

    const statusLabel = String(devis.status || "-").toUpperCase();
    const statusColor = statusLabel === "ACCEPTED" ? colors.success : statusLabel === "REJECTED" ? "#b91c1c" : statusLabel === "SENT" ? colors.primary : colors.muted;

    drawInfoCard(contentLeft, 110, (pageWidth - 12) / 2, "Informations devis", [
      `Numero: ${devis.quoteNumber || "-"}`,
      `Date: ${devisDate}`,
      `Statut: ${statusLabel}`,
      `Monnaie: ${displayCurrencyCode}`,
    ]);

    drawInfoCard(contentLeft + (pageWidth + 12) / 2, 110, (pageWidth - 12) / 2, "Client", [
      `Nom: ${clientName}`,
      `Telephone: ${clientPhone}`,
      `Adresse: ${clientAddress}`,
    ]);

    doc.save();
    doc.fillColor(statusColor).font("Helvetica-Bold").fontSize(10).text(`Statut: ${statusLabel}`, contentLeft, 186, { align: "right" });
    doc.restore();

    drawSectionTitle("Lignes du devis", 212);

    const widths = [28, 210, 72, 42, 72, 72];
    let currentY = 238;

    drawTableHeader(currentY, widths);
    currentY += 22;

    if (devisLines.length === 0) {
      doc.fillColor(colors.muted).fontSize(10).font("Helvetica").text("Aucune ligne de devis.", contentLeft, currentY + 10);
    } else {
      devisLines.forEach((item, index) => {
        const productName = item.product?.name || "Produit";
        const productRef = item.product?.reference || "-";
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(item.unitPrice || 0);
        const lineHT = quantity * unitPrice;
        const unitPriceDisplay = convertForDisplay(unitPrice);
        const lineHTDisplay = convertForDisplay(lineHT);

        const rowHeight = 24;
        if (currentY + rowHeight > doc.page.height - 120) {
          doc.addPage();
          drawHeader();
          drawSectionTitle("Lignes du devis", 70);
          currentY = 96;
          drawTableHeader(currentY, widths);
          currentY += 22;
        }

        doc.save();
        doc.rect(contentLeft, currentY, pageWidth, rowHeight).fill(index % 2 === 0 ? "white" : colors.light);
        doc.restore();

        const cells = [String(index + 1), productName, productRef, String(quantity), money(unitPriceDisplay), money(lineHTDisplay)];
        const xPositions = [contentLeft, contentLeft + widths[0], contentLeft + widths[0] + widths[1], contentLeft + widths[0] + widths[1] + widths[2], contentLeft + widths[0] + widths[1] + widths[2] + widths[3], contentLeft + widths[0] + widths[1] + widths[2] + widths[3] + widths[4]];

        doc.fillColor(colors.text).fontSize(9).font("Helvetica");
        cells.forEach((cell, cellIndex) => {
          const align = cellIndex >= 3 ? "right" : "left";
          doc.text(cell, xPositions[cellIndex] + 6, currentY + 7, {
            width: widths[cellIndex] - 12,
            align,
            ellipsis: true,
          });
        });

        currentY += rowHeight;
      });
    }

    currentY += 14;
    const totalHT = Number(displayTotals.totalHT || 0);
    const totalTVA = Number(displayTotals.tvaAmount || 0);
    const totalTTC = Number(displayTotals.totalAmountTTC || totalHT + totalTVA);
    doc.save();
    doc.roundedRect(contentLeft + pageWidth - 210, currentY, 210, 76, 6).fillAndStroke(colors.light, colors.border);
    doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(10).text("Montant HT", contentLeft + pageWidth - 198, currentY + 10, { width: 90, align: "left" });
    doc.fillColor(colors.primary).font("Helvetica-Bold").fontSize(10).text(money(totalHT), contentLeft + pageWidth - 110, currentY + 10, { width: 96, align: "right" });
    doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(10).text("TVA", contentLeft + pageWidth - 198, currentY + 28, { width: 90, align: "left" });
    doc.fillColor(colors.primary).font("Helvetica-Bold").fontSize(10).text(money(totalTVA), contentLeft + pageWidth - 110, currentY + 28, { width: 96, align: "right" });
    doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(10).text("Total TTC", contentLeft + pageWidth - 198, currentY + 48, { width: 90, align: "left" });
    doc.fillColor(colors.primary).font("Helvetica-Bold").fontSize(15).text(money(totalTTC), contentLeft + pageWidth - 110, currentY + 44, { width: 96, align: "right" });
    doc.restore();

    currentY += 100;

    if (currentY + 92 > doc.page.height - 60) {
      doc.addPage();
      drawHeader();
      currentY = 80;
    }

    const blockWidth = (pageWidth - 12) / 2;

    doc.save();
    doc.roundedRect(contentLeft, currentY, blockWidth, 86, 6).fillAndStroke("white", colors.border);
    doc.roundedRect(contentLeft, currentY, blockWidth, 20, 6).fill(colors.light);
    doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(10).text("Cachet de l'entreprise", contentLeft + 10, currentY + 6);
    doc.fillColor(colors.muted).font("Helvetica").fontSize(9).text("Espace reserve au cachet / signature du vendeur", contentLeft + 10, currentY + 32, { width: blockWidth - 20, align: "center" });
    doc.moveTo(contentLeft + 20, currentY + 64).lineTo(contentLeft + blockWidth - 20, currentY + 64).strokeColor(colors.border).lineWidth(1).stroke();
    doc.restore();

    doc.save();
    doc.roundedRect(contentLeft + blockWidth + 12, currentY, blockWidth, 86, 6).fillAndStroke("white", colors.border);
    doc.roundedRect(contentLeft + blockWidth + 12, currentY, blockWidth, 20, 6).fill(colors.light);
    doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(10).text("Signature client", contentLeft + blockWidth + 22, currentY + 6);
    doc.fillColor(colors.muted).font("Helvetica").fontSize(9).text("Lu et approuve", contentLeft + blockWidth + 22, currentY + 32, { width: blockWidth - 20, align: "center" });
    doc.moveTo(contentLeft + blockWidth + 32, currentY + 64).lineTo(contentLeft + pageWidth - 20, currentY + 64).strokeColor(colors.border).lineWidth(1).stroke();
    doc.restore();

    doc.moveDown(3);
    doc
      .fontSize(10)
      .fillColor("gray")
      .text(`Document genere le ${new Date().toLocaleString("fr-FR")}`, { align: "right" });

    doc.end();
  });
}

async function sendDevisSentEmail(devis, pdfBuffer) {
  const clientEmail = devis.client?.email;
  const clientName = resolveClientField(devis.client, "nom", "name");

  if (!clientEmail) {
    console.warn(
      `[DEVIS][MAIL] Echec envoi: email client manquant pour devis=${devis.quoteNumber} id=${devis._id}`
    );
    throw new Error("Client email is missing");
  }

  console.log(
    `[DEVIS][MAIL] Tentative envoi email devis=${devis.quoteNumber} id=${devis._id} to=${clientEmail}`
  );

  try {
    await sendEmail({
      mail: clientEmail,
      subject: `Devis ${devis.quoteNumber} envoye`,
      content: `Bonjour ${clientName},\n\nVeuillez trouver en piece jointe votre devis ${devis.quoteNumber}.\n\nCordialement,\nService commercial`,
      html: `
        <p>Bonjour <strong>${clientName}</strong>,</p>
        <p>Veuillez trouver en piece jointe votre devis <strong>${devis.quoteNumber}</strong>.</p>
        <p>Cordialement,<br/>Service commercial</p>
      `,
      attachments: [
        {
          filename: `devis-${devis.quoteNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    console.log(
      `[DEVIS][MAIL] Envoi reussi pour devis=${devis.quoteNumber} id=${devis._id} to=${clientEmail}`
    );
  } catch (error) {
    console.error(
      `[DEVIS][MAIL] Echec envoi pour devis=${devis.quoteNumber} id=${devis._id} to=${clientEmail}: ${error.message}`
    );
    throw error;
  }
}

async function getDevisPdf(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid devis id" });
    }

    const devis = await Devis.findById(id)
      .populate("client", "nom name telephone phone adresse address email")
      .populate({ path: "items", populate: { path: "product", select: "name reference" } });

    if (!devis) {
      return res.status(404).json({ message: "Devis not found" });
    }

    const pdfBuffer = await buildDevisPdfBuffer(devis);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=devis-${devis.quoteNumber || id}.pdf`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createDevis,
  listDevis,
  getDevisById,
  updateDevis,
  deleteDevis,
  getDevisPdf,
  getDevisFunnel,
  getDevisConversionCurve,
};
