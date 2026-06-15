const express = require("express");
const auth = require("../middleware/auth");
const { createMovement, listMovements } = require("../controllers/stockController");

const router = express.Router();

router.use(auth);
router.get("/", listMovements);
router.post("/", createMovement);

module.exports = router;
