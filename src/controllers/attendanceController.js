const mongoose = require("mongoose");
const Attendance = require("../models/Attendance");
const Employee = require("../models/Employee");
const logHistory = require("../utils/historyLogger");
const sendEmail = require("../utils/mailer");

function normalizeAttendancePayload(body = {}) {
  const payload = { ...body };
  if (payload.status) payload.status = String(payload.status).toUpperCase();
  if (payload.attendanceDate) payload.attendanceDate = new Date(payload.attendanceDate);
  if (payload.checkIn) payload.checkIn = new Date(payload.checkIn);
  if (payload.checkOut) payload.checkOut = new Date(payload.checkOut);
  return payload;
}

async function createAttendance(req, res) {
  try {
    const payload = normalizeAttendancePayload(req.body || {});
    if (!payload.employee || !payload.attendanceDate) {
      return res.status(400).json({ message: "employee and attendanceDate are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(payload.employee)) {
      return res.status(400).json({ message: "Invalid employee id" });
    }

    const employee = await Employee.findById(payload.employee);
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const attendance = await Attendance.create({
      ...payload,
      createdBy: req.user.id,
    });

    await logHistory({
      action: "ATTENDANCE_CREATED",
      description: `Attendance created for employee ${employee.name || employee.firstName || employee._id}`,
      user: req.user.id,
      entityType: "Attendance",
      entityId: attendance._id,
    });

    const populated = await Attendance.findById(attendance._id)
      .populate("employee", "name firstName lastName employeeCode email status department position")
      .populate("createdBy", "firstName lastName email role");

    return res.status(201).json(populated);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Attendance already exists for this employee and date" });
    return res.status(500).json({ message: error.message });
  }
}

async function listAttendances(req, res) {
  try {
    const query = {};
    if (req.query.employee) {
      if (!mongoose.Types.ObjectId.isValid(req.query.employee)) {
        return res.status(400).json({ message: "Invalid employee id" });
      }
      query.employee = req.query.employee;
    }
    if (req.query.status) query.status = String(req.query.status).toUpperCase();
    if (req.query.from || req.query.to) {
      query.attendanceDate = {};
      if (req.query.from) query.attendanceDate.$gte = new Date(req.query.from);
      if (req.query.to) query.attendanceDate.$lte = new Date(req.query.to);
    }

    const attendances = await Attendance.find(query)
      .populate("employee", "name firstName lastName employeeCode email status department position")
      .populate("createdBy", "firstName lastName email role")
      .sort({ attendanceDate: -1, createdAt: -1 });

    return res.json(attendances);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getAttendanceById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid attendance id" });
    }

    const attendance = await Attendance.findById(id)
      .populate("employee", "name firstName lastName employeeCode email status department position")
      .populate("createdBy", "firstName lastName email role");

    if (!attendance) return res.status(404).json({ message: "Attendance not found" });
    return res.json(attendance);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateAttendance(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid attendance id" });
    }

    const payload = normalizeAttendancePayload(req.body || {});
    if (payload.employee) {
      if (!mongoose.Types.ObjectId.isValid(payload.employee)) {
        return res.status(400).json({ message: "Invalid employee id" });
      }
      const employee = await Employee.findById(payload.employee);
      if (!employee) return res.status(404).json({ message: "Employee not found" });
    }

    const attendance = await Attendance.findByIdAndUpdate(id, payload, { new: true, runValidators: true })
      .populate("employee", "name firstName lastName employeeCode email status department position")
      .populate("createdBy", "firstName lastName email role");

    if (!attendance) return res.status(404).json({ message: "Attendance not found" });

    await logHistory({
      action: "ATTENDANCE_UPDATED",
      description: `Attendance ${attendance._id} updated`,
      user: req.user.id,
      entityType: "Attendance",
      entityId: attendance._id,
    });

    return res.json(attendance);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Attendance already exists for this employee and date" });
    return res.status(500).json({ message: error.message });
  }
}

async function deleteAttendance(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid attendance id" });
    }

    const attendance = await Attendance.findByIdAndDelete(id);
    if (!attendance) return res.status(404).json({ message: "Attendance not found" });

    await logHistory({
      action: "ATTENDANCE_DELETED",
      description: `Attendance ${attendance._id} deleted`,
      user: req.user.id,
      entityType: "Attendance",
      entityId: attendance._id,
    });

    return res.json({ message: "Attendance deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function validateAttendance(req, res) {
  try {
    const { employeeId } = req.params;
    const { month, year } = req.body;

    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ message: "Invalid employee id" });
    }

    const parsedMonth = Number(month);
    const parsedYear = Number(year);

    if (!parsedMonth || !parsedYear || parsedMonth < 1 || parsedMonth > 12) {
      return res.status(400).json({ message: "Valid month (1-12) and year are required" });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const startDate = new Date(parsedYear, parsedMonth - 1, 1);
    const endDate = new Date(parsedYear, parsedMonth, 0, 23, 59, 59);

    const result = await Attendance.updateMany(
      {
        employee: employeeId,
        attendanceDate: { $gte: startDate, $lte: endDate },
      },
      { $set: { status: "PRESENT" } }
    );

    await logHistory({
      action: "ATTENDANCE_VALIDATED",
      description: `Attendances validated for employee ${employee.firstName || employee.name || employeeId} - ${parsedMonth}/${parsedYear}`,
      user: req.user.id,
      entityType: "Attendance",
      entityId: employeeId,
    });

    // Envoi récapitulatif de présence par e-mail (fire-and-forget)
    const employeeEmail = employee?.email;
    if (employeeEmail) {
      const firstName = employee?.firstName || employee?.name || "Employé";
      const period = `${String(parsedMonth).padStart(2, "0")}/${parsedYear}`;
      // Comptage des présences du mois pour le récapitulatif
      Attendance.find({
        employee: employeeId,
        attendanceDate: { $gte: startDate, $lte: endDate },
      }).then((attendances) => {
        const counts = attendances.reduce((acc, a) => {
          acc[a.status] = (acc[a.status] || 0) + 1;
          return acc;
        }, {});
        const totalDays = attendances.length;
        const present = counts["PRESENT"] || 0;
        const absent = counts["ABSENT"] || 0;
        const late = counts["LATE"] || 0;
        sendEmail({
          mail: employeeEmail,
          subject: `Fiche de présence validée - ${period}`,
          content: `Bonjour ${firstName},\n\nVotre fiche de présence du mois ${period} a été validée.\n\nRécapitulatif :\n- Jours enregistrés : ${totalDays}\n- Présent(s) : ${present}\n- Absent(s) : ${absent}\n- Retard(s) : ${late}\n\nCordialement,\nService RH`,
          html: `
            <p>Bonjour <strong>${firstName}</strong>,</p>
            <p>Votre fiche de présence du mois <strong>${period}</strong> a été validée.</p>
            <table style="border-collapse:collapse;margin-top:8px">
              <tr><td style="padding:4px 12px 4px 0"><strong>Jours enregistrés :</strong></td><td>${totalDays}</td></tr>
              <tr><td style="padding:4px 12px 4px 0"><strong>Présent(s) :</strong></td><td>${present}</td></tr>
              <tr><td style="padding:4px 12px 4px 0"><strong>Absent(s) :</strong></td><td>${absent}</td></tr>
              <tr><td style="padding:4px 12px 4px 0"><strong>Retard(s) :</strong></td><td>${late}</td></tr>
            </table>
            <p style="margin-top:16px">Cordialement,<br/>Service RH</p>
          `,
        })
          .then(() => console.log(`[ATTENDANCE][MAIL] Envoi réussi → ${employeeEmail}`))
          .catch((err) => console.error(`[ATTENDANCE][MAIL] Échec → ${employeeEmail}:`, err.message));
      }).catch((err) => console.error("[ATTENDANCE][MAIL] Erreur comptage:", err.message));
    }

    return res.json({
      message: `${result.modifiedCount} présence(s) validée(s) pour ${parsedMonth}/${parsedYear}`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createAttendance,
  listAttendances,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
  validateAttendance,
};
