const mongoose = require("mongoose");

const livraisonSchema = new mongoose.Schema(
  {
    deliveryNumber: { type: String, required: true, unique: true, trim: true },
    date: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["PLANNED", "DELIVERED", "CANCELLED"],
      default: "PLANNED",
    },
    transporter: { type: mongoose.Schema.Types.ObjectId, ref: "Transporter", default: null },
    commandes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Commande" }],
    commandeItems: [{ type: mongoose.Schema.Types.ObjectId, ref: "CommandeItem" }],
    bonCommande: { type: mongoose.Schema.Types.ObjectId, ref: "BonCommande", default: null },
    bonCommandeLines: [{ type: mongoose.Schema.Types.ObjectId, ref: "BonCommandeLine" }],
    deliveryNoteTemplate: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Livraison", livraisonSchema);
