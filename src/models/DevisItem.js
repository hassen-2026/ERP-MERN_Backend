const mongoose = require("mongoose");

const devisItemSchema = new mongoose.Schema(
  {
    devis: { type: mongoose.Schema.Types.ObjectId, ref: "Devis", required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DevisItem", devisItemSchema);
