const mongoose = require("mongoose");

const commandeItemSchema = new mongoose.Schema(
  {
    commande: { type: mongoose.Schema.Types.ObjectId, ref: "Commande", required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1 },
    orderedQuantity: { type: Number, required: true, min: 1 },
    deliveredQuantity: { type: Number, default: 0, min: 0 },
    pendingQuantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["PENDING", "PARTIALLY_DELIVERED", "DELIVERED"],
      default: "PENDING",
    },
    deliveredAt: { type: Date, default: null },
    deliveredBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CommandeItem", commandeItemSchema);
