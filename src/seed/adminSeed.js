const dotenv = require("dotenv");
const connectDB = require("../config/db");
const User = require("../models/User");

dotenv.config();

async function seedAdmin() {
  try {
    await connectDB();

    const adminEmail = process.env.ADMIN_EMAIL || "admin@erp.local";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
    const adminFirstName = process.env.ADMIN_FIRST_NAME || "ERP";
    const adminLastName = process.env.ADMIN_LAST_NAME || "Admin";

    const exists = await User.findOne({ email: adminEmail.toLowerCase() });
    if (exists) {
      console.log(`Admin already exists: ${adminEmail}`);
      process.exit(0);
    }

    await User.create({
      email: adminEmail.toLowerCase(),
      firstName: adminFirstName,
      lastName: adminLastName,
      password: adminPassword,
      confirmPassword: adminPassword,
      role: "ADMIN"
    });

    console.log(`Admin created: ${adminEmail} / ${adminPassword}`);
    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }
}

seedAdmin();
