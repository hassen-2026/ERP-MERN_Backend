const mongoose = require("mongoose");

const evaluationSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    evaluator: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    periodLabel: { type: String, trim: true, default: "" },
    evaluationDate: { type: Date, required: true },
    technicalScore: { type: Number, min: 0, max: 100, default: 0 },
    behaviorScore: { type: Number, min: 0, max: 100, default: 0 },
    goalScore: { type: Number, min: 0, max: 100, default: 0 },
    overallScore: { type: Number, min: 0, max: 100, default: 0 },
    comments: { type: String, trim: true, default: "" },
    nextReviewDate: { type: Date },
    status: {
      type: String,
      enum: ["DRAFT", "COMPLETED", "ARCHIVED"],
      default: "DRAFT",
    },
  },
  { timestamps: true }
);

evaluationSchema.pre("validate", function computeOverallScore() {
  const values = [this.technicalScore, this.behaviorScore, this.goalScore]
    .map((value) => Number(value) || 0)
    .filter((value) => Number.isFinite(value));

  if (values.length) {
    this.overallScore = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }
});

module.exports = mongoose.model("Evaluation", evaluationSchema);
