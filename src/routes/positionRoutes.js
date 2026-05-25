const express = require("express");
const {
  createPosition,
  listPositions,
  getPositionById,
  updatePosition,
  deletePosition,
} = require("../controllers/positionController");

const router = express.Router();

router.get("/", listPositions);
router.get("/:id", getPositionById);
router.post("/", createPosition);
router.put("/:id", updatePosition);
router.delete("/:id", deletePosition);

module.exports = router;
