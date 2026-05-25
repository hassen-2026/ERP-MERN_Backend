const mongoose = require("mongoose");
const Position = require("../models/Position");
const Department = require("../models/Department");
const logHistory = require("../utils/historyLogger");

async function createPosition(req, res) {
  try {
    const { title, level, department, description, isActive } = req.body || {};
    if (!title) return res.status(400).json({ message: "title is required" });

    if (department && !mongoose.Types.ObjectId.isValid(department)) {
      return res.status(400).json({ message: "Invalid department id" });
    }
    if (department) {
      const departmentDoc = await Department.findById(department);
      if (!departmentDoc) return res.status(404).json({ message: "Department not found" });
    }

    const position = await Position.create({
      title,
      level,
      department,
      description,
      isActive,
      createdBy: req.user.id,
    });

    await logHistory({
      action: "POSITION_CREATED",
      description: `Position ${position.title} created`,
      user: req.user.id,
      entityType: "Position",
      entityId: position._id,
    });

    const populated = await Position.findById(position._id)
      .populate("department", "name code")
      .populate("createdBy", "firstName lastName email role");

    return res.status(201).json(populated);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Position title already exists in this department" });
    return res.status(500).json({ message: error.message });
  }
}

async function listPositions(req, res) {
  try {
    const query = {};
    if (req.query.department) {
      if (!mongoose.Types.ObjectId.isValid(req.query.department)) {
        return res.status(400).json({ message: "Invalid department id" });
      }
      query.department = req.query.department;
    }
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === "true";
    }

    const positions = await Position.find(query)
      .populate("department", "name code")
      .populate("createdBy", "firstName lastName email role")
      .sort({ createdAt: -1 });

    return res.json(positions);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getPositionById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid position id" });
    }

    const position = await Position.findById(id)
      .populate("department", "name code")
      .populate("createdBy", "firstName lastName email role");

    if (!position) return res.status(404).json({ message: "Position not found" });
    return res.json(position);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updatePosition(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid position id" });
    }

    const payload = { ...req.body };
    if (payload.department && !mongoose.Types.ObjectId.isValid(payload.department)) {
      return res.status(400).json({ message: "Invalid department id" });
    }
    if (payload.department) {
      const departmentDoc = await Department.findById(payload.department);
      if (!departmentDoc) return res.status(404).json({ message: "Department not found" });
    }

    const position = await Position.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    })
      .populate("department", "name code")
      .populate("createdBy", "firstName lastName email role");

    if (!position) return res.status(404).json({ message: "Position not found" });

    await logHistory({
      action: "POSITION_UPDATED",
      description: `Position ${position.title} updated`,
      user: req.user.id,
      entityType: "Position",
      entityId: position._id,
    });

    return res.json(position);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Position title already exists in this department" });
    return res.status(500).json({ message: error.message });
  }
}

async function deletePosition(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid position id" });
    }

    const position = await Position.findByIdAndDelete(id);
    if (!position) return res.status(404).json({ message: "Position not found" });

    await logHistory({
      action: "POSITION_DELETED",
      description: `Position ${position.title} deleted`,
      user: req.user.id,
      entityType: "Position",
      entityId: position._id,
    });

    return res.json({ message: "Position deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createPosition,
  listPositions,
  getPositionById,
  updatePosition,
  deletePosition,
};
