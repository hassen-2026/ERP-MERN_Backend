const express = require("express");
const uploadLogo = require("../middleware/logoUpload");
const { getSettings, updateSettings } = require("../controllers/companySettingsController");
const { authorize } = require("../middleware/roleAuthorization");
const { ROLES } = require("../constants/userRoles");

const router = express.Router();

// GET is accessible to all authenticated users (since they all need to see it, or the pdf needs to see it)
router.get("/", getSettings);

// PUT is restricted to ADMIN only
router.put("/", authorize([ROLES.ADMIN]), uploadLogo.single("logo"), updateSettings);

module.exports = router;
