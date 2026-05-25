const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    attendanceDate: { type: Date, required: true },
    checkIn: { type: Date },
    checkOut: { type: Date },
    status: {
      type: String,
      enum: ["PRESENT", "ABSENT", "LATE", "REMOTE", "HALF_DAY"],
      default: "PRESENT",
    },
    notes: { type: String, trim: true, default: "" },
    totalHours: { type: Number, min: 0, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

attendanceSchema.index({ employee: 1, attendanceDate: 1 }, { unique: true });

attendanceSchema.pre("validate", function computeHours() {
  if (this.checkIn && this.checkOut) {
    const diffMs = new Date(this.checkOut).getTime() - new Date(this.checkIn).getTime();
    this.totalHours = Math.max(0, Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100);
  }
});

module.exports = mongoose.model("Attendance", attendanceSchema);
