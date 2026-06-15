const express = require("express");
const {
  createPaiement,
  listPaiements,
  getPaiementById,
  deletePaiement,
  downloadPaiementPdf,
} = require("../controllers/paiementController");

const router = express.Router();

router.get("/", listPaiements);
router.get("/:id", getPaiementById);
router.get("/:id/pdf", downloadPaiementPdf);
router.post("/", createPaiement);
router.delete("/:id", deletePaiement);

module.exports = router;
