const mongoose = require("mongoose");

const trainingSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    provider: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    location: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["PLANNED", "ONGOING", "COMPLETED", "CANCELLED"],
      default: "PLANNED",
    },
    budget: { type: Number, min: 0, default: 0 },
    trainer: { type: String, trim: true, default: "" },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee" }],
    certificateUrl: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

trainingSchema.index({ title: 1, startDate: 1 });

module.exports = mongoose.model("Training", trainingSchema);
