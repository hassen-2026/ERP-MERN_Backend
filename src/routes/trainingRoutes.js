const express = require("express");
const {
  createTraining,
  listTrainings,
  getTrainingById,
  updateTraining,
  deleteTraining,
} = require("../controllers/trainingController");

const router = express.Router();

router.get("/", listTrainings);
router.get("/:id", getTrainingById);
router.post("/", createTraining);
router.put("/:id", updateTraining);
router.delete("/:id", deleteTraining);

module.exports = router;
