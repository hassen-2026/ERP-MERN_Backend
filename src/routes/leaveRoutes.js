const express = require("express");
const authorizeRole = require("../middleware/authorizeRole");
const {
  createLeaveRequest,
  listLeaveRequests,
  getLeaveRequestById,
  updateLeaveRequest,
  cancelLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
} = require("../controllers/leaveController");

const router = express.Router();

router.get("/", listLeaveRequests);
router.get("/:id", getLeaveRequestById);
router.post("/", createLeaveRequest);
router.put("/:id", updateLeaveRequest);
router.patch("/:id/cancel", cancelLeaveRequest);
router.patch("/:id/approve", authorizeRole("ADMIN"), approveLeaveRequest);
router.patch("/:id/reject", authorizeRole("ADMIN"), rejectLeaveRequest);

module.exports = router;
