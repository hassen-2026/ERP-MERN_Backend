const Snapshot = require("../models/Snapshot");
const logHistory = require("../utils/historyLogger");

async function createSnapshot(req, res) {
  try {
    const { type, date, description, generatedReport, data } = req.body;
    if (!type) return res.status(400).json({ message: "type is required" });

    const snapshot = await Snapshot.create({
      type,
      date,
      description,
      generatedReport,
      data,
      createdBy: req.user.id,
    });

    await logHistory({
      action: "SNAPSHOT_CREATED",
      description: `Snapshot ${snapshot._id} created`,
      user: req.user.id,
      entityType: "Snapshot",
      entityId: snapshot._id,
      metaData: { type },
    });
    return res.status(201).json(snapshot);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listSnapshots(_req, res) {
  try {
    const snapshots = await Snapshot.find()
      .populate("createdBy", "firstName lastName email role")
      .sort({ createdAt: -1 });
    return res.json(snapshots);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = { createSnapshot, listSnapshots };
