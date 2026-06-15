const mongoose = require("mongoose");
const Employee = require("../models/Employee");
const Contract = require("../models/Contract");
const Payroll = require("../models/Payroll");
const Evaluation = require("../models/Evaluation");

async function getMyEmployeeProfile(req, res) {
  try {
    const employee = await Employee.findOne({
      email: req.user.email.toLowerCase()
    }).populate("department").populate("positionRef").populate("manager", "name email");

    if (!employee) {
      return res.status(404).json({ message: "Aucun profil employé associé à ce compte." });
    }

    return res.json(employee);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getMyContracts(req, res) {
  try {
    const employee = await Employee.findOne({
      email: req.user.email.toLowerCase()
    });

    if (!employee) {
      return res.status(404).json({ message: "Aucun profil employé associé." });
    }

    const contracts = await Contract.find({ employee: employee._id })
      .populate("createdBy", "firstName lastName")
      .sort({ startDate: -1 });

    return res.json(contracts);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getMyPayrolls(req, res) {
  try {
    const employee = await Employee.findOne({
      email: req.user.email.toLowerCase()
    });

    if (!employee) {
      return res.status(404).json({ message: "Aucun profil employé associé." });
    }

    const payrolls = await Payroll.find({ employee: employee._id })
      .sort({ year: -1, month: -1 });

    return res.json(payrolls);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getMyEvaluations(req, res) {
  try {
    const employee = await Employee.findOne({
      email: req.user.email.toLowerCase()
    });

    if (!employee) {
      return res.status(404).json({ message: "Aucun profil employé associé." });
    }

    const evaluations = await Evaluation.find({ employee: employee._id })
      .populate("evaluator", "firstName lastName email")
      .sort({ evaluationDate: -1 });

    return res.json(evaluations);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getMyPayrollPdf(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID de bulletin de paie invalide" });
    }

    const employee = await Employee.findOne({
      email: req.user.email.toLowerCase()
    });

    if (!employee) {
      return res.status(404).json({ message: "Aucun profil employé associé." });
    }

    const payroll = await Payroll.findOne({ _id: id, employee: employee._id })
      .populate({
        path: "employee",
        populate: [
          { path: "department", select: "name" },
          { path: "positionRef", select: "title level" }
        ]
      })
      .populate("createdBy", "firstName lastName email role");

    if (!payroll) {
      return res.status(404).json({ message: "Bulletin de paie non trouvé ou accès refusé." });
    }

    const { generatePdf } = require("../services/pdfService");
    const pdfBuffer = await generatePdf("payroll", payroll);

    const empName = payroll.employee?.name || `${payroll.employee?.firstName || ""} ${payroll.employee?.lastName || ""}`.trim() || "Employe";
    const safeEmpName = empName.replace(/[^a-zA-Z0-9-_]/g, "_");
    const filename = `fiche-de-paie-${safeEmpName}-${payroll.periodMonth || ""}_${payroll.periodYear || ""}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=${filename}`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating personal payroll PDF:", error);
    return res.status(500).json({ message: error.message });
  }
}

async function getMyEvaluationPdf(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID d'évaluation invalide" });
    }

    const employee = await Employee.findOne({
      email: req.user.email.toLowerCase()
    });

    if (!employee) {
      return res.status(404).json({ message: "Aucun profil employé associé." });
    }

    const evaluation = await Evaluation.findOne({ _id: id, employee: employee._id })
      .populate({
        path: "employee",
        populate: [
          { path: "department", select: "name" },
          { path: "positionRef", select: "title level" }
        ]
      })
      .populate("evaluator", "firstName lastName email role");

    if (!evaluation) {
      return res.status(404).json({ message: "Évaluation non trouvée ou accès refusé." });
    }

    const { generatePdf } = require("../services/pdfService");
    const pdfBuffer = await generatePdf("evaluation", evaluation);

    const empName = evaluation.employee?.name || `${evaluation.employee?.firstName || ""} ${evaluation.employee?.lastName || ""}`.trim() || "Employe";
    const safeEmpName = empName.replace(/[^a-zA-Z0-9-_]/g, "_");
    const filename = `fiche-d-evaluation-${safeEmpName}-${evaluation.periodLabel || ""}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=${filename}`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating personal evaluation PDF:", error);
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  getMyEmployeeProfile,
  getMyContracts,
  getMyPayrolls,
  getMyEvaluations,
  getMyPayrollPdf,
  getMyEvaluationPdf,
};
