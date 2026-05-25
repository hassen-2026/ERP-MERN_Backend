const express = require("express");
const { login, me, register, forgotPassword, resetPassword } = require("../controllers/authController");
const auth = require("../middleware/auth");
const uploadUserImage = require("../middleware/userImageUpload");

const router = express.Router();

// Routes publiques
router.post("/login", login);
router.post("/register", uploadUserImage.single("image"), register);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Routes protégées
router.get("/me", auth, me);

module.exports = router;
