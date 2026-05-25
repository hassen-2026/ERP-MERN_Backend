const express = require("express");
const {
  getHrSummary,
  getHrAlerts,
  getHrMonthlyReport,
} = require("../controllers/hrInsightsController");

const router = express.Router();

router.get("/summary", getHrSummary);
router.get("/alerts", getHrAlerts);
router.get("/reports/monthly", getHrMonthlyReport);

module.exports = router;
