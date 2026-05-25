const express = require("express");
const {
  createTransporter,
  listTransporters,
  updateTransporter,
  deleteTransporter,
} = require("../controllers/transporterController");

const router = express.Router();

router.get("/", listTransporters);
router.post("/", createTransporter);
router.put("/:id", updateTransporter);
router.delete("/:id", deleteTransporter);

module.exports = router;
