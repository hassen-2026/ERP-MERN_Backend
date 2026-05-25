const mongoose = require("mongoose");
const Payroll = require("../models/Payroll");
const Employee = require("../models/Employee");
const logHistory = require("../utils/historyLogger");

function normalizePayrollPayload(body = {}) {
  const payload = { ...body };
  if (payload.periodMonth !== undefined) payload.periodMonth = Number(payload.periodMonth);
  if (payload.periodYear !== undefined) payload.periodYear = Number(payload.periodYear);
  if (payload.grossSalary !== undefined) payload.grossSalary = Number(payload.grossSalary);
  if (payload.bonusAmount !== undefined) payload.bonusAmount = Number(payload.bonusAmount);
  if (payload.deductionAmount !== undefined) payload.deductionAmount = Number(payload.deductionAmount);
  if (payload.paymentDate) payload.paymentDate = new Date(payload.paymentDate);
  if (payload.status) payload.status = String(payload.status).toUpperCase();
  return payload;
}

async function createPayroll(req, res) {
  try {
    const payload = normalizePayrollPayload(req.body || {});
    if (!payload.employee || !payload.periodMonth || !payload.periodYear) {
      return res.status(400).json({ message: "employee, periodMonth and periodYear are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(payload.employee)) {
      return res.status(400).json({ message: "Invalid employee id" });
    }

    const employee = await Employee.findById(payload.employee);
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const payroll = await Payroll.create({
      ...payload,
      createdBy: req.user.id,
    });

    await logHistory({
      action: "PAYROLL_CREATED",
      description: `Payroll created for employee ${employee.name || employee.firstName || employee._id}`,
      user: req.user.id,
      entityType: "Payroll",
      entityId: payroll._id,
    });

    const populated = await Payroll.findById(payroll._id)
      .populate("employee", "name firstName lastName employeeCode email status department position")
      .populate("createdBy", "firstName lastName email role");

    return res.status(201).json(populated);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "A payroll already exists for this employee and period" });
    return res.status(500).json({ message: error.message });
  }
}

async function listPayrolls(req, res) {
  try {
    const query = {};
    if (req.query.employee) {
      if (!mongoose.Types.ObjectId.isValid(req.query.employee)) {
        return res.status(400).json({ message: "Invalid employee id" });
      }
      query.employee = req.query.employee;
    }
    if (req.query.status) query.status = String(req.query.status).toUpperCase();
    if (req.query.periodMonth) query.periodMonth = Number(req.query.periodMonth);
    if (req.query.periodYear) query.periodYear = Number(req.query.periodYear);

    const payrolls = await Payroll.find(query)
      .populate("employee", "name firstName lastName employeeCode email status department position")
      .populate("createdBy", "firstName lastName email role")
      .sort({ periodYear: -1, periodMonth: -1, createdAt: -1 });

    return res.json(payrolls);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getPayrollById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid payroll id" });
    }

    const payroll = await Payroll.findById(id)
      .populate("employee", "name firstName lastName employeeCode email status department position")
      .populate("createdBy", "firstName lastName email role");

    if (!payroll) return res.status(404).json({ message: "Payroll not found" });
    return res.json(payroll);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updatePayroll(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid payroll id" });
    }

    const payload = normalizePayrollPayload(req.body || {});
    if (payload.employee) {
      if (!mongoose.Types.ObjectId.isValid(payload.employee)) {
        return res.status(400).json({ message: "Invalid employee id" });
      }
      const employee = await Employee.findById(payload.employee);
      if (!employee) return res.status(404).json({ message: "Employee not found" });
    }

    const payroll = await Payroll.findByIdAndUpdate(id, payload, { new: true, runValidators: true })
      .populate("employee", "name firstName lastName employeeCode email status department position")
      .populate("createdBy", "firstName lastName email role");

    if (!payroll) return res.status(404).json({ message: "Payroll not found" });

    await logHistory({
      action: "PAYROLL_UPDATED",
      description: `Payroll ${payroll._id} updated`,
      user: req.user.id,
      entityType: "Payroll",
      entityId: payroll._id,
    });

    return res.json(payroll);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "A payroll already exists for this employee and period" });
    return res.status(500).json({ message: error.message });
  }
}

async function deletePayroll(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid payroll id" });
    }

    const payroll = await Payroll.findByIdAndDelete(id);
    if (!payroll) return res.status(404).json({ message: "Payroll not found" });

    await logHistory({
      action: "PAYROLL_DELETED",
      description: `Payroll ${payroll._id} deleted`,
      user: req.user.id,
      entityType: "Payroll",
      entityId: payroll._id,
    });

    return res.json({ message: "Payroll deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createPayroll,
  listPayrolls,
  getPayrollById,
  updatePayroll,
  deletePayroll,
};
