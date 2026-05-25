const mongoose = require("mongoose");

const contractSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    contractType: {
      type: String,
      enum: ["CDI", "CDD", "STAGE", "INTERIM", "FREELANCE"],
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    salaryBase: { type: Number, min: 0, default: 0 },
    probationMonths: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "ENDED", "TERMINATED"],
      default: "ACTIVE",
    },
    notes: { type: String, trim: true, default: "" },
    pdfUrl: { type: String, trim: true, default: "" },
    pdfPublicId: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

contractSchema.pre("validate", function validateContractDates() {
  if (this.endDate && this.startDate && this.endDate < this.startDate) {
    throw new Error("endDate must be greater than or equal to startDate");
  }
});

module.exports = mongoose.model("Contract", contractSchema);
