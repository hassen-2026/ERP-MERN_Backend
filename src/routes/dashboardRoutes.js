const express = require("express");
const router = express.Router();
const { getAdminDashboardData, getAdminChartData } = require("../controllers/dashboardController");

router.get("/admin", getAdminDashboardData);
router.get("/admin/charts", getAdminChartData);

module.exports = router;
