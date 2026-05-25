const express = require("express");
const { listMyNotifications, getUnreadCount, markAsRead, markAllAsRead } = require("../controllers/notificationController");

const router = express.Router();

router.get("/", listMyNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/:id/read", markAsRead);
router.patch("/read-all", markAllAsRead);

module.exports = router;
