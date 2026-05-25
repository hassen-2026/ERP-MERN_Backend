const mongoose = require("mongoose");

const targetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 2020, max: 2100 },
    targetValue: { type: Number, required: true, min: 0 },
    actualValue: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "ACHIEVED", "MISSED"],
      default: "DRAFT",
    },
    warningThreshold: { type: Number, default: 80 },
    isWarning: { type: Boolean, default: false },
    isExceeded: { type: Boolean, default: false },
    notes: { type: String, trim: true, default: "" },
    achievedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    achievedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

targetSchema.virtual("remainingValue").get(function () {
  return Math.max(0, this.targetValue - this.actualValue);
});

targetSchema.virtual("progressPercentage").get(function () {
  if (this.targetValue === 0) return 0;
  return Math.round((this.actualValue / this.targetValue) * 100);
});

targetSchema.index({ month: 1, year: 1, department: 1 });
targetSchema.index({ status: 1 });
targetSchema.index({ createdBy: 1 });

targetSchema.pre("save", function () {
  const progress = this.progressPercentage;
  this.isWarning = progress >= this.warningThreshold && progress < 100;
  this.isExceeded = this.actualValue > this.targetValue;

  if (this.actualValue >= this.targetValue) {
    this.status = "ACHIEVED";
  } else if (this.status === "DRAFT") {
    this.status = "ACTIVE";
  }
});

module.exports = mongoose.model("Target", targetSchema);