const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: "" },
    tvaRate: { type: Number, default: 0.19, min: 0, max: 1 },
    isActive: { type: Boolean, default: true },
    imageUrl: { type: String, default: "" },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Category", categorySchema);
