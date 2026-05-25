const mongoose = require("mongoose");
const Notification = require("../models/Notification");

async function listMyNotifications(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const unreadOnly = String(req.query.unreadOnly || "false").toLowerCase() === "true";
    const filter = { recipient: req.user.id };

    if (unreadOnly) {
      filter.readAt = null;
    }

    const notifications = await Notification.find(filter)
      .populate("createdBy", "firstName lastName email role")
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.json(notifications);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getUnreadCount(req, res) {
  try {
    const count = await Notification.countDocuments({ recipient: req.user.id, readAt: null });
    return res.json({ unreadCount: count });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function markAsRead(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid notification id" });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: req.user.id },
      { $set: { readAt: new Date() } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.json(notification);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function markAllAsRead(req, res) {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, readAt: null },
      { $set: { readAt: new Date() } }
    );
    return res.json({ message: "Notifications marked as read" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  listMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
