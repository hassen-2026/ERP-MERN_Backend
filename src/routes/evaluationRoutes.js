const express = require("express");
const {
  createEvaluation,
  listEvaluations,
  getEvaluationById,
  updateEvaluation,
  deleteEvaluation,
} = require("../controllers/evaluationController");

const router = express.Router();

router.get("/", listEvaluations);
router.get("/:id", getEvaluationById);
router.post("/", createEvaluation);
router.put("/:id", updateEvaluation);
router.delete("/:id", deleteEvaluation);

module.exports = router;
