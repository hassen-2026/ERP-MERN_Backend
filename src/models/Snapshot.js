const mongoose = require("mongoose");

const snapshotSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    date: { type: Date, default: Date.now },
    description: { type: String, trim: true, default: "" },
    generatedReport: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Snapshot", snapshotSchema);
