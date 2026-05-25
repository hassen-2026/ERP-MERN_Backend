const mongoose = require("mongoose");
const Transporter = require("../models/Transporter");
const logHistory = require("../utils/historyLogger");

async function createTransporter(req, res) {
  try {
    const { name, plateNumber, cin, photoProfile } = req.body;
    if (!name) return res.status(400).json({ message: "name is required" });
    const transporter = await Transporter.create({ name, plateNumber, cin, photoProfile });
    await logHistory({
      action: "TRANSPORTER_CREATED",
      description: `Transporter ${transporter.name} created`,
      user: req.user.id,
      entityType: "Transporter",
      entityId: transporter._id,
    });
    return res.status(201).json(transporter);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listTransporters(_req, res) {
  try {
    const list = await Transporter.find().sort({ createdAt: -1 });
    return res.json(list);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateTransporter(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid transporter id" });
    const transporter = await Transporter.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!transporter) return res.status(404).json({ message: "Transporter not found" });
    await logHistory({
      action: "TRANSPORTER_UPDATED",
      description: `Transporter ${transporter.name} updated`,
      user: req.user.id,
      entityType: "Transporter",
      entityId: transporter._id,
    });
    return res.json(transporter);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function deleteTransporter(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid transporter id" });
    const transporter = await Transporter.findByIdAndDelete(id);
    if (!transporter) return res.status(404).json({ message: "Transporter not found" });
    await logHistory({
      action: "TRANSPORTER_DELETED",
      description: `Transporter ${transporter.name} deleted`,
      user: req.user.id,
      entityType: "Transporter",
      entityId: transporter._id,
    });
    return res.json({ message: "Transporter deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = { createTransporter, listTransporters, updateTransporter, deleteTransporter };
