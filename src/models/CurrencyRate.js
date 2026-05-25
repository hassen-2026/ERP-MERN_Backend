const mongoose = require("mongoose");

const currencyRateSchema = new mongoose.Schema(
  {
    currencyCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    rateToTnd: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CurrencyRate", currencyRateSchema);