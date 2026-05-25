const express = require("express");
const {
  listCurrencyRates,
  upsertCurrencyRates,
} = require("../controllers/currencyRateController");

const router = express.Router();

router.get("/", listCurrencyRates);
router.put("/", upsertCurrencyRates);

module.exports = router;