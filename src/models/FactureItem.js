const mongoose = require("mongoose");

const factureItemSchema = new mongoose.Schema(
  {
    facture: { type: mongoose.Schema.Types.ObjectId, ref: "Facture", required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FactureItem", factureItemSchema);
