const mongoose = require("mongoose");

const supplierInvoiceSchema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true },
    invoiceNumber: { type: String, required: true, trim: true, unique: true },
    invoiceDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    amountHT: { type: Number, required: true, min: 0 },
    tva: { type: Number, default: 0, min: 0 },
    amountTTC: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["PENDING", "PAID", "OVERDUE"],
      default: "PENDING"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("SupplierInvoice", supplierInvoiceSchema);
