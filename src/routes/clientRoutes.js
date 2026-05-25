const express = require("express");
const {
  createClient,
  listClients,
  getClientById,
  updateClient,
  deleteClient,
} = require("../controllers/clientController");

const router = express.Router();

router.get("/", listClients);
router.get("/:id", getClientById);
router.post("/", createClient);
router.put("/:id", updateClient);
router.delete("/:id", deleteClient);

module.exports = router;
