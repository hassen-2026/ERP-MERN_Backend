const mongoose = require("mongoose");

const purchaseItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitCost: { type: Number, required: true, min: 0 },
    receivedQuantity: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["PENDING", "PARTIALLY_RECEIVED", "RECEIVED"],
      default: "PENDING",
    },
  },
  { _id: false }
);

const achatSchema = new mongoose.Schema(
  {
    purchaseNumber: { type: String, required: true, unique: true, trim: true },
    date: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["PENDING", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
      default: "PENDING",
    },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true },
    items: { type: [purchaseItemSchema], default: [] },
    currencyCode: { type: String, trim: true, uppercase: true, default: 'TND' },
    exchangeRateToTnd: { type: Number, default: 1, min: 0 },
    originalCurrencyTotals: {
      totalHT: { type: Number, default: 0, min: 0 },
      tvaAmount: { type: Number, default: 0, min: 0 },
      totalAmountTTC: { type: Number, default: 0, min: 0 },
    },
    totalHT: { type: Number, default: 0, min: 0 },
    tvaAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    totalAmountTTC: { type: Number, default: 0, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    ocrSource: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Achat", achatSchema);
