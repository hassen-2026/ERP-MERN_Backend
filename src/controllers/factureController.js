const mongoose = require("mongoose");
const Facture = require("../models/Facture");
const FactureItem = require("../models/FactureItem");
const Client = require("../models/Client");
const Commande = require("../models/Commande");
const logHistory = require("../utils/historyLogger");
const sendEmail = require("../utils/mailer");
const { generatePdf } = require("../services/pdfService");

function normalizeIncomingItems(rawItems) {
  if (rawItems === undefined || rawItems === null) return [];

  let parsedItems = rawItems;
  if (typeof parsedItems === "string") {
    try {
      parsedItems = JSON.parse(parsedItems);
    } catch (_error) {
      throw new Error("items must be a valid JSON array");
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
      throw new Error("items must be a valid array");
    }
  }

  if (!Array.isArray(parsedItems)) throw new Error("items must be an array");
  return parsedItems;
}

function mapToFactureItemDoc(item) {
  const quantity = Number(item.quantity);
  const unitPrice = Number(item.unitPrice);
  const lineTotal = item.lineTotal !== undefined ? Number(item.lineTotal) : quantity * unitPrice;
  return {
    product: item.product || item.productId,
    quantity,
    unitPrice,
    lineTotal,
  };
}

async function createFactureItemsForFacture(items, factureId, session) {
  const docs = items.map(item => ({ ...mapToFactureItemDoc(item), facture: factureId }));
  if (docs.length === 0) return [];
  return FactureItem.create(docs, { session, ordered: true });
}

async function createFacture(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { invoiceNumber, date, items, totalAmountTTC, paymentStatus, file, commandeId, clientId, transporterId } =
      req.body;
    const normalizedItems = normalizeIncomingItems(items);
    if (!invoiceNumber || totalAmountTTC === undefined || !clientId) {
      await session.abortTransaction();
      return res.status(400).json({ message: "invoiceNumber, totalAmountTTC and clientId are required" });
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
    if (commandeId && !mongoose.Types.ObjectId.isValid(commandeId)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid commande id" });
    }
    if (commandeId) {
      const cmd = await Commande.findById(commandeId).session(session);
      if (!cmd) {
        await session.abortTransaction();
        return res.status(404).json({ message: "Commande not found" });
      }
    }

    const [facture] = await Facture.create(
      [
        {
          invoiceNumber,
          date,
          items: [],
          totalAmountTTC,
          paymentStatus,
          file,
          commande: commandeId,
          client: clientId,
          transporter: transporterId,
          createdBy: req.user.id,
        },
      ],
      { session }
    );

    const createdItems = await createFactureItemsForFacture(normalizedItems, facture._id, session);
    facture.items = createdItems.map(item => item._id);
    await facture.save({ session });
    await session.commitTransaction();

    await logHistory({
      action: "FACTURE_CREATED",
      description: `Facture ${facture.invoiceNumber} created`,
      user: req.user.id,
      entityType: "Facture",
      entityId: facture._id,
    });

    const populatedFacture = await Facture.findById(facture._id)
      .populate("client", "name phone email adresse nom")
      .populate("commande", "commandeNumber")
      .populate({ path: "items", populate: { path: "product", select: "name reference" } })
      .populate("transporter", "name plateNumber")
      .populate("createdBy", "firstName lastName email role");

    // Envoi e-mail au client (fire-and-forget : ne bloque pas la réponse HTTP)
    const clientEmail = populatedFacture?.client?.email;
    if (clientEmail) {
      const clientName = populatedFacture?.client?.nom || populatedFacture?.client?.name || "Client";
      const invoiceDate = populatedFacture?.date
        ? new Date(populatedFacture.date).toLocaleDateString("fr-FR")
        : new Date().toLocaleDateString("fr-FR");
      const totalTTC = Number(populatedFacture?.totalAmountTTC || 0).toLocaleString("fr-FR", {
        style: "currency",
        currency: "TND",
      });
      // Génération PDF et envoi en pièce jointe (best-effort)
      generatePdf("facture", populatedFacture)
        .then((pdfBuffer) =>
          sendEmail({
            mail: clientEmail,
            subject: `Facture N° ${facture.invoiceNumber}`,
            content: `Bonjour ${clientName},\n\nVeuillez trouver en pièce jointe votre facture N° ${facture.invoiceNumber} du ${invoiceDate} pour un montant de ${totalTTC}.\n\nCordialement,\nService Facturation`,
            html: `
              <p>Bonjour <strong>${clientName}</strong>,</p>
              <p>Veuillez trouver en pièce jointe votre facture <strong>N° ${facture.invoiceNumber}</strong> du <strong>${invoiceDate}</strong>.</p>
              <table style="border-collapse:collapse;margin-top:8px">
                <tr><td style="padding:4px 12px 4px 0"><strong>Montant TTC :</strong></td><td>${totalTTC}</td></tr>
                <tr><td style="padding:4px 12px 4px 0"><strong>Statut paiement :</strong></td><td>${populatedFacture?.paymentStatus || "-"}</td></tr>
              </table>
              <p style="margin-top:16px">Cordialement,<br/>Service Facturation</p>
            `,
            attachments: [
              {
                filename: `facture-${facture.invoiceNumber}.pdf`,
                content: pdfBuffer,
                contentType: "application/pdf",
              },
            ],
          })
        )
        .then(() => console.log(`[FACTURE][MAIL] Envoi réussi → ${clientEmail}`))
        .catch((err) => console.error(`[FACTURE][MAIL] Échec envoi → ${clientEmail}:`, err.message));
    } else {
      console.warn(`[FACTURE][MAIL] Email client manquant pour facture=${facture.invoiceNumber}`);
    }

    return res.status(201).json(populatedFacture);
  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

async function listFactures(_req, res) {
  try {
    const factures = await Facture.find()
      .populate("client", "name phone")
      .populate("commande")
      .populate({ path: "items", populate: { path: "product", select: "name reference" } })
      .populate("transporter", "name plateNumber")
      .populate("createdBy", "firstName lastName email role")
      .sort({ createdAt: -1 });
    return res.json(factures);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getFactureById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid facture id" });
    const facture = await Facture.findById(id)
      .populate("client", "name phone address")
      .populate("commande")
      .populate({ path: "items", populate: { path: "product", select: "name reference" } })
      .populate("transporter", "name plateNumber")
      .populate("createdBy", "firstName lastName email role");
    if (!facture) return res.status(404).json({ message: "Facture not found" });
    return res.json(facture);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateFacture(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid facture id" });
    }

    const facture = await Facture.findById(id).session(session);
    if (!facture) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Facture not found" });
    }

    const payload = { ...req.body };
    if (payload.items !== undefined) {
      const normalizedItems = normalizeIncomingItems(payload.items);
      const oldItemIds = [...(facture.items || [])];
      const createdItems = await createFactureItemsForFacture(normalizedItems, facture._id, session);
      const createdItemIds = createdItems.map(item => item._id);

      if (oldItemIds.length > 0) {
        await FactureItem.deleteMany({ _id: { $in: oldItemIds } }).session(session);
      }

      payload.items = createdItemIds;
    }

    Object.assign(facture, payload);
    await facture.save({ session });
    await session.commitTransaction();

    await logHistory({
      action: "FACTURE_UPDATED",
      description: `Facture ${facture.invoiceNumber} updated`,
      user: req.user.id,
      entityType: "Facture",
      entityId: facture._id,
    });
    const populatedFacture = await Facture.findById(facture._id)
      .populate("client", "name phone")
      .populate("commande")
      .populate({ path: "items", populate: { path: "product", select: "name reference" } })
      .populate("transporter", "name plateNumber")
      .populate("createdBy", "firstName lastName email role");
    return res.json(populatedFacture);
  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

async function deleteFacture(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid facture id" });
    }
    const facture = await Facture.findById(id).session(session);
    if (!facture) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Facture not found" });
    }

    if (Array.isArray(facture.items) && facture.items.length > 0) {
      await FactureItem.deleteMany({ _id: { $in: facture.items } }).session(session);
    }
    await Facture.deleteOne({ _id: id }).session(session);
    await session.commitTransaction();

    await logHistory({
      action: "FACTURE_DELETED",
      description: `Facture ${facture.invoiceNumber} deleted`,
      user: req.user.id,
      entityType: "Facture",
      entityId: facture._id,
    });
    return res.json({ message: "Facture deleted" });
  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

async function downloadFacturePdf(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid facture id" });
    }

    const facture = await Facture.findById(id)
      .populate("client", "name phone email adresse nom")
      .populate("commande", "commandeNumber")
      .populate({ path: "items", populate: { path: "product", select: "name reference tvaRate" } })
      .populate("transporter", "name plateNumber")
      .populate("createdBy", "firstName lastName email role");

    if (!facture) {
      return res.status(404).json({ message: "Facture not found" });
    }

    const pdfBuffer = await generatePdf("facture", facture);

    const safeInvoiceNumber = String(facture.invoiceNumber || facture._id).replace(/[^a-zA-Z0-9-_]/g, "_");
    const fileName = `facture-${safeInvoiceNumber}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = { 
  createFacture, 
  listFactures, 
  getFactureById, 
  updateFacture, 
  deleteFacture,
  downloadFacturePdf,
};
