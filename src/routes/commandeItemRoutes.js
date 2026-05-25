const express = require("express");
const {
  createCommandeItem,
  listCommandeItems,
  getCommandeItemById,
  updateCommandeItem,
  deleteCommandeItem,
} = require("../controllers/commandeItemController");

const router = express.Router();

router.get("/", listCommandeItems);
router.get("/:id", getCommandeItemById);
router.post("/", createCommandeItem);
router.put("/:id", updateCommandeItem);
router.delete("/:id", deleteCommandeItem);

module.exports = router;
