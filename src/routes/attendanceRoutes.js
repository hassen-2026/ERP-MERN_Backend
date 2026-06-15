const express = require("express");
const {
  createAttendance,
  listAttendances,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
  validateAttendance,
} = require("../controllers/attendanceController");

const router = express.Router();

router.get("/", listAttendances);
router.post("/validate/:employeeId", validateAttendance);
router.get("/:id", getAttendanceById);
router.post("/", createAttendance);
router.put("/:id", updateAttendance);
router.delete("/:id", deleteAttendance);

module.exports = router;
