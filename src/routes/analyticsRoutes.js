const express = require("express");
const router = express.Router();
const { getSalesLocations, getPurchasesLocations } = require("../controllers/analyticsController");

router.get("/sales/locations", getSalesLocations);
router.get("/purchases/locations", getPurchasesLocations);

module.exports = router;
