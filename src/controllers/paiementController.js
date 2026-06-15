const mongoose = require("mongoose");
const Paiement = require("../models/Paiement");
const Facture = require("../models/Facture");
const logHistory = require("../utils/historyLogger");
const sendEmail = require("../utils/mailer");
const { generatePdf } = require("../services/pdfService");

async function refreshFactureStatus(factureId) {
  const facture = await Facture.findById(factureId);
  if (!facture) return;

  const payments = await Paiement.find({ facture: factureId });
  const paid = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  if (paid <= 0) facture.paymentStatus = "UNPAID";
  else if (paid < facture.totalAmountTTC) facture.paymentStatus = "PARTIAL";
  else facture.paymentStatus = "PAID";
  await facture.save();
}

async function createPaiement(req, res) {
  try {
    const { date, amount, paymentMethod, factureId, note } = req.body;
    if (amount === undefined) {
      return res.status(400).json({ message: "amount is required" });
    }
    if (!factureId) {
      return res.status(400).json({ message: "factureId is required" });
    }
    if (factureId && !mongoose.Types.ObjectId.isValid(factureId)) {
      return res.status(400).json({ message: "Invalid facture id" });
    }
    const facture = await Facture.findById(factureId);
    if (!facture) return res.status(404).json({ message: "Facture not found" });

    const payment = await Paiement.create({
      date,
      amount,
      type: "INCOMING",
      paymentMethod,
      facture: factureId,
      note,
      createdBy: req.user?._id || req.user?.id,
    });

    if (factureId) await refreshFactureStatus(factureId);

    await logHistory({
      action: "PAIEMENT_CREATED",
      description: `Paiement ${payment._id} created`,
      user: req.user?._id || req.user?.id,
      entityType: "Paiement",
      entityId: payment._id,
      metaData: { amount, type: "INCOMING" },
    });

    const populatedPayment = await Paiement.findById(payment._id)
      .populate({
        path: "facture",
        populate: { path: "client", select: "name phone email adresse nom" }
      });

    const clientEmail = populatedPayment?.facture?.client?.email;
    if (clientEmail) {
      const clientName = populatedPayment?.facture?.client?.nom || populatedPayment?.facture?.client?.name || "Client";
      const paymentDate = populatedPayment.date ? new Date(populatedPayment.date).toLocaleDateString("fr-FR") : new Date().toLocaleDateString("fr-FR");
      const paidAmount = Number(populatedPayment.amount || 0).toLocaleString("fr-FR", {
        style: "currency",
        currency: "TND",
      });
      generatePdf("paiement", populatedPayment)
        .then((pdfBuffer) => 
          sendEmail({
            mail: clientEmail,
            subject: `Reçu de paiement - Facture N° ${populatedPayment.facture?.invoiceNumber || ""}`,
            content: `Bonjour ${clientName},\n\nVeuillez trouver en pièce jointe votre reçu pour le paiement du ${paymentDate} d'un montant de ${paidAmount}.\n\nCordialement,`,
            html: `
              <p>Bonjour <strong>${clientName}</strong>,</p>
              <p>Veuillez trouver en pièce jointe votre reçu pour le paiement du <strong>${paymentDate}</strong> d'un montant de <strong>${paidAmount}</strong>.</p>
              <p style="margin-top:16px">Cordialement,</p>
            `,
            attachments: [
              {
                filename: `recu-paiement-${populatedPayment.facture?.invoiceNumber || populatedPayment._id}.pdf`,
                content: pdfBuffer,
                contentType: "application/pdf",
              },
            ],
          })
        )
        .then(() => console.log(`[PAIEMENT][MAIL] Envoi réussi → ${clientEmail}`))
        .catch((err) => console.error(`[PAIEMENT][MAIL] Échec envoi → ${clientEmail}:`, err.message));
    } else {
      console.warn(`[PAIEMENT][MAIL] Email client manquant pour paiement=${payment._id}`);
    }

    return res.status(201).json(payment);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listPaiements(_req, res) {
  try {
    const payments = await Paiement.find()
      .populate("facture", "invoiceNumber totalAmountTTC paymentStatus")
      .populate("createdBy", "firstName lastName email role")
      .sort({ createdAt: -1 });
    return res.json(payments);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getPaiementById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid paiement id" });
    const payment = await Paiement.findById(id)
      .populate("facture", "invoiceNumber totalAmountTTC paymentStatus")
      .populate("createdBy", "firstName lastName email role");
    if (!payment) return res.status(404).json({ message: "Paiement not found" });
    return res.json(payment);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function deletePaiement(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid paiement id" });
    const payment = await Paiement.findByIdAndDelete(id);
    if (!payment) return res.status(404).json({ message: "Paiement not found" });
    if (payment.facture) await refreshFactureStatus(payment.facture);

    await logHistory({
      action: "PAIEMENT_DELETED",
      description: `Paiement ${payment._id} deleted`,
      user: req.user.id,
      entityType: "Paiement",
      entityId: payment._id,
    });
    return res.json({ message: "Paiement deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function downloadPaiementPdf(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid paiement id" });
    }

    const payment = await Paiement.findById(id)
      .populate({
        path: "facture",
        populate: { path: "client", select: "name phone email adresse nom" }
      })
      .populate("createdBy", "firstName lastName email role");

    if (!payment) {
      return res.status(404).json({ message: "Paiement not found" });
    }

    const pdfBuffer = await generatePdf("paiement", payment);

    const safeId = String(payment.facture?.invoiceNumber || payment._id).replace(/[^a-zA-Z0-9-_]/g, "_");
    const fileName = `recu-paiement-${safeId}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = { createPaiement, listPaiements, getPaiementById, deletePaiement, downloadPaiementPdf };
