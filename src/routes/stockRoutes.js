const express = require("express");
const auth = require("../middleware/auth");
const { createMovement, listMovements, listMovementProducts } = require("../controllers/stockController");

const router = express.Router();

router.use(auth);
router.get("/products", listMovementProducts);
router.get("/", listMovements);
router.post("/", createMovement);

module.exports = router;
