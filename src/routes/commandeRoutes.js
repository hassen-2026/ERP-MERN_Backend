const express = require("express");
const {
  createCommande,
  listCommandes,
  getCommandeById,
  updateCommande,
  deleteCommande,
  salesByCategory,
  salesByProduct,
} = require("../controllers/commandeController");

const router = express.Router();

router.get("/", listCommandes);
router.get("/:id", getCommandeById);
router.post("/", createCommande);
router.put("/:id", updateCommande);
router.delete("/:id", deleteCommande);
router.get("/analytics/category", salesByCategory);
router.get("/analytics/product", salesByProduct);

module.exports = router;
