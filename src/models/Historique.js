const mongoose = require("mongoose");

const historiqueSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    metaData: { type: mongoose.Schema.Types.Mixed, default: {} },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    entityType: { type: String, trim: true, default: "" },
    entityId: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Historique", historiqueSchema);
