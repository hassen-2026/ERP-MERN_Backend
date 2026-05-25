const mongoose = require("mongoose");

const payrollSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    periodMonth: { type: Number, min: 1, max: 12, required: true },
    periodYear: { type: Number, min: 2000, required: true },
    grossSalary: { type: Number, min: 0, default: 0 },
    bonusAmount: { type: Number, min: 0, default: 0 },
    deductionAmount: { type: Number, min: 0, default: 0 },
    netSalary: { type: Number, min: 0, default: 0 },
    paymentDate: { type: Date },
    status: {
      type: String,
      enum: ["DRAFT", "CALCULATED", "PAID", "CANCELLED"],
      default: "DRAFT",
    },
    notes: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

payrollSchema.index({ employee: 1, periodMonth: 1, periodYear: 1 }, { unique: true });

payrollSchema.pre("validate", function computeNetSalary() {
  const grossSalary = Number(this.grossSalary) || 0;
  const bonusAmount = Number(this.bonusAmount) || 0;
  const deductionAmount = Number(this.deductionAmount) || 0;
  this.netSalary = Math.max(0, grossSalary + bonusAmount - deductionAmount);
});

module.exports = mongoose.model("Payroll", payrollSchema);
