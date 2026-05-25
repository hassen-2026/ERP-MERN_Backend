const mongoose = require("mongoose");
const LeaveRequest = require("../models/LeaveRequest");
const Employee = require("../models/Employee");
const logHistory = require("../utils/historyLogger");

function normalizeLeavePayload(body = {}) {
  const payload = { ...body };
  if (payload.leaveType) payload.leaveType = String(payload.leaveType).toUpperCase();
  if (payload.status) payload.status = String(payload.status).toUpperCase();
  return payload;
}

async function createLeaveRequest(req, res) {
  try {
    const payload = normalizeLeavePayload(req.body || {});
    if (!payload.employee || !payload.startDate || !payload.endDate) {
      return res.status(400).json({ message: "employee, startDate and endDate are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(payload.employee)) {
      return res.status(400).json({ message: "Invalid employee id" });
    }

    const employee = await Employee.findById(payload.employee);
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const leave = await LeaveRequest.create({
      ...payload,
      status: "PENDING",
      requestedBy: req.user.id,
      approvedBy: undefined,
      decisionComment: "",
    });

    await logHistory({
      action: "LEAVE_REQUEST_CREATED",
      description: `Leave request created for employee ${employee.name || employee.firstName || employee._id}`,
      user: req.user.id,
      entityType: "LeaveRequest",
      entityId: leave._id,
    });

    const populated = await LeaveRequest.findById(leave._id)
      .populate("employee", "name firstName lastName employeeCode email")
      .populate("requestedBy", "firstName lastName email role")
      .populate("approvedBy", "firstName lastName email role");

    return res.status(201).json(populated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listLeaveRequests(req, res) {
  try {
    const query = {};

    if (req.query.employee) {
      if (!mongoose.Types.ObjectId.isValid(req.query.employee)) {
        return res.status(400).json({ message: "Invalid employee id" });
      }
      query.employee = req.query.employee;
    }
    if (req.query.status) query.status = String(req.query.status).toUpperCase();
    if (req.query.leaveType) query.leaveType = String(req.query.leaveType).toUpperCase();

    const leaves = await LeaveRequest.find(query)
      .populate("employee", "name firstName lastName employeeCode email")
      .populate("requestedBy", "firstName lastName email role")
      .populate("approvedBy", "firstName lastName email role")
      .sort({ createdAt: -1 });

    return res.json(leaves);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getLeaveRequestById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid leave request id" });
    }

    const leave = await LeaveRequest.findById(id)
      .populate("employee", "name firstName lastName employeeCode email")
      .populate("requestedBy", "firstName lastName email role")
      .populate("approvedBy", "firstName lastName email role");

    if (!leave) return res.status(404).json({ message: "Leave request not found" });
    return res.json(leave);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateLeaveRequest(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid leave request id" });
    }

    const payload = normalizeLeavePayload(req.body || {});
    delete payload.status;
    delete payload.approvedBy;
    delete payload.requestedBy;
    delete payload.decisionComment;

    if (payload.employee) {
      if (!mongoose.Types.ObjectId.isValid(payload.employee)) {
        return res.status(400).json({ message: "Invalid employee id" });
      }
      const employee = await Employee.findById(payload.employee);
      if (!employee) return res.status(404).json({ message: "Employee not found" });
    }

    const leave = await LeaveRequest.findById(id);
    if (!leave) return res.status(404).json({ message: "Leave request not found" });
    if (leave.status !== "PENDING") {
      return res.status(400).json({ message: "Only PENDING leave requests can be updated" });
    }

    Object.assign(leave, payload);
    await leave.save();

    await logHistory({
      action: "LEAVE_REQUEST_UPDATED",
      description: `Leave request ${leave._id} updated`,
      user: req.user.id,
      entityType: "LeaveRequest",
      entityId: leave._id,
    });

    const populated = await LeaveRequest.findById(leave._id)
      .populate("employee", "name firstName lastName employeeCode email")
      .populate("requestedBy", "firstName lastName email role")
      .populate("approvedBy", "firstName lastName email role");

    return res.json(populated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function cancelLeaveRequest(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid leave request id" });
    }

    const leave = await LeaveRequest.findById(id);
    if (!leave) return res.status(404).json({ message: "Leave request not found" });
    if (leave.status !== "APPROVED") {
      return res.status(400).json({ message: "Only APPROVED leave requests can be cancelled" });
    }

    leave.status = "CANCELLED";
    leave.decisionComment = req.body?.decisionComment || "Cancelled by requester";
    await leave.save();

    // Remettre l'employé en ACTIVE lorsque le congé approuvé est annulé
    if (leave.employee) {
      await Employee.findByIdAndUpdate(leave.employee, { status: "ACTIVE" }, { new: true });
      console.log(`✓ Employee ${leave.employee} marked as ACTIVE (leave cancelled)`);
    }

    await logHistory({
      action: "LEAVE_REQUEST_CANCELLED",
      description: `Leave request ${leave._id} cancelled`,
      user: req.user.id,
      entityType: "LeaveRequest",
      entityId: leave._id,
    });

    return res.json(leave);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function approveLeaveRequest(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid leave request id" });
    }

    const leave = await LeaveRequest.findById(id);
    if (!leave) return res.status(404).json({ message: "Leave request not found" });
    if (leave.status !== "PENDING") {
      return res.status(400).json({ message: "Only PENDING leave requests can be approved" });
    }

    leave.status = "APPROVED";
    leave.approvedBy = req.user.id;
    leave.decisionComment = req.body?.decisionComment || "Approved";
    await leave.save();

    // Mettre l'employé en ON_LEAVE pendant la période du congé approuvé
    if (leave.employee) {
      await Employee.findByIdAndUpdate(leave.employee, { status: "ON_LEAVE" }, { new: true });
      console.log(`✓ Employee ${leave.employee} marked as ON_LEAVE (approved from ${leave.startDate} to ${leave.endDate})`);
    }

    await logHistory({
      action: "LEAVE_REQUEST_APPROVED",
      description: `Leave request ${leave._id} approved`,
      user: req.user.id,
      entityType: "LeaveRequest",
      entityId: leave._id,
    });

    const populated = await LeaveRequest.findById(leave._id)
      .populate("employee", "name firstName lastName employeeCode email status")
      .populate("requestedBy", "firstName lastName email role")
      .populate("approvedBy", "firstName lastName email role");

    return res.json(populated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function rejectLeaveRequest(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid leave request id" });
    }

    const leave = await LeaveRequest.findById(id);
    if (!leave) return res.status(404).json({ message: "Leave request not found" });
    if (leave.status !== "PENDING") {
      return res.status(400).json({ message: "Only PENDING leave requests can be rejected" });
    }

    leave.status = "REJECTED";
    leave.approvedBy = req.user.id;
    leave.decisionComment = req.body?.decisionComment || "Rejected";
    await leave.save();

    await logHistory({
      action: "LEAVE_REQUEST_REJECTED",
      description: `Leave request ${leave._id} rejected`,
      user: req.user.id,
      entityType: "LeaveRequest",
      entityId: leave._id,
    });

    const populated = await LeaveRequest.findById(leave._id)
      .populate("employee", "name firstName lastName employeeCode email")
      .populate("requestedBy", "firstName lastName email role")
      .populate("approvedBy", "firstName lastName email role");

    return res.json(populated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createLeaveRequest,
  listLeaveRequests,
  getLeaveRequestById,
  updateLeaveRequest,
  cancelLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
};
