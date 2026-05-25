const mongoose = require("mongoose");

const bonCommandeLineSchema = new mongoose.Schema(
  {
    bonCommande: { type: mongoose.Schema.Types.ObjectId, ref: "BonCommande", required: true },
    commandeItem: { type: mongoose.Schema.Types.ObjectId, ref: "CommandeItem", required: true },
    requestedQuantity: { type: Number, required: true, min: 1 },
    deliveredQuantity: { type: Number, default: 0, min: 0 },
    remainingQuantity: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["PENDING", "PARTIALLY_DELIVERED", "DELIVERED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BonCommandeLine", bonCommandeLineSchema);
