const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    confirmPassword: { type: String, required: true, minlength: 8, select: false },
    dob: { type: Date },
    imageUrl: { type: String, trim: true, default: "" },
    imagePublicId: { type: String, trim: true, default: "" },
    role: {
      type: String,
      enum: [
        "SUPER_ADMIN",
        "ADMIN",
        "MANAGER",
        "SALES_MANAGER",
        "PROCUREMENT_MANAGER",
        "HR_MANAGER",
        "FINANCE_MANAGER",
        "LOGISTICS_MANAGER",
        "USER",
      ],
      default: "USER",
    },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

userSchema.pre("save", async function hashPassword() {
  const passwordChanged = this.isModified("password");
  const confirmChanged = this.isModified("confirmPassword");
  if (!passwordChanged && !confirmChanged) return;

  if (this.password !== this.confirmPassword) {
    throw new Error("Passwords doesn't match");
  }

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  this.confirmPassword = undefined;
});

userSchema.methods.comparePassword = function comparePassword(plainPassword) {
  return bcrypt.compare(plainPassword, this.password);
};

module.exports = mongoose.model("users", userSchema);
