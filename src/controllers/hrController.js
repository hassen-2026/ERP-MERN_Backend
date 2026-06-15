const Employee = require("../models/Employee");
const Department = require("../models/Department");
const Position = require("../models/Position");
const Contract = require("../models/Contract");
const LeaveRequest = require("../models/LeaveRequest");
const RecruitmentCandidate = require("../models/RecruitmentCandidate");
const Payroll = require("../models/Payroll");
const Evaluation = require("../models/Evaluation");

/**
 * GET /api/hr/summary
 * Calculates overall HR KPI metrics and stats
 */
const getHrSummary = async (req, res) => {
  try {
    const employeeCount = await Employee.countDocuments({ status: "ACTIVE" });
    const pendingLeaves = await LeaveRequest.countDocuments({ status: "PENDING" });
    
    // Candidates in active recruitment stages
    const candidatesOpen = await RecruitmentCandidate.countDocuments({
      status: { $in: ["APPLIED", "SCREENING", "INTERVIEW", "OFFER"] },
    });
    
    const activeContracts = await Contract.countDocuments({ status: "ACTIVE" });
    const departmentsCount = await Department.countDocuments({ isActive: true });
    const positionsCount = await Position.countDocuments({});
    
    // Contracts expiring in the next 30 days
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiringContracts = await Contract.countDocuments({
      status: "ACTIVE",
      endDate: { $gte: new Date(), $lte: thirtyDaysFromNow },
    });
    
    // Payrolls generated for the current month
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();
    const payrollsThisMonth = await Payroll.countDocuments({
      periodMonth: currentMonth,
      periodYear: currentYear,
    });

    const candidatesHired = await RecruitmentCandidate.countDocuments({
      status: "HIRED",
    });

    // Employee distribution by department for the pie chart
    const distribution = await Employee.aggregate([
      { $match: { status: "ACTIVE" } },
      {
        $group: {
          _id: "$department",
          value: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "departments",
          localField: "_id",
          foreignField: "_id",
          as: "dept",
        },
      },
      { $unwind: { path: "$dept", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: { $ifNull: ["$dept.name", "Sans Département"] },
          value: 1,
          _id: 0,
        },
      },
    ]);

    res.json({
      employeeCount,
      pendingLeaves,
      candidatesOpen,
      activeContracts,
      trainingsPlanned: 4, // Mock since no training model exists
      departmentsCount,
      positionsCount,
      expiringContracts,
      expiringDocuments: 1, // Mock
      payrollsThisMonth,
      candidatesHired,
      departmentDistribution: distribution,
    });
  } catch (err) {
    console.error("Error in getHrSummary:", err);
    res.status(500).json({ message: "Erreur lors du chargement des statistiques RH.", error: err.message });
  }
};

/**
 * GET /api/hr/reports/monthly
 * Returns HR metrics for a specific month
 */
const getHrMonthlyReport = async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) {
      return res.status(400).json({ message: "Le paramètre 'month' est obligatoire." });
    }

    const reportDate = new Date(month);
    if (isNaN(reportDate.getTime())) {
      return res.status(400).json({ message: "Le paramètre 'month' doit être une date valide." });
    }

    const startOfMonth = new Date(reportDate.getFullYear(), reportDate.getMonth(), 1);
    const endOfMonth = new Date(reportDate.getFullYear(), reportDate.getMonth() + 1, 0, 23, 59, 59, 999);

    // 1. New employees hired this month
    const newEmployees = await Employee.countDocuments({
      hireDate: { $gte: startOfMonth, $lte: endOfMonth },
    });

    // 2. Leave requests approved this month
    const leaveApproved = await LeaveRequest.countDocuments({
      status: "APPROVED",
      startDate: { $gte: startOfMonth, $lte: endOfMonth },
    });

    // 3. Evaluations completed this month
    const evaluationsCompleted = await Evaluation.countDocuments({
      status: "COMPLETED",
      evaluationDate: { $gte: startOfMonth, $lte: endOfMonth },
    });

    // 4. Candidates hired this month
    const candidatesHired = await RecruitmentCandidate.countDocuments({
      status: "HIRED",
      updatedAt: { $gte: startOfMonth, $lte: endOfMonth },
    });

    // 5. Total payroll paid in this month
    const queryMonth = reportDate.getMonth() + 1; // 1-12
    const queryYear = reportDate.getFullYear();
    const payrolls = await Payroll.find({
      periodMonth: queryMonth,
      periodYear: queryYear,
      status: "PAID",
    });
    const payrollPaid = payrolls.reduce((sum, p) => sum + (p.netSalary || 0), 0);

    res.json({
      newEmployees,
      leaveApproved,
      trainingsCompleted: 1, // Mock
      payrollPaid,
      evaluationsCompleted,
      candidatesHired,
    });
  } catch (err) {
    console.error("Error in getHrMonthlyReport:", err);
    res.status(500).json({ message: "Erreur lors du chargement du rapport mensuel.", error: err.message });
  }
};

/**
 * GET /api/hr/alerts
 * Generates active HR alerts/notifications
 */
const getHrAlerts = async (req, res) => {
  try {
    const alerts = [];

    // Alert 1: Expiring contracts in next 30 days
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiringContractsList = await Contract.find({
      status: "ACTIVE",
      endDate: { $gte: new Date(), $lte: thirtyDaysFromNow },
    }).populate("employee", "name");

    expiringContractsList.forEach((c) => {
      alerts.push({
        type: "warning",
        message: `Le contrat de ${c.employee?.name || "l'employé"} (${c.contractType}) expire le ${new Date(c.endDate).toLocaleDateString("fr-FR")}.`,
      });
    });

    // Alert 2: Pending leave requests
    const pendingLeaveRequests = await LeaveRequest.find({ status: "PENDING" }).populate("employee", "name");
    if (pendingLeaveRequests.length > 0) {
      alerts.push({
        type: "info",
        message: `Il y a ${pendingLeaveRequests.length} demande(s) de congé en attente de validation.`,
      });
    }

    res.json(alerts);
  } catch (err) {
    console.error("Error in getHrAlerts:", err);
    res.status(500).json({ message: "Erreur lors du chargement des alertes RH.", error: err.message });
  }
};

module.exports = {
  getHrSummary,
  getHrMonthlyReport,
  getHrAlerts,
};
