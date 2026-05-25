const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    matriculeFiscale: { type: String, required: true, trim: true },
    imageUrl: { type: String, trim: true },
    country: { type: String, trim: true },
    city: { type: String, trim: true },
   
  },
  { timestamps: true }
);

module.exports = mongoose.model("Supplier", supplierSchema);
