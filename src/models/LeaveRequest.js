const mongoose = require("mongoose");

const leaveRequestSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    leaveType: {
      type: String,
      enum: ["ANNUAL", "SICK", "UNPAID", "MATERNITY", "PATERNITY", "OTHER"],
      default: "ANNUAL",
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    reason: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
      default: "PENDING",
    },
    totalDays: { type: Number, min: 0, default: 0 },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    decisionComment: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

leaveRequestSchema.pre("validate", function validateLeaveRange() {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    throw new Error("endDate must be greater than or equal to startDate");
  }

  if (this.startDate && this.endDate) {
    const msPerDay = 1000 * 60 * 60 * 24;
    const start = new Date(this.startDate);
    const end = new Date(this.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    this.totalDays = Math.floor((end - start) / msPerDay) + 1;
  }

});

module.exports = mongoose.model("LeaveRequest", leaveRequestSchema);
