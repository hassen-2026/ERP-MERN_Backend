const mongoose = require("mongoose");
const Department = require("../models/Department");
const Employee = require("../models/Employee");
const logHistory = require("../utils/historyLogger");

async function createDepartment(req, res) {
  try {
    const { name, code, description, manager, isActive, imageUrl } = req.body || {};
    const finalImageUrl = req.file?.path || imageUrl || "";
    const finalImagePublicId = req.file?.filename || "";
    const normalizedIsActive = isActive !== undefined ? String(isActive) === "true" || isActive === true : undefined;
    if (!name) return res.status(400).json({ message: "name is required" });

    if (manager && !mongoose.Types.ObjectId.isValid(manager)) {
      return res.status(400).json({ message: "Invalid manager id" });
    }
    if (manager) {
      const managerEmployee = await Employee.findById(manager);
      if (!managerEmployee) return res.status(404).json({ message: "Manager employee not found" });
    }

    const department = await Department.create({
      name,
      code,
      description,
      imageUrl: finalImageUrl,
      imagePublicId: finalImagePublicId,
      manager,
      isActive: normalizedIsActive,
      createdBy: req.user.id,
    });

    await logHistory({
      action: "DEPARTMENT_CREATED",
      description: `Department ${department.name} created`,
      user: req.user.id,
      entityType: "Department",
      entityId: department._id,
    });

    return res.status(201).json(department);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Department name/code already exists" });
    return res.status(500).json({ message: error.message });
  }
}

async function listDepartments(req, res) {
  try {
    const query = {};
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === "true";
    }

    const departments = await Department.find(query)
      .populate("manager", "name firstName lastName email")
      .populate("createdBy", "firstName lastName email role")
      .sort({ createdAt: -1 });

    return res.json(departments);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getDepartmentById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid department id" });
    }

    const department = await Department.findById(id)
      .populate("manager", "name firstName lastName email")
      .populate("createdBy", "firstName lastName email role");

    if (!department) return res.status(404).json({ message: "Department not found" });
    return res.json(department);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateDepartment(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid department id" });
    }

    const payload = { ...req.body };
    if (payload.isActive !== undefined) {
      payload.isActive = String(payload.isActive) === "true" || payload.isActive === true;
    }
    if (req.file?.path) payload.imageUrl = req.file.path;
    if (req.file?.filename) payload.imagePublicId = req.file.filename;
    if (payload.manager && !mongoose.Types.ObjectId.isValid(payload.manager)) {
      return res.status(400).json({ message: "Invalid manager id" });
    }
    if (payload.manager) {
      const managerEmployee = await Employee.findById(payload.manager);
      if (!managerEmployee) return res.status(404).json({ message: "Manager employee not found" });
    }

    const department = await Department.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    })
      .populate("manager", "name firstName lastName email")
      .populate("createdBy", "firstName lastName email role");

    if (!department) return res.status(404).json({ message: "Department not found" });

    await logHistory({
      action: "DEPARTMENT_UPDATED",
      description: `Department ${department.name} updated`,
      user: req.user.id,
      entityType: "Department",
      entityId: department._id,
    });

    return res.json(department);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Department name/code already exists" });
    return res.status(500).json({ message: error.message });
  }
}

async function deleteDepartment(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid department id" });
    }

    const department = await Department.findByIdAndDelete(id);
    if (!department) return res.status(404).json({ message: "Department not found" });

    await logHistory({
      action: "DEPARTMENT_DELETED",
      description: `Department ${department.name} deleted`,
      user: req.user.id,
      entityType: "Department",
      entityId: department._id,
    });

    return res.json({ message: "Department deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createDepartment,
  listDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
};
