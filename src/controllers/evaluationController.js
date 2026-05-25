const mongoose = require("mongoose");
const Evaluation = require("../models/Evaluation");
const Employee = require("../models/Employee");
const logHistory = require("../utils/historyLogger");

function normalizeEvaluationPayload(body = {}) {
  const payload = { ...body };
  if (payload.status) payload.status = String(payload.status).toUpperCase();
  if (payload.evaluationDate) payload.evaluationDate = new Date(payload.evaluationDate);
  if (payload.nextReviewDate) payload.nextReviewDate = new Date(payload.nextReviewDate);
  return payload;
}

async function createEvaluation(req, res) {
  try {
    const payload = normalizeEvaluationPayload(req.body || {});
    if (!payload.employee || !payload.evaluationDate) {
      return res.status(400).json({ message: "employee and evaluationDate are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(payload.employee)) {
      return res.status(400).json({ message: "Invalid employee id" });
    }

    const employee = await Employee.findById(payload.employee);
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const evaluation = await Evaluation.create({
      ...payload,
      evaluator: req.user.id,
    });

    await logHistory({
      action: "EVALUATION_CREATED",
      description: `Evaluation created for employee ${employee.name || employee.firstName || employee._id}`,
      user: req.user.id,
      entityType: "Evaluation",
      entityId: evaluation._id,
    });

    const populated = await Evaluation.findById(evaluation._id)
      .populate("employee", "name firstName lastName employeeCode email status")
      .populate("evaluator", "firstName lastName email role");

    return res.status(201).json(populated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listEvaluations(req, res) {
  try {
    const query = {};
    if (req.query.employee) {
      if (!mongoose.Types.ObjectId.isValid(req.query.employee)) {
        return res.status(400).json({ message: "Invalid employee id" });
      }
      query.employee = req.query.employee;
    }
    if (req.query.status) query.status = String(req.query.status).toUpperCase();

    const evaluations = await Evaluation.find(query)
      .populate("employee", "name firstName lastName employeeCode email status")
      .populate("evaluator", "firstName lastName email role")
      .sort({ evaluationDate: -1, createdAt: -1 });

    return res.json(evaluations);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getEvaluationById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid evaluation id" });
    }

    const evaluation = await Evaluation.findById(id)
      .populate("employee", "name firstName lastName employeeCode email status")
      .populate("evaluator", "firstName lastName email role");

    if (!evaluation) return res.status(404).json({ message: "Evaluation not found" });
    return res.json(evaluation);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateEvaluation(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid evaluation id" });
    }

    const payload = normalizeEvaluationPayload(req.body || {});
    if (payload.employee) {
      if (!mongoose.Types.ObjectId.isValid(payload.employee)) {
        return res.status(400).json({ message: "Invalid employee id" });
      }
      const employee = await Employee.findById(payload.employee);
      if (!employee) return res.status(404).json({ message: "Employee not found" });
    }

    const evaluation = await Evaluation.findByIdAndUpdate(id, payload, { new: true, runValidators: true })
      .populate("employee", "name firstName lastName employeeCode email status")
      .populate("evaluator", "firstName lastName email role");

    if (!evaluation) return res.status(404).json({ message: "Evaluation not found" });

    await logHistory({
      action: "EVALUATION_UPDATED",
      description: `Evaluation ${evaluation._id} updated`,
      user: req.user.id,
      entityType: "Evaluation",
      entityId: evaluation._id,
    });

    return res.json(evaluation);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function deleteEvaluation(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid evaluation id" });
    }

    const evaluation = await Evaluation.findByIdAndDelete(id);
    if (!evaluation) return res.status(404).json({ message: "Evaluation not found" });

    await logHistory({
      action: "EVALUATION_DELETED",
      description: `Evaluation ${evaluation._id} deleted`,
      user: req.user.id,
      entityType: "Evaluation",
      entityId: evaluation._id,
    });

    return res.json({ message: "Evaluation deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createEvaluation,
  listEvaluations,
  getEvaluationById,
  updateEvaluation,
  deleteEvaluation,
};
