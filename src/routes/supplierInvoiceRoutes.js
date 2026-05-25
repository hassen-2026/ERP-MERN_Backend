const express = require("express");
const auth = require("../middleware/auth");
const {
  createSupplierInvoice,
  listSupplierInvoices,
  getSupplierInvoiceById,
  updateSupplierInvoiceStatus,
  refreshOverdueInvoices
} = require("../controllers/supplierInvoiceController");

const router = express.Router();

router.use(auth);
router.get("/", listSupplierInvoices);
router.get("/:id", getSupplierInvoiceById);
router.post("/", createSupplierInvoice);
router.patch("/:id/status", updateSupplierInvoiceStatus);
router.post("/refresh-overdue", refreshOverdueInvoices);

module.exports = router;
