const express = require("express");
const {
  createDevis,
  listDevis,
  getDevisById,
  updateDevis,
  deleteDevis,
  getDevisPdf,
  getDevisFunnel,
  getDevisConversionCurve,
} = require("../controllers/devisController");

const router = express.Router();

router.get("/", listDevis);
router.get("/analytics/funnel", getDevisFunnel);
router.get("/analytics/conversion", getDevisConversionCurve);
router.get("/:id/pdf", getDevisPdf);
router.get("/:id", getDevisById);
router.post("/", createDevis);
router.put("/:id", updateDevis);
router.delete("/:id", deleteDevis);

module.exports = router;
