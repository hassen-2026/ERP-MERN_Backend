const mongoose = require("mongoose");

const bonCommandeSchema = new mongoose.Schema(
  {
    bonNumber: { type: String, required: true, unique: true, trim: true },
    commande: { type: mongoose.Schema.Types.ObjectId, ref: "Commande", required: true },
    date: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["PENDING", "PARTIALLY_DELIVERED", "DELIVERED", "CANCELLED"],
      default: "PENDING",
    },
    lines: [{ type: mongoose.Schema.Types.ObjectId, ref: "BonCommandeLine" }],
    note: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BonCommande", bonCommandeSchema);
