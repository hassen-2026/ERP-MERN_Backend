const mongoose = require("mongoose");

const employeeDocumentSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    documentType: {
      type: String,
      enum: ["CIN", "PASSPORT", "CONTRACT", "DIPLOMA", "CERTIFICATE", "MEDICAL", "OTHER"],
      default: "OTHER",
    },
    title: { type: String, trim: true, required: true },
    fileUrl: { type: String, trim: true, default: "" },
    filePublicId: { type: String, trim: true, default: "" },
    issueDate: { type: Date },
    expirationDate: { type: Date },
    status: {
      type: String,
      enum: ["VALID", "EXPIRED", "MISSING", "PENDING"],
      default: "VALID",
    },
    notes: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

employeeDocumentSchema.index({ employee: 1, documentType: 1, title: 1 });

module.exports = mongoose.model("EmployeeDocument", employeeDocumentSchema);
