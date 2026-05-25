const mongoose = require("mongoose");

const positionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    level: { type: String, trim: true, default: "" },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    description: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

positionSchema.index({ title: 1, department: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Position", positionSchema);
