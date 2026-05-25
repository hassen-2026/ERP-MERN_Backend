const mongoose = require("mongoose");
const Paiement = require("../models/Paiement");
const Facture = require("../models/Facture");
const logHistory = require("../utils/historyLogger");

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

module.exports = { createPaiement, listPaiements, getPaiementById, deletePaiement };
