const mongoose = require("mongoose");

const factureSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, trim: true },
    date: { type: Date, default: Date.now },
    items: [{ type: mongoose.Schema.Types.ObjectId, ref: "FactureItem" }],
    totalAmountTTC: { type: Number, required: true, min: 0 },
    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PARTIAL", "PAID", "CANCELLED"],
      default: "UNPAID",
    },
    file: { type: String, trim: true, default: "" },
    commande: { type: mongoose.Schema.Types.ObjectId, ref: "Commande" },
    bonCommande: { type: mongoose.Schema.Types.ObjectId, ref: "BonCommande", default: null },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
    transporter: { type: mongoose.Schema.Types.ObjectId, ref: "Transporter" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Facture", factureSchema);
