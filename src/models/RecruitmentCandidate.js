const mongoose = require("mongoose");

const recruitmentCandidateSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    positionTitle: { type: String, trim: true, default: "" },
    source: { type: String, trim: true, default: "" },
    expectedSalary: { type: Number, min: 0, default: 0 },
    cvUrl: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"],
      default: "APPLIED",
    },
    notes: { type: String, trim: true, default: "" },
    hiredEmployee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

recruitmentCandidateSchema.index({ fullName: 1, email: 1, positionTitle: 1 });

module.exports = mongoose.model("RecruitmentCandidate", recruitmentCandidateSchema);
