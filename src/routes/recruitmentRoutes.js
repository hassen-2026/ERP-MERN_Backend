const express = require("express");
const {
  createCandidate,
  listCandidates,
  getCandidateById,
  updateCandidate,
  deleteCandidate,
} = require("../controllers/recruitmentController");

const router = express.Router();

router.get("/", listCandidates);
router.get("/:id", getCandidateById);
router.post("/", createCandidate);
router.put("/:id", updateCandidate);
router.delete("/:id", deleteCandidate);

module.exports = router;
