const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const Livraison = require("../models/Livraison");
const Transporter = require("../models/Transporter");
const Commande = require("../models/Commande");
const CommandeItem = require("../models/CommandeItem");
const BonCommande = require("../models/BonCommande");
const BonCommandeLine = require("../models/BonCommandeLine");
const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");
const Facture = require("../models/Facture");
const FactureItem = require("../models/FactureItem");
const cloudinary = require("../config/cloudinary");
const logHistory = require("../utils/historyLogger");
const { notifyLowStockIfNeeded } = require("../utils/notificationService");

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeIdArray(rawIds, fieldName) {
  if (rawIds === undefined || rawIds === null) return [];

  let parsed = rawIds;
  if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    if (trimmed.startsWith("[")) {
      try {
        parsed = JSON.parse(trimmed);
      } catch (_error) {
        throw httpError(400, `${fieldName} must be a valid JSON array`);
      }
    } else {
      parsed = [trimmed];
    }
  }

  if (
    Array.isArray(parsed) &&
    parsed.length === 1 &&
    typeof parsed[0] === "string" &&
    parsed[0].trim().startsWith("[")
  ) {
    try {
      parsed = JSON.parse(parsed[0]);
    } catch (_error) {
      throw httpError(400, `${fieldName} must be a valid array`);
    }
  }

  if (!Array.isArray(parsed)) {
    throw httpError(400, `${fieldName} must be an array`);
  }

  const unique = [...new Set(parsed.map(id => String(id)))];
  for (const id of unique) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw httpError(400, `Invalid id in ${fieldName}: ${id}`);
    }
  }

  return unique;
}

function normalizeSingleId(rawId, fieldName) {
  if (rawId === undefined || rawId === null || String(rawId).trim() === "") return null;
  const value = String(rawId).trim();
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw httpError(400, `Invalid ${fieldName}`);
  }
  return value;
}

function buildDeliveryNumber() {
  const stamp = new Date().toISOString().replace(/[TZ:\-.]/g, "").slice(0, 14);
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `LIV-${stamp}-${random}`;
}

async function generateUniqueDeliveryNumber(session) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const deliveryNumber = buildDeliveryNumber();
    const exists = await Livraison.findOne({ deliveryNumber }).session(session);
    if (!exists) return deliveryNumber;
  }
  throw httpError(500, "Failed to generate unique delivery number");
}

function buildInvoiceNumber() {
  const stamp = new Date().toISOString().replace(/[TZ:\-.]/g, "").slice(0, 14);
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `FAC-${stamp}-${random}`;
}

function enrichLivraisonTotals(livraison) {
  const rawLines = Array.isArray(livraison?.bonCommandeLines) && livraison.bonCommandeLines.length > 0
    ? livraison.bonCommandeLines
    : Array.isArray(livraison?.commandeItems)
      ? livraison.commandeItems
      : [];

  let totalHT = 0;
  let tvaAmount = 0;

  rawLines.forEach((line) => {
    const sourceItem = line?.commandeItem || line || {};

    const safeNumber = (v) => {
      if (v === null || v === undefined) return 0;
      if (typeof v === "number") return v;
      // replace comma decimals like "1,23" => "1.23"
      const s = String(v).replace(/,/g, ".").trim();
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };

    const quantity = safeNumber(line?.deliveredQuantity ?? line?.requestedQuantity ?? sourceItem?.orderedQuantity ?? sourceItem?.quantity ?? 0);
    const unitPrice = safeNumber(sourceItem?.unitPrice ?? sourceItem?.salePriceHT ?? sourceItem?.purchasePriceHT ?? 0);
    const productObj = sourceItem?.product || {};
    let tvaRate = safeNumber(productObj?.tvaRate ?? productObj?.taxRate ?? productObj?.rate ?? 0);

    // Detect if unitPrice is already TTC by comparing with product known TTC price
    const knownTtc = safeNumber(productObj?.salePriceTTC ?? productObj?.purchasePriceTTC ?? 0);
    const unitIsTTC = knownTtc > 0 && Math.abs(unitPrice - knownTtc) < 0.01 && tvaRate > 0;

    let lineHT = 0;
    let lineTVA = 0;

    if (unitIsTTC && tvaRate > 0) {
      const unitHT = unitPrice / (1 + tvaRate);
      lineHT = quantity * unitHT;
      lineTVA = lineHT * tvaRate;
    } else {
      lineHT = quantity * unitPrice;
      lineTVA = lineHT * tvaRate;
    }

    totalHT += lineHT;
    tvaAmount += lineTVA;
  });

  totalHT = Number(totalHT.toFixed(2));
  tvaAmount = Number(tvaAmount.toFixed(2));

  const totalAmountTTC = Number((totalHT + tvaAmount).toFixed(2));
  const totalAmountDisplay = totalAmountTTC.toLocaleString("fr-TN", { style: "currency", currency: "TND" });

  if (livraison && typeof livraison.toObject === "function") {
    return {
      ...livraison.toObject(),
      totalHT,
      tvaAmount,
      totalAmountTTC,
      totalAmountDisplay,
    };
  }

  return {
    ...livraison,
    totalHT,
    tvaAmount,
    totalAmountTTC,
    totalAmountDisplay,
  };
}

function buildDeliveryPdfBuffer(livraison) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks = [];

    doc.on("data", chunk => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(18).text("Bon de livraison", { align: "center" });
    doc.moveDown(1);

    const deliveryDate = livraison.date ? new Date(livraison.date).toLocaleDateString("fr-FR") : "-";

    doc.fontSize(11).text(`Numero: ${livraison.deliveryNumber || "-"}`);
    doc.text(`Date: ${deliveryDate}`);
    doc.text(`Statut: ${livraison.status || "-"}`);
    doc.text(
      `Transporteur: ${livraison.transporter?.name || "-"} (${livraison.transporter?.plateNumber || "-"})`
    );
    if (livraison.note) {
      doc.text(`Note: ${livraison.note}`);
    }
    doc.moveDown(1);

    doc.fontSize(12).text("Lignes livrees", { underline: true });
    doc.moveDown(0.5);

    const enriched = enrichLivraisonTotals(livraison);

    const deliveryLines = Array.isArray(livraison.bonCommandeLines) && livraison.bonCommandeLines.length > 0
      ? livraison.bonCommandeLines
      : (livraison.commandeItems || []).map(item => ({
          commandeItem: item,
          requestedQuantity: Number(item.orderedQuantity ?? item.quantity ?? 0),
          deliveredQuantity: Number(item.deliveredQuantity ?? item.orderedQuantity ?? item.quantity ?? 0),
        }));

    if (!Array.isArray(deliveryLines) || deliveryLines.length === 0) {
      doc.fontSize(11).text("Aucune ligne livree.");
    } else {
      // Header
      doc.fontSize(10).text("# | Produit (Ref) | Cmd | Qte | PU | HT | TVA | TTC");
      doc.moveDown(0.2);

      const safeNumber = (v) => {
        if (v === null || v === undefined) return 0;
        if (typeof v === "number") return v;
        const s = String(v).replace(/,/g, ".").trim();
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
      };

      deliveryLines.forEach((line, index) => {
        const item = line.commandeItem || {};
        const product = item.product || {};
        const productName = product.name || "Produit";
        const productRef = product.reference || "-";
        const commandeRef = item.commande?.commandeNumber || item.commande?._id || "-";

        const quantity = safeNumber(line.deliveredQuantity ?? line.requestedQuantity ?? item.orderedQuantity ?? item.quantity ?? 0);
        const unitPrice = safeNumber(item.unitPrice ?? item.salePriceHT ?? item.purchasePriceHT ?? 0);
        const tvaRate = safeNumber(product?.tvaRate ?? product?.taxRate ?? product?.rate ?? 0);
        const knownTtc = safeNumber(product?.salePriceTTC ?? product?.purchasePriceTTC ?? 0);
        const unitIsTTC = knownTtc > 0 && Math.abs(unitPrice - knownTtc) < 0.01 && tvaRate > 0;

        let unitHT = 0;
        let unitTVA = 0;
        let unitTTC = 0;

        if (unitIsTTC && tvaRate > 0) {
          unitHT = unitPrice / (1 + tvaRate);
          unitTVA = unitPrice - unitHT;
          unitTTC = unitPrice;
        } else {
          unitHT = unitPrice;
          unitTVA = unitHT * tvaRate;
          unitTTC = unitHT + unitTVA;
        }

        const lineHT = quantity * unitHT;
        const lineTVA = quantity * unitTVA;
        const lineTTC = quantity * unitTTC;

        doc
          .fontSize(10)
          .text(
            `${index + 1}. ${productName} (${productRef}) | ${commandeRef} | Qte: ${quantity} | PU: ${unitPrice.toFixed(2)} | HT: ${lineHT.toFixed(2)} | TVA: ${lineTVA.toFixed(2)} | TTC: ${lineTTC.toFixed(2)}`
          );
      });

      doc.moveDown(0.5);

      // Totals
      const totalHT = enriched.totalHT ?? 0;
      const totalTVA = enriched.tvaAmount ?? 0;
      const totalTTC = enriched.totalAmountTTC ?? (Number((totalHT + totalTVA).toFixed(2)));

      doc.fontSize(11).text(`Total HT: ${totalHT.toFixed(2)} DT`, { align: "right" });
      doc.fontSize(11).text(`Total TVA: ${totalTVA.toFixed(2)} DT`, { align: "right" });
      doc.fontSize(12).text(`Total TTC: ${totalTTC.toFixed(2)} DT`, { align: "right" });
    }

    doc.moveDown(1);
    doc
      .fontSize(10)
      .fillColor("gray")
      .text(`Document genere le ${new Date().toLocaleString("fr-FR")}`, { align: "right" });

    doc.end();
  });
}

function uploadDeliveryPdfToCloudinary(buffer, fileName) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "livraisons",
        resource_type: "raw",
        format: "pdf",
        public_id: fileName.replace(/\.pdf$/i, ""),
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      }
    );

    uploadStream.end(buffer);
  });
}

async function generateUniqueInvoiceNumber(session) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invoiceNumber = buildInvoiceNumber();
    const exists = await Facture.findOne({ invoiceNumber }).session(session);
    if (!exists) return invoiceNumber;
  }
  throw httpError(500, "Failed to generate unique invoice number");
}

async function createFactureForCommande({ commande, userId, transporterId, session }) {
  if (commande.facture) return null;

  const commandeItems = await CommandeItem.find({ commande: commande._id }).session(session);
  const invoiceNumber = await generateUniqueInvoiceNumber(session);

  const invoiceItems = commandeItems.map(item => ({
    product: item.product,
    quantity: Number(item.orderedQuantity || item.quantity),
    unitPrice: Number(item.unitPrice),
    lineTotal: Number(item.orderedQuantity || item.quantity) * Number(item.unitPrice),
  }));

  const [facture] = await Facture.create(
    [
      {
        invoiceNumber,
        date: new Date(),
        items: [],
        totalAmountTTC: Number(commande.totalAmountTTC || commande.totalAmount || 0),
        paymentStatus: "UNPAID",
        commande: commande._id,
        client: commande.client,
        transporter: transporterId,
        createdBy: userId,
      },
    ],
    { session }
  );

  if (invoiceItems.length > 0) {
    const createdFactureItems = await FactureItem.create(
      invoiceItems.map(item => ({ ...item, facture: facture._id })),
      { session, ordered: true }
    );
    facture.items = createdFactureItems.map(item => item._id);
    await facture.save({ session });
  }

  commande.facture = facture._id;
  commande.invoicedAt = new Date();
  await commande.save({ session });

  return facture;
}

async function recomputeCommandeStatus(commandeId, userId, transporterId, session) {
  const commande = await Commande.findById(commandeId).session(session);
  if (!commande) return { commande: null, facture: null };

  if (commande.status === "CANCELLED") {
    throw httpError(400, `Commande ${commande._id} is cancelled and cannot be delivered`);
  }

  const items = await CommandeItem.find({ commande: commande._id })
    .select("orderedQuantity quantity deliveredQuantity pendingQuantity")
    .session(session);

  const totalOrdered = items.reduce(
    (sum, item) => sum + Number(item.orderedQuantity || item.quantity || 0),
    0
  );
  const totalDelivered = items.reduce(
    (sum, item) => sum + Number(item.deliveredQuantity || 0),
    0
  );

  let nextStatus = commande.status;
  if (totalOrdered === 0 || totalDelivered === 0) {
    nextStatus = commande.status === "DRAFT" ? "DRAFT" : "CONFIRMED";
  } else if (totalDelivered < totalOrdered) {
    nextStatus = "PARTIALLY_DELIVERED";
  } else {
    nextStatus = "DELIVERED";
  }

  commande.status = nextStatus;
  commande.stockApplied = totalDelivered > 0;

  let createdFacture = null;
  if (nextStatus === "DELIVERED" && !commande.facture) {
    createdFacture = await createFactureForCommande({
      commande,
      userId,
      transporterId,
      session,
    });
  } else {
    await commande.save({ session });
  }

  return { commande, facture: createdFacture };
}

async function resolveBonLinesForDelivery({ bonCommandeId, bonCommandeLineIds, session }) {
  const normalizedLineIds = [...new Set((bonCommandeLineIds || []).map(id => String(id)))];

  let bonCommande = null;
  if (bonCommandeId) {
    bonCommande = await BonCommande.findById(bonCommandeId).session(session);
    if (!bonCommande) {
      throw httpError(404, "Bon de commande not found");
    }
    if (bonCommande.status === "CANCELLED") {
      throw httpError(400, "Cancelled bon de commande cannot be delivered");
    }
  }

  if (normalizedLineIds.length === 0 && bonCommande) {
    normalizedLineIds.push(...(bonCommande.lines || []).map(id => String(id)));
  }

  if (normalizedLineIds.length === 0) {
    throw httpError(400, "Provide bonCommandeId or bonCommandeLineIds to create a livraison");
  }

  const lines = await BonCommandeLine.find({ _id: { $in: normalizedLineIds } }).session(session);
  if (lines.length !== normalizedLineIds.length) {
    throw httpError(404, "One or more bon de commande lines were not found");
  }

  const pendingLines = lines.filter(line => Number(line.remainingQuantity || 0) > 0);
  if (pendingLines.length === 0) {
    throw httpError(400, "All selected bon de commande lines are already delivered");
  }

  const effectiveBonId = bonCommande ? String(bonCommande._id) : String(pendingLines[0].bonCommande);
  const allSameBon = pendingLines.every(line => String(line.bonCommande) === effectiveBonId);
  if (!allSameBon) {
    throw httpError(400, "A livraison can only deliver lines from a single bon de commande");
  }

  if (!bonCommande) {
    bonCommande = await BonCommande.findById(effectiveBonId).session(session);
  }

  return { bonCommande, pendingLines };
}

async function createLivraison(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { date, bonCommandeId, bonCommandeLineIds, note = "" } = req.body;

    const normalizedBonCommandeId = normalizeSingleId(bonCommandeId, "bonCommandeId");
    const normalizedBonCommandeLineIds = normalizeIdArray(bonCommandeLineIds, "bonCommandeLineIds");

    const { bonCommande, pendingLines } = await resolveBonLinesForDelivery({
      bonCommandeId: normalizedBonCommandeId,
      bonCommandeLineIds: normalizedBonCommandeLineIds,
      session,
    });

    const deliveryNumber = await generateUniqueDeliveryNumber(session);

    const plannedCommandeItemIds = pendingLines.map(line => String(line.commandeItem));
    const plannedItems = await CommandeItem.find({ _id: { $in: plannedCommandeItemIds } })
      .select("commande")
      .session(session);
    const plannedCommandeIds = [...new Set(plannedItems.map(item => String(item.commande)))];

    const [livraison] = await Livraison.create(
      [
        {
          deliveryNumber,
          date,
          status: "PLANNED",
          transporter: null,
          commandes: plannedCommandeIds,
          commandeItems: plannedCommandeItemIds,
          bonCommande: bonCommande ? bonCommande._id : null,
          bonCommandeLines: pendingLines.map(line => line._id),
          note,
          createdBy: req.user.id,
        },
      ],
      { session }
    );

    const populatedLivraison = await Livraison.findById(livraison._id)
      .populate("transporter", "name plateNumber")
      .populate("createdBy", "firstName lastName email role")
      .populate("bonCommande", "bonNumber status")
      .populate("commandes", "status totalAmount client")
      .populate({
        path: "commandeItems",
        populate: [
          { path: "product", select: "name reference tvaRate" },
          { path: "commande", select: "status totalAmount client" },
        ],
      })
      .populate({
        path: "bonCommandeLines",
        populate: {
          path: "commandeItem",
          populate: [
              { path: "product", select: "name reference tvaRate" },
            { path: "commande", select: "commandeNumber status totalAmount client" },
            { path: "deliveredBy", select: "firstName lastName email role" },
          ],
        },
      })
      .session(session);

    await session.commitTransaction();

    await logHistory({
      action: "LIVRAISON_PLANNED",
      description: `Livraison ${livraison.deliveryNumber} planned with ${pendingLines.length} bon lines`,
      user: req.user.id,
      entityType: "Livraison",
      entityId: livraison._id,
      metaData: {
        transporterId: null,
        bonCommandeId: bonCommande ? String(bonCommande._id) : null,
        commandeCount: plannedCommandeIds.length,
        itemCount: pendingLines.length,
      },
    });

    return res.status(201).json(enrichLivraisonTotals(populatedLivraison));
  } catch (error) {
    await session.abortTransaction();
    return res.status(error.status || 500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

async function assignTransporterAndDeliver(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const { transporterId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid livraison id" });
    }

    if (!transporterId || !mongoose.Types.ObjectId.isValid(transporterId)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Valid transporterId is required" });
    }

    const transporter = await Transporter.findById(transporterId).session(session);
    if (!transporter) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Transporter not found" });
    }

    const livraison = await Livraison.findById(id).session(session);
    if (!livraison) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Livraison not found" });
    }

    if (livraison.status === "DELIVERED") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Livraison is already delivered" });
    }

    if (livraison.status === "CANCELLED") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Cancelled livraison cannot be delivered" });
    }

    const deliveryDate = new Date();
    const touchedCommandeIds = new Set();
    const touchedCommandeItemIds = new Set();
    const lowStockChecks = [];

    const deliveryLineIds = (livraison.bonCommandeLines || []).map(lineId => String(lineId));
    if (deliveryLineIds.length === 0) {
      throw httpError(400, "No bon de commande lines found for this livraison");
    }

    const lines = await BonCommandeLine.find({ _id: { $in: deliveryLineIds } }).session(session);
    if (lines.length === 0) {
      throw httpError(400, "No bon de commande lines found for this livraison");
    }

    const pendingLines = lines.filter(line => Number(line.remainingQuantity || 0) > 0);
    if (pendingLines.length === 0) {
      throw httpError(400, "All selected bon de commande lines are already delivered");
    }

    for (const line of pendingLines) {
      const item = await CommandeItem.findById(line.commandeItem).session(session);
      if (!item) {
        throw httpError(404, `Commande item not found: ${line.commandeItem}`);
      }

      const deliveryQty = Number(line.remainingQuantity || 0);
      if (deliveryQty <= 0) {
        continue;
      }

      const product = await Product.findById(item.product).session(session);
      if (!product) {
        throw httpError(404, `Product not found: ${item.product}`);
      }

      const previousQuantity = Number(product.quantity || 0);

      if (product.quantity < deliveryQty) {
        throw httpError(400, `Insufficient stock for product ${product.reference}`);
      }

      product.quantity -= deliveryQty;
      await product.save({ session });
      lowStockChecks.push({ product: product.toObject(), previousQuantity });

      await StockMovement.create(
        [
          {
            product: product._id,
            type: "out",
            quantity: deliveryQty,
            note: `Livraison ${livraison.deliveryNumber}: ${livraison.note || "Bon de commande delivered"}`,
            createdBy: req.user.id,
          },
        ],
        { session }
      );

      const ordered = Number(item.orderedQuantity || item.quantity || 0);
      const delivered = Math.min(Number(item.deliveredQuantity || 0) + deliveryQty, ordered);

    for (const check of lowStockChecks) {
      await notifyLowStockIfNeeded({
        product: check.product,
        previousQuantity: check.previousQuantity,
        createdBy: req.user.id,
      });
    }
      const pending = Math.max(ordered - delivered, 0);

      item.deliveredQuantity = delivered;
      item.pendingQuantity = pending;
      item.status = pending <= 0 ? "DELIVERED" : delivered > 0 ? "PARTIALLY_DELIVERED" : "PENDING";
      item.deliveredAt = deliveryDate;
      item.deliveredBy = req.user.id;
      await item.save({ session });

      line.deliveredQuantity = Number(line.deliveredQuantity || 0) + deliveryQty;
      line.remainingQuantity = Math.max(Number(line.requestedQuantity || 0) - Number(line.deliveredQuantity || 0), 0);
      line.status = line.remainingQuantity <= 0 ? "DELIVERED" : line.deliveredQuantity > 0 ? "PARTIALLY_DELIVERED" : "PENDING";
      await line.save({ session });

      touchedCommandeIds.add(String(item.commande));
      touchedCommandeItemIds.add(String(item._id));
    }

    const touchedCommandeIdsArray = [...touchedCommandeIds];

    livraison.transporter = transporter._id;
    livraison.status = "DELIVERED";
    livraison.date = deliveryDate;
    livraison.commandes = touchedCommandeIdsArray;
    livraison.commandeItems = [...touchedCommandeItemIds];
    await livraison.save({ session });

    const createdFactures = [];
    for (const commandeId of touchedCommandeIdsArray) {
      const { commande, facture } = await recomputeCommandeStatus(
        commandeId,
        req.user.id,
        transporter._id,
        session
      );
      if (commande && facture) {
        createdFactures.push({
          factureId: facture._id,
          invoiceNumber: facture.invoiceNumber,
          commandeId: commande._id,
        });
      }
    }

    if (livraison.bonCommande) {
      const bonCommande = await BonCommande.findById(livraison.bonCommande).session(session);
      if (bonCommande) {
        const bonLines = await BonCommandeLine.find({ bonCommande: bonCommande._id }).session(session);
        const hasProgress = bonLines.some(line => Number(line.deliveredQuantity || 0) > 0);
        const fullyDelivered = bonLines.length > 0 && bonLines.every(line => line.status === "DELIVERED");

        bonCommande.status = fullyDelivered ? "DELIVERED" : hasProgress ? "PARTIALLY_DELIVERED" : "PENDING";
        await bonCommande.save({ session });
      }
    }

    const populatedLivraison = await Livraison.findById(livraison._id)
      .populate("transporter", "name plateNumber")
      .populate("createdBy", "firstName lastName email role")
      .populate("bonCommande", "bonNumber status")
      .populate("commandes", "status totalAmount client")
      .populate({
        path: "commandeItems",
        populate: [
          { path: "product", select: "name reference tvaRate" },
          { path: "commande", select: "status totalAmount client" },
        ],
      })
      .populate({
        path: "bonCommandeLines",
        populate: {
          path: "commandeItem",
          populate: [
              { path: "product", select: "name reference tvaRate" },
            { path: "commande", select: "commandeNumber status totalAmount client" },
            { path: "deliveredBy", select: "firstName lastName email role" },
          ],
        },
      })
      .session(session);

    const safeDeliveryNumber = String(populatedLivraison.deliveryNumber || populatedLivraison._id).replace(/[^a-zA-Z0-9-_]/g, "_");
    const fileName = `bon-livraison-${safeDeliveryNumber}.pdf`;
    const pdfBuffer = await buildDeliveryPdfBuffer(populatedLivraison);
    const cloudinaryResult = await uploadDeliveryPdfToCloudinary(pdfBuffer, fileName);
    populatedLivraison.deliveryNoteTemplate = cloudinaryResult.secure_url || cloudinaryResult.url || "";
    await populatedLivraison.save({ session });

    await session.commitTransaction();

    await logHistory({
      action: "LIVRAISON_DELIVERED",
      description: `Livraison ${populatedLivraison.deliveryNumber} delivered by transporter ${transporter.name}`,
      user: req.user.id,
      entityType: "Livraison",
      entityId: populatedLivraison._id,
      metaData: {
        transporterId: transporter._id.toString(),
        bonCommandeId: populatedLivraison.bonCommande ? String(populatedLivraison.bonCommande._id || populatedLivraison.bonCommande) : null,
        commandeCount: touchedCommandeIdsArray.length,
        itemCount: pendingLines.length,
      },
    });

    for (const factureInfo of createdFactures) {
      await logHistory({
        action: "FACTURE_AUTO_CREATED_FROM_COMMANDE",
        description: `Facture ${factureInfo.invoiceNumber} created from commande ${factureInfo.commandeId}`,
        user: req.user.id,
        entityType: "Facture",
        entityId: factureInfo.factureId,
        metaData: { commandeId: String(factureInfo.commandeId) },
      });
    }

    return res.json(enrichLivraisonTotals(populatedLivraison));
  } catch (error) {
    await session.abortTransaction();
    if (typeof next === "function") return next(error);
    return res.status(error.status || 500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

async function listLivraisons(_req, res) {
  try {
    const livraisons = await Livraison.find()
      .populate("transporter", "name plateNumber")
      .populate("createdBy", "firstName lastName email role")
      .populate("bonCommande", "bonNumber status")
      .populate("commandes", "status totalAmount client")
      .populate({
        path: "commandeItems",
        populate: [
          { path: "product", select: "name reference tvaRate salePriceTTC purchasePriceTTC" },
          { path: "commande", select: "status totalAmount client" },
        ],
      })
      .populate({
        path: "bonCommandeLines",
        populate: {
          path: "commandeItem",
          populate: [
            { path: "product", select: "name reference tvaRate salePriceTTC purchasePriceTTC" },
            { path: "commande", select: "commandeNumber status totalAmount client" },
            { path: "deliveredBy", select: "firstName lastName email role" },
          ],
        },
      })
      .sort({ createdAt: -1 });
    return res.json(livraisons.map(enrichLivraisonTotals));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getLivraisonById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid livraison id" });
    }

    const livraison = await Livraison.findById(id)
      .populate("transporter", "name plateNumber")
      .populate("createdBy", "firstName lastName email role")
      .populate("bonCommande", "bonNumber status")
      .populate("commandes", "status totalAmount client")
      .populate({
        path: "commandeItems",
        populate: [
          { path: "product", select: "name reference tvaRate" },
          { path: "commande", select: "status totalAmount client" },
        ],
      });
      
    if (livraison) {
      await livraison.populate({
        path: "bonCommandeLines",
        populate: {
          path: "commandeItem",
          populate: [
            { path: "product", select: "name reference tvaRate" },
            { path: "commande", select: "commandeNumber status totalAmount client" },
            { path: "deliveredBy", select: "firstName lastName email role" },
          ],
        },
      });
    }

    if (!livraison) return res.status(404).json({ message: "Livraison not found" });
    return res.json(enrichLivraisonTotals(livraison));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function downloadLivraisonDeliveryNotePdf(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid livraison id" });
    }

    const livraison = await Livraison.findById(id)
      .populate("transporter", "name plateNumber")
      .populate("createdBy", "firstName lastName email role")
      .populate("bonCommande", "bonNumber status")
      .populate("commandes", "_id status totalAmount")
      .populate({
        path: "commandeItems",
        populate: [
          { path: "product", select: "name reference" },
          { path: "commande", select: "_id" },
        ],
      });

    if (livraison) {
      await livraison.populate({
        path: "bonCommandeLines",
        populate: {
          path: "commandeItem",
          populate: [
            { path: "product", select: "name reference tvaRate" },
            { path: "commande", select: "commandeNumber _id" },
          ],
        },
      });
    }

    if (!livraison) return res.status(404).json({ message: "Livraison not found" });

    if (livraison.status !== "DELIVERED") {
      return res.status(400).json({ message: "Delivery note is only available for delivered livraisons" });
    }

    if (livraison.deliveryNoteTemplate) {
      return res.redirect(livraison.deliveryNoteTemplate);
    }

    const safeDeliveryNumber = String(livraison.deliveryNumber || livraison._id).replace(/[^a-zA-Z0-9-_]/g, "_");
    const fileName = `bon-livraison-${safeDeliveryNumber}.pdf`;
    const pdfBuffer = await buildDeliveryPdfBuffer(livraison);
    const cloudinaryResult = await uploadDeliveryPdfToCloudinary(pdfBuffer, fileName);

    livraison.deliveryNoteTemplate = cloudinaryResult.secure_url || cloudinaryResult.url || "";
    await livraison.save();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createLivraison,
  assignTransporterAndDeliver,
  listLivraisons,
  getLivraisonById,
  downloadLivraisonDeliveryNotePdf,
};
