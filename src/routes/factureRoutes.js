const express = require("express");
const {
  createFacture,
  listFactures,
  getFactureById,
  updateFacture,
  deleteFacture,
} = require("../controllers/factureController");

const router = express.Router();

router.get("/", listFactures);
router.get("/:id", getFactureById);
router.post("/", createFacture);
router.put("/:id", updateFacture);
router.delete("/:id", deleteFacture);

module.exports = router;
