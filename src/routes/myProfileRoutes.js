const express = require("express");
const {
  getMyEmployeeProfile,
  getMyContracts,
  getMyPayrolls,
  getMyEvaluations,
  getMyPayrollPdf,
  getMyEvaluationPdf,
} = require("../controllers/myProfileController");

const router = express.Router();

router.get("/", getMyEmployeeProfile);
router.get("/contracts", getMyContracts);
router.get("/payrolls", getMyPayrolls);
router.get("/payrolls/:id/pdf", getMyPayrollPdf);
router.get("/evaluations", getMyEvaluations);
router.get("/evaluations/:id/pdf", getMyEvaluationPdf);

module.exports = router;
