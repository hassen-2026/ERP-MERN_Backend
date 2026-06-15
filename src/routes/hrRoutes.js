const express = require("express");
const { getHrSummary, getHrMonthlyReport, getHrAlerts } = require("../controllers/hrController");

const router = express.Router();

// GET - HR Stats Summary
router.get("/summary", getHrSummary);

// GET - Monthly report
router.get("/reports/monthly", getHrMonthlyReport);

// GET - HR Alerts
router.get("/alerts", getHrAlerts);

module.exports = router;
