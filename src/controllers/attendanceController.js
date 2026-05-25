const mongoose = require("mongoose");
const Attendance = require("../models/Attendance");
const Employee = require("../models/Employee");
const logHistory = require("../utils/historyLogger");

function normalizeAttendancePayload(body = {}) {
  const payload = { ...body };
  if (payload.status) payload.status = String(payload.status).toUpperCase();
  if (payload.attendanceDate) payload.attendanceDate = new Date(payload.attendanceDate);
  if (payload.checkIn) payload.checkIn = new Date(payload.checkIn);
  if (payload.checkOut) payload.checkOut = new Date(payload.checkOut);
  return payload;
}

async function createAttendance(req, res) {
  try {
    const payload = normalizeAttendancePayload(req.body || {});
    if (!payload.employee || !payload.attendanceDate) {
      return res.status(400).json({ message: "employee and attendanceDate are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(payload.employee)) {
      return res.status(400).json({ message: "Invalid employee id" });
    }

    const employee = await Employee.findById(payload.employee);
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const attendance = await Attendance.create({
      ...payload,
      createdBy: req.user.id,
    });

    await logHistory({
      action: "ATTENDANCE_CREATED",
      description: `Attendance created for employee ${employee.name || employee.firstName || employee._id}`,
      user: req.user.id,
      entityType: "Attendance",
      entityId: attendance._id,
    });

    const populated = await Attendance.findById(attendance._id)
      .populate("employee", "name firstName lastName employeeCode email status department position")
      .populate("createdBy", "firstName lastName email role");

    return res.status(201).json(populated);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Attendance already exists for this employee and date" });
    return res.status(500).json({ message: error.message });
  }
}

async function listAttendances(req, res) {
  try {
    const query = {};
    if (req.query.employee) {
      if (!mongoose.Types.ObjectId.isValid(req.query.employee)) {
        return res.status(400).json({ message: "Invalid employee id" });
      }
      query.employee = req.query.employee;
    }
    if (req.query.status) query.status = String(req.query.status).toUpperCase();
    if (req.query.from || req.query.to) {
      query.attendanceDate = {};
      if (req.query.from) query.attendanceDate.$gte = new Date(req.query.from);
      if (req.query.to) query.attendanceDate.$lte = new Date(req.query.to);
    }

    const attendances = await Attendance.find(query)
      .populate("employee", "name firstName lastName employeeCode email status department position")
      .populate("createdBy", "firstName lastName email role")
      .sort({ attendanceDate: -1, createdAt: -1 });

    return res.json(attendances);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getAttendanceById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid attendance id" });
    }

    const attendance = await Attendance.findById(id)
      .populate("employee", "name firstName lastName employeeCode email status department position")
      .populate("createdBy", "firstName lastName email role");

    if (!attendance) return res.status(404).json({ message: "Attendance not found" });
    return res.json(attendance);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateAttendance(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid attendance id" });
    }

    const payload = normalizeAttendancePayload(req.body || {});
    if (payload.employee) {
      if (!mongoose.Types.ObjectId.isValid(payload.employee)) {
        return res.status(400).json({ message: "Invalid employee id" });
      }
      const employee = await Employee.findById(payload.employee);
      if (!employee) return res.status(404).json({ message: "Employee not found" });
    }

    const attendance = await Attendance.findByIdAndUpdate(id, payload, { new: true, runValidators: true })
      .populate("employee", "name firstName lastName employeeCode email status department position")
      .populate("createdBy", "firstName lastName email role");

    if (!attendance) return res.status(404).json({ message: "Attendance not found" });

    await logHistory({
      action: "ATTENDANCE_UPDATED",
      description: `Attendance ${attendance._id} updated`,
      user: req.user.id,
      entityType: "Attendance",
      entityId: attendance._id,
    });

    return res.json(attendance);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Attendance already exists for this employee and date" });
    return res.status(500).json({ message: error.message });
  }
}

async function deleteAttendance(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid attendance id" });
    }

    const attendance = await Attendance.findByIdAndDelete(id);
    if (!attendance) return res.status(404).json({ message: "Attendance not found" });

    await logHistory({
      action: "ATTENDANCE_DELETED",
      description: `Attendance ${attendance._id} deleted`,
      user: req.user.id,
      entityType: "Attendance",
      entityId: attendance._id,
    });

    return res.json({ message: "Attendance deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createAttendance,
  listAttendances,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
};
