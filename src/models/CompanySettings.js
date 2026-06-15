const mongoose = require("mongoose");

const companySettingsSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, default: "Mon Entreprise" },
    address: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    taxNumber: { type: String, default: "" }, // Matricule Fiscale
    logoUrl: { type: String, default: "" },
    logoPublicId: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CompanySettings", companySettingsSchema);
