const mongoose = require("mongoose");
const EmployeeDocument = require("../models/EmployeeDocument");
const Employee = require("../models/Employee");
const logHistory = require("../utils/historyLogger");

function normalizeDocumentPayload(body = {}) {
  const payload = { ...body };
  if (payload.documentType) payload.documentType = String(payload.documentType).toUpperCase();
  if (payload.status) payload.status = String(payload.status).toUpperCase();
  if (payload.issueDate) payload.issueDate = new Date(payload.issueDate);
  if (payload.expirationDate) payload.expirationDate = new Date(payload.expirationDate);
  return payload;
}

async function createDocument(req, res) {
  try {
    const payload = normalizeDocumentPayload(req.body || {});
    if (!payload.employee || !payload.title) {
      return res.status(400).json({ message: "employee and title are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(payload.employee)) {
      return res.status(400).json({ message: "Invalid employee id" });
    }

    const employee = await Employee.findById(payload.employee);
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const document = await EmployeeDocument.create({
      ...payload,
      fileUrl: payload.fileUrl || req.body?.fileUrl || "",
      filePublicId: payload.filePublicId || "",
      createdBy: req.user.id,
    });

    await logHistory({
      action: "DOCUMENT_CREATED",
      description: `Document ${document.title} created for employee ${employee.name || employee.firstName || employee._id}`,
      user: req.user.id,
      entityType: "EmployeeDocument",
      entityId: document._id,
    });

    const populated = await EmployeeDocument.findById(document._id)
      .populate("employee", "name firstName lastName employeeCode email status")
      .populate("createdBy", "firstName lastName email role");

    return res.status(201).json(populated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listDocuments(req, res) {
  try {
    const query = {};
    if (req.query.employee) {
      if (!mongoose.Types.ObjectId.isValid(req.query.employee)) {
        return res.status(400).json({ message: "Invalid employee id" });
      }
      query.employee = req.query.employee;
    }
    if (req.query.status) query.status = String(req.query.status).toUpperCase();
    if (req.query.documentType) query.documentType = String(req.query.documentType).toUpperCase();

    const documents = await EmployeeDocument.find(query)
      .populate("employee", "name firstName lastName employeeCode email status")
      .populate("createdBy", "firstName lastName email role")
      .sort({ createdAt: -1 });

    return res.json(documents);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getDocumentById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid document id" });
    }

    const document = await EmployeeDocument.findById(id)
      .populate("employee", "name firstName lastName employeeCode email status")
      .populate("createdBy", "firstName lastName email role");

    if (!document) return res.status(404).json({ message: "Document not found" });
    return res.json(document);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateDocument(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid document id" });
    }

    const payload = normalizeDocumentPayload(req.body || {});
    if (payload.employee) {
      if (!mongoose.Types.ObjectId.isValid(payload.employee)) {
        return res.status(400).json({ message: "Invalid employee id" });
      }
      const employee = await Employee.findById(payload.employee);
      if (!employee) return res.status(404).json({ message: "Employee not found" });
    }

    const document = await EmployeeDocument.findByIdAndUpdate(id, payload, { new: true, runValidators: true })
      .populate("employee", "name firstName lastName employeeCode email status")
      .populate("createdBy", "firstName lastName email role");

    if (!document) return res.status(404).json({ message: "Document not found" });

    await logHistory({
      action: "DOCUMENT_UPDATED",
      description: `Document ${document.title} updated`,
      user: req.user.id,
      entityType: "EmployeeDocument",
      entityId: document._id,
    });

    return res.json(document);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function deleteDocument(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid document id" });
    }

    const document = await EmployeeDocument.findByIdAndDelete(id);
    if (!document) return res.status(404).json({ message: "Document not found" });

    await logHistory({
      action: "DOCUMENT_DELETED",
      description: `Document ${document.title} deleted`,
      user: req.user.id,
      entityType: "EmployeeDocument",
      entityId: document._id,
    });

    return res.json({ message: "Document deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createDocument,
  listDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
};
