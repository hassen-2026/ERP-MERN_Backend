const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
  {
    employeeCode: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
    cin: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
    firstName: { type: String, trim: true, default: "" },
    lastName: { type: String, trim: true, default: "" },
    name: { type: String, required: true, trim: true },
    gender: { type: String, enum: ["MALE", "FEMALE"], default: "" },
    birthDate: { type: Date },
    nationality: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    imageUrl: { type: String, trim: true, default: "" },
    imagePublicId: { type: String, trim: true, default: "" },
    position: { type: String, trim: true, default: "" },
    positionRef: { type: mongoose.Schema.Types.ObjectId, ref: "Position" },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    hireDate: { type: Date },
    contractType: {
      type: String,
      enum: ["CDI", "CDD", "STAGE", "INTERIM", "FREELANCE", ""],
      default: "",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "ON_LEAVE", "TERMINATED"],
      default: "ACTIVE",
    },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    managedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Employee", employeeSchema);
