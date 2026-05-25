const mongoose = require("mongoose");
const Employee = require("../models/Employee");
const Department = require("../models/Department");
const Position = require("../models/Position");
const logHistory = require("../utils/historyLogger");

function normalizeNameParts(body = {}) {
  const firstName = (body.firstName || "").trim();
  const lastName = (body.lastName || "").trim();
  const legacyName = (body.name || "").trim();

  let name = legacyName;
  if (!name && (firstName || lastName)) {
    name = `${firstName} ${lastName}`.trim();
  }

  if ((!firstName || !lastName) && legacyName.includes(" ")) {
    const tokens = legacyName.split(" ").filter(Boolean);
    if (!firstName && tokens.length > 0) body.firstName = tokens[0];
    if (!lastName && tokens.length > 1) body.lastName = tokens.slice(1).join(" ");
  }

  body.name = name;
  body.firstName = (body.firstName || firstName || "").trim();
  body.lastName = (body.lastName || lastName || "").trim();
}

async function validateRelations(payload) {
  if (payload.department) {
    if (!mongoose.Types.ObjectId.isValid(payload.department)) {
      throw new Error("Invalid department id");
    }
    const department = await Department.findById(payload.department);
    if (!department) throw new Error("Department not found");
  }

  if (payload.positionRef) {
    if (!mongoose.Types.ObjectId.isValid(payload.positionRef)) {
      throw new Error("Invalid position id");
    }
    const position = await Position.findById(payload.positionRef);
    if (!position) throw new Error("Position not found");
  }

  if (payload.manager) {
    if (!mongoose.Types.ObjectId.isValid(payload.manager)) {
      throw new Error("Invalid manager id");
    }
    const manager = await Employee.findById(payload.manager);
    if (!manager) throw new Error("Manager not found");
  }
}

function normalizePayload(body = {}) {
  const payload = { ...body };
  normalizeNameParts(payload);
  if (payload.cin) payload.cin = String(payload.cin).trim().toUpperCase();
  if (payload.gender) payload.gender = String(payload.gender).trim().toUpperCase();
  if (payload.nationality) payload.nationality = String(payload.nationality).trim();
  if (payload.contractType) payload.contractType = String(payload.contractType).toUpperCase();
  if (payload.status) payload.status = String(payload.status).toUpperCase();
  if (payload.birthDate === "") payload.birthDate = undefined;
  return payload;
}

function toValidationStatus(error) {
  if (
    error.message.includes("Invalid") ||
    error.message.includes("not found") ||
    error.message.includes("required")
  ) {
    return 400;
  }
  return 500;
}

async function generateEmployeeCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const timePart = Date.now().toString().slice(-6);
    const randomPart = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
    const candidate = `EMP${timePart}${randomPart}`;
    const exists = await Employee.exists({ employeeCode: candidate });
    if (!exists) return candidate;
  }

  throw new Error("Failed to generate unique employee code");
}

async function createEmployee(req, res) {
  try {
    const payload = normalizePayload(req.body || {});
    if (!payload.name) return res.status(400).json({ message: "name or firstName/lastName is required" });

    payload.employeeCode = await generateEmployeeCode();
    payload.imageUrl = req.file?.path || payload.imageUrl || "";
    payload.imagePublicId = req.file?.filename || payload.imagePublicId || "";

    await validateRelations(payload);

    const employee = await Employee.create({
      ...payload,
      managedBy: req.user.id,
    });

    await logHistory({
      action: "EMPLOYEE_CREATED",
      description: `Employee ${employee.name} created`,
      user: req.user.id,
      entityType: "Employee",
      entityId: employee._id,
    });

    const populated = await Employee.findById(employee._id)
      .populate("department", "name code")
      .populate("positionRef", "title level")
      .populate("manager", "name firstName lastName employeeCode")
      .populate("managedBy", "firstName lastName email role");

    return res.status(201).json(populated);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "employeeCode or CIN already exists" });
    }
    const status = toValidationStatus(error);
    if (status === 400) return res.status(status).json({ message: error.message });
    return res.status(500).json({ message: error.message });
  }
}

async function listEmployees(req, res) {
  try {
    const query = {};
    if (req.query.department) {
      if (!mongoose.Types.ObjectId.isValid(req.query.department)) {
        return res.status(400).json({ message: "Invalid department id" });
      }
      query.department = req.query.department;
    }
    if (req.query.status) query.status = String(req.query.status).toUpperCase();
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i");
      query.$or = [
        { name: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { employeeCode: searchRegex },
      ];
    }

    const employees = await Employee.find(query)
      .populate("department", "name code")
      .populate("positionRef", "title level")
      .populate("manager", "name firstName lastName employeeCode")
      .populate("managedBy", "firstName lastName email role")
      .sort({ createdAt: -1 });

    return res.json(employees);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getEmployeeById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid employee id" });
    }
    const employee = await Employee.findById(id)
      .populate("department", "name code")
      .populate("positionRef", "title level")
      .populate("manager", "name firstName lastName employeeCode")
      .populate("managedBy", "firstName lastName email role");
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    return res.json(employee);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateEmployee(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid employee id" });
    }
    const payload = normalizePayload(req.body || {});
    if (req.file?.path) payload.imageUrl = req.file.path;
    if (req.file?.filename) payload.imagePublicId = req.file.filename;
    delete payload.employeeCode;
    await validateRelations(payload);

    const employee = await Employee.findByIdAndUpdate(id, payload, { new: true, runValidators: true })
      .populate("department", "name code")
      .populate("positionRef", "title level")
      .populate("manager", "name firstName lastName employeeCode")
      .populate("managedBy", "firstName lastName email role");
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    await logHistory({
      action: "EMPLOYEE_UPDATED",
      description: `Employee ${employee.name} updated`,
      user: req.user.id,
      entityType: "Employee",
      entityId: employee._id,
    });
    return res.json(employee);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "employeeCode or CIN already exists" });
    }
    const status = toValidationStatus(error);
    if (status === 400) return res.status(status).json({ message: error.message });
    return res.status(500).json({ message: error.message });
  }
}

async function deleteEmployee(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid employee id" });
    }
    const employee = await Employee.findByIdAndDelete(id);
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    await logHistory({
      action: "EMPLOYEE_DELETED",
      description: `Employee ${employee.name} deleted`,
      user: req.user.id,
      entityType: "Employee",
      entityId: employee._id,
    });
    return res.json({ message: "Employee deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = { createEmployee, listEmployees, getEmployeeById, updateEmployee, deleteEmployee };
