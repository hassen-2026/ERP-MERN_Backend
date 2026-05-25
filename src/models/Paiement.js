const mongoose = require("mongoose");

const paiementSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true, min: 0 },
    type: {
      type: String,
      enum: ["INCOMING"],
      default: "INCOMING",
    },
    paymentMethod: {
      type: String,
      enum: ["CASH", "CARD", "BANK_TRANSFER", "MOBILE_MONEY", "OTHER"],
      default: "OTHER",
    },
    facture: { type: mongoose.Schema.Types.ObjectId, ref: "Facture" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    note: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Paiement", paiementSchema);
