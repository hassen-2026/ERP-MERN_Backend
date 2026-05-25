const express = require("express");
const uploadContractPdf = require("../middleware/contractPdfUpload");
const {
  createContract,
  listContracts,
  getContractById,
  updateContract,
  deleteContract,
} = require("../controllers/contractController");

const router = express.Router();

router.get("/", listContracts);
router.get("/:id", getContractById);
router.post("/", uploadContractPdf.single("file"), createContract);
router.put("/:id", uploadContractPdf.single("file"), updateContract);
router.delete("/:id", deleteContract);

module.exports = router;
