const mongoose = require("mongoose");

const transporterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    plateNumber: { type: String, trim: true, default: "" },
    cin: { type: String, trim: true, default: "" },
    photoProfile: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transporter", transporterSchema);
