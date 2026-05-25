const mongoose = require("mongoose");

const devisSchema = new mongoose.Schema(
  {
    quoteNumber: { type: String, required: true, unique: true, trim: true },
    date: { type: Date, required: true, default: Date.now },
    status: { type: String, enum: ["DRAFT", "SENT", "ACCEPTED", "REJECTED"], default: "DRAFT" },
    totalHT: { type: Number, default: 0, min: 0 },
    tvaAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    totalAmountTTC: { type: Number, default: 0, min: 0 },
    currencyCode: { type: String, trim: true, uppercase: true, default: "TND" },
    exchangeRateToTnd: { type: Number, default: 1, min: 0 },
    originalCurrencyTotals: { type: mongoose.Schema.Types.Mixed, default: null },
    file: { type: String, trim: true, default: "" },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    items: [{ type: mongoose.Schema.Types.ObjectId, ref: "DevisItem" }],
    commande: { type: mongoose.Schema.Types.ObjectId, ref: "Commande", default: null },
    convertedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Devis", devisSchema);
