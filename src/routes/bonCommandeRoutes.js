const express = require("express");
const {
  createBonCommande,
  listBonCommandes,
  getBonCommandeById,
  updateBonCommande,
  updateBonCommandeLineQuantity,
} = require("../controllers/bonCommandeController");

const router = express.Router();

router.get("/", listBonCommandes);
router.get("/:id", getBonCommandeById);
router.post("/", createBonCommande);
router.put("/:id", updateBonCommande);
router.put("/:id/lines/:lineId", updateBonCommandeLineQuantity);

module.exports = router;
