const mongoose = require("mongoose");
const Training = require("../models/Training");
const Employee = require("../models/Employee");
const logHistory = require("../utils/historyLogger");

function normalizeTrainingPayload(body = {}) {
  const payload = { ...body };
  if (payload.status) payload.status = String(payload.status).toUpperCase();
  if (payload.startDate) payload.startDate = new Date(payload.startDate);
  if (payload.endDate) payload.endDate = new Date(payload.endDate);
  if (Array.isArray(payload.participants)) {
    payload.participants = payload.participants.filter((id) => mongoose.Types.ObjectId.isValid(id));
  }
  return payload;
}

async function createTraining(req, res) {
  try {
    const payload = normalizeTrainingPayload(req.body || {});
    if (!payload.title || !payload.startDate) {
      return res.status(400).json({ message: "title and startDate are required" });
    }

    if (payload.participants?.length) {
      const participants = await Employee.find({ _id: { $in: payload.participants } });
      if (participants.length !== payload.participants.length) {
        return res.status(400).json({ message: "One or more participant employees are invalid" });
      }
    }

    const training = await Training.create({
      ...payload,
      createdBy: req.user.id,
    });

    await logHistory({
      action: "TRAINING_CREATED",
      description: `Training ${training.title} created`,
      user: req.user.id,
      entityType: "Training",
      entityId: training._id,
    });

    const populated = await Training.findById(training._id)
      .populate("participants", "name firstName lastName employeeCode email status")
      .populate("createdBy", "firstName lastName email role");

    return res.status(201).json(populated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listTrainings(req, res) {
  try {
    const query = {};
    if (req.query.status) query.status = String(req.query.status).toUpperCase();
    if (req.query.title) query.title = { $regex: String(req.query.title), $options: "i" };

    const trainings = await Training.find(query)
      .populate("participants", "name firstName lastName employeeCode email status")
      .populate("createdBy", "firstName lastName email role")
      .sort({ startDate: -1, createdAt: -1 });

    return res.json(trainings);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getTrainingById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid training id" });
    }

    const training = await Training.findById(id)
      .populate("participants", "name firstName lastName employeeCode email status")
      .populate("createdBy", "firstName lastName email role");

    if (!training) return res.status(404).json({ message: "Training not found" });
    return res.json(training);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateTraining(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid training id" });
    }

    const payload = normalizeTrainingPayload(req.body || {});
    if (payload.participants?.length) {
      const participants = await Employee.find({ _id: { $in: payload.participants } });
      if (participants.length !== payload.participants.length) {
        return res.status(400).json({ message: "One or more participant employees are invalid" });
      }
    }

    const training = await Training.findByIdAndUpdate(id, payload, { new: true, runValidators: true })
      .populate("participants", "name firstName lastName employeeCode email status")
      .populate("createdBy", "firstName lastName email role");

    if (!training) return res.status(404).json({ message: "Training not found" });

    await logHistory({
      action: "TRAINING_UPDATED",
      description: `Training ${training.title} updated`,
      user: req.user.id,
      entityType: "Training",
      entityId: training._id,
    });

    return res.json(training);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function deleteTraining(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid training id" });
    }

    const training = await Training.findByIdAndDelete(id);
    if (!training) return res.status(404).json({ message: "Training not found" });

    await logHistory({
      action: "TRAINING_DELETED",
      description: `Training ${training.title} deleted`,
      user: req.user.id,
      entityType: "Training",
      entityId: training._id,
    });

    return res.json({ message: "Training deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createTraining,
  listTrainings,
  getTrainingById,
  updateTraining,
  deleteTraining,
};
