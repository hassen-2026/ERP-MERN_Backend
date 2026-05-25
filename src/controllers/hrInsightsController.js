const Contract = require("../models/Contract");
const LeaveRequest = require("../models/LeaveRequest");
const EmployeeDocument = require("../models/EmployeeDocument");
const Payroll = require("../models/Payroll");
const Evaluation = require("../models/Evaluation");
const Training = require("../models/Training");
const RecruitmentCandidate = require("../models/RecruitmentCandidate");
const Employee = require("../models/Employee");
const Department = require("../models/Department");
const Position = require("../models/Position");

function getMonthBounds(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

async function getHrSummary(_req, res) {
  try {
    const now = new Date();
    const inThirtyDays = new Date(now);
    inThirtyDays.setDate(now.getDate() + 30);

    const [employeeCount, activeEmployees, departmentsCount, positionsCount, pendingLeaves, activeContracts, expiringContracts, expiringDocuments, payrollsThisMonth, trainingsPlanned, evaluationsThisMonth, candidatesOpen] = await Promise.all([
      Employee.countDocuments(),
      Employee.countDocuments({ status: "ACTIVE" }),
      Department.countDocuments({ isActive: true }),
      Position.countDocuments({ isActive: true }),
      LeaveRequest.countDocuments({ status: "PENDING" }),
      Contract.countDocuments({ status: "ACTIVE" }),
      Contract.countDocuments({ status: "ACTIVE", endDate: { $lte: inThirtyDays, $gte: now } }),
      EmployeeDocument.countDocuments({ expirationDate: { $lte: inThirtyDays, $gte: now } }),
      Payroll.countDocuments({ periodMonth: now.getMonth() + 1, periodYear: now.getFullYear() }),
      Training.countDocuments({ status: { $in: ["PLANNED", "ONGOING"] } }),
      Evaluation.countDocuments({ evaluationDate: { $gte: new Date(now.getFullYear(), now.getMonth(), 1), $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999) } }),
      RecruitmentCandidate.countDocuments({ status: { $nin: ["HIRED", "REJECTED"] } }),
    ]);

    return res.json({
      employeeCount,
      activeEmployees,
      departmentsCount,
      positionsCount,
      pendingLeaves,
      activeContracts,
      expiringContracts,
      expiringDocuments,
      payrollsThisMonth,
      trainingsPlanned,
      evaluationsThisMonth,
      candidatesOpen,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getHrAlerts(_req, res) {
  try {
    const now = new Date();
    const inThirtyDays = new Date(now);
    inThirtyDays.setDate(now.getDate() + 30);

    const [contractsExpiringSoon, documentsExpiringSoon, leavesPending, payrollsPending, candidatesInProgress] = await Promise.all([
      Contract.find({ status: "ACTIVE", endDate: { $lte: inThirtyDays, $gte: now } })
        .populate("employee", "name firstName lastName employeeCode email")
        .sort({ endDate: 1 })
        .limit(10),
      EmployeeDocument.find({ expirationDate: { $lte: inThirtyDays, $gte: now } })
        .populate("employee", "name firstName lastName employeeCode email")
        .sort({ expirationDate: 1 })
        .limit(10),
      LeaveRequest.find({ status: "PENDING" })
        .populate("employee", "name firstName lastName employeeCode email")
        .sort({ createdAt: -1 })
        .limit(10),
      Payroll.find({ status: { $in: ["DRAFT", "CALCULATED"] } })
        .populate("employee", "name firstName lastName employeeCode email")
        .sort({ createdAt: -1 })
        .limit(10),
      RecruitmentCandidate.find({ status: { $in: ["APPLIED", "SCREENING", "INTERVIEW", "OFFER"] } })
        .sort({ createdAt: -1 })
        .limit(10),
    ]);

    return res.json({
      contractsExpiringSoon,
      documentsExpiringSoon,
      leavesPending,
      payrollsPending,
      candidatesInProgress,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getHrMonthlyReport(_req, res) {
  try {
    const targetDate = _req.query.month ? new Date(_req.query.month) : new Date();
    const { start, end } = getMonthBounds(targetDate);

    const [newEmployees, contractStarts, leaveApproved, trainingsCompleted, payrollPaid, evaluationsCompleted, candidatesHired] = await Promise.all([
      Employee.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      Contract.countDocuments({ startDate: { $gte: start, $lte: end } }),
      LeaveRequest.countDocuments({ status: "APPROVED", updatedAt: { $gte: start, $lte: end } }),
      Training.countDocuments({ status: "COMPLETED", updatedAt: { $gte: start, $lte: end } }),
      Payroll.countDocuments({ status: "PAID", paymentDate: { $gte: start, $lte: end } }),
      Evaluation.countDocuments({ status: "COMPLETED", evaluationDate: { $gte: start, $lte: end } }),
      RecruitmentCandidate.countDocuments({ status: "HIRED", updatedAt: { $gte: start, $lte: end } }),
    ]);

    return res.json({
      period: {
        month: start.getMonth() + 1,
        year: start.getFullYear(),
      },
      newEmployees,
      contractStarts,
      leaveApproved,
      trainingsCompleted,
      payrollPaid,
      evaluationsCompleted,
      candidatesHired,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  getHrSummary,
  getHrAlerts,
  getHrMonthlyReport,
};
