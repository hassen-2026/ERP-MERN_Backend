const Supplier = require("../models/Supplier");
const SupplierInvoice = require("../models/SupplierInvoice");

async function createSupplierInvoice(req, res) {
  try {
    const body = req.body || {};
    const { supplierId, invoiceNumber, invoiceDate, dueDate, amountHT, tva = 0, amountTTC } = body;

    if (!supplierId || !invoiceNumber || !invoiceDate || !dueDate) {
      return res.status(400).json({ message: "supplierId, invoiceNumber, invoiceDate and dueDate are required" });
    }

    if (amountHT === undefined || amountTTC === undefined) {
      return res.status(400).json({ message: "amountHT and amountTTC are required" });
    }

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    const exists = await SupplierInvoice.findOne({ invoiceNumber });
    if (exists) return res.status(409).json({ message: "Invoice number already exists" });

    const invoice = await SupplierInvoice.create({
      supplier: supplierId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      amountHT,
      tva,
      amountTTC
    });

    const populated = await invoice.populate("supplier", "name email phone");
    return res.status(201).json(populated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listSupplierInvoices(req, res) {
  try {
    const { status, supplierId } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (supplierId) filter.supplier = supplierId;

    const invoices = await SupplierInvoice.find(filter)
      .populate("supplier", "name email phone")
      .sort({ createdAt: -1 });

    return res.json(invoices);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getSupplierInvoiceById(req, res) {
  try {
    const invoice = await SupplierInvoice.findById(req.params.id).populate("supplier", "name email phone");
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    return res.json(invoice);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateSupplierInvoiceStatus(req, res) {
  try {
    const body = req.body || {};
    const { status } = body;
    if (!status || !["PENDING", "PAID", "OVERDUE"].includes(status)) {
      return res.status(400).json({ message: "status must be one of PENDING, PAID, OVERDUE" });
    }

    const invoice = await SupplierInvoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    invoice.status = status;
    await invoice.save();

    const populated = await invoice.populate("supplier", "name email phone");
    return res.json(populated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function refreshOverdueInvoices(_req, res) {
  try {
    const now = new Date();

    const result = await SupplierInvoice.updateMany(
      {
        status: { $ne: "PAID" },
        dueDate: { $lt: now }
      },
      { $set: { status: "OVERDUE" } }
    );

    return res.json({
      message: "Overdue refresh complete",
      matched: result.matchedCount,
      modified: result.modifiedCount
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createSupplierInvoice,
  listSupplierInvoices,
  getSupplierInvoiceById,
  updateSupplierInvoiceStatus,
  refreshOverdueInvoices
};
