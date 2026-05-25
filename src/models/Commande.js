const mongoose = require("mongoose");

const commandeSchema = new mongoose.Schema(
  {
    commandeNumber: { type: String, required: true, unique: true, trim: true },
    date: { type: Date, required: true, default: Date.now },
    status: {
      type: String,
      enum: ["DRAFT", "CONFIRMED", "PARTIALLY_DELIVERED", "DELIVERED", "CANCELLED"],
      default: "DRAFT",
    },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
    managedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    items: [{ type: mongoose.Schema.Types.ObjectId, ref: "CommandeItem" }],
    totalHT: { type: Number, default: 0, min: 0 },
    tvaAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    totalAmountTTC: { type: Number, default: 0, min: 0 },
    currencyCode: { type: String, trim: true, uppercase: true, default: "TND" },
    exchangeRateToTnd: { type: Number, default: 1, min: 0 },
    originalCurrencyTotals: { type: mongoose.Schema.Types.Mixed, default: null },
    stockApplied: { type: Boolean, default: false },
    facture: { type: mongoose.Schema.Types.ObjectId, ref: "Facture", default: null },
    invoicedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Commande", commandeSchema);
