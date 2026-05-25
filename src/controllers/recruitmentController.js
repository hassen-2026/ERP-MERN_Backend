const mongoose = require("mongoose");
const RecruitmentCandidate = require("../models/RecruitmentCandidate");
const Employee = require("../models/Employee");
const logHistory = require("../utils/historyLogger");

function normalizeCandidatePayload(body = {}) {
  const payload = { ...body };
  if (payload.status) payload.status = String(payload.status).toUpperCase();
  if (payload.email) payload.email = String(payload.email).trim().toLowerCase();
  if (payload.expectedSalary !== undefined) payload.expectedSalary = Number(payload.expectedSalary);
  return payload;
}

async function createCandidate(req, res) {
  try {
    const payload = normalizeCandidatePayload(req.body || {});
    if (!payload.fullName) {
      return res.status(400).json({ message: "fullName is required" });
    }

    const candidate = await RecruitmentCandidate.create({
      ...payload,
      createdBy: req.user.id,
    });

    await logHistory({
      action: "RECRUITMENT_CANDIDATE_CREATED",
      description: `Candidate ${candidate.fullName} created`,
      user: req.user.id,
      entityType: "RecruitmentCandidate",
      entityId: candidate._id,
    });

    const populated = await RecruitmentCandidate.findById(candidate._id)
      .populate("hiredEmployee", "name firstName lastName employeeCode email status department position")
      .populate("createdBy", "firstName lastName email role");

    return res.status(201).json(populated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listCandidates(req, res) {
  try {
    const query = {};
    if (req.query.status) query.status = String(req.query.status).toUpperCase();
    if (req.query.positionTitle) query.positionTitle = { $regex: String(req.query.positionTitle), $options: "i" };

    const candidates = await RecruitmentCandidate.find(query)
      .populate("hiredEmployee", "name firstName lastName employeeCode email status department position")
      .populate("createdBy", "firstName lastName email role")
      .sort({ createdAt: -1 });

    return res.json(candidates);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getCandidateById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid candidate id" });
    }

    const candidate = await RecruitmentCandidate.findById(id)
      .populate("hiredEmployee", "name firstName lastName employeeCode email status department position")
      .populate("createdBy", "firstName lastName email role");

    if (!candidate) return res.status(404).json({ message: "Candidate not found" });
    return res.json(candidate);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateCandidate(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid candidate id" });
    }

    const payload = normalizeCandidatePayload(req.body || {});
    if (payload.hiredEmployee) {
      if (!mongoose.Types.ObjectId.isValid(payload.hiredEmployee)) {
        return res.status(400).json({ message: "Invalid employee id" });
      }
      const employee = await Employee.findById(payload.hiredEmployee);
      if (!employee) return res.status(404).json({ message: "Employee not found" });
    }

    const candidate = await RecruitmentCandidate.findByIdAndUpdate(id, payload, { new: true, runValidators: true })
      .populate("hiredEmployee", "name firstName lastName employeeCode email status department position")
      .populate("createdBy", "firstName lastName email role");

    if (!candidate) return res.status(404).json({ message: "Candidate not found" });

    await logHistory({
      action: "RECRUITMENT_CANDIDATE_UPDATED",
      description: `Candidate ${candidate.fullName} updated`,
      user: req.user.id,
      entityType: "RecruitmentCandidate",
      entityId: candidate._id,
    });

    return res.json(candidate);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function deleteCandidate(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid candidate id" });
    }

    const candidate = await RecruitmentCandidate.findByIdAndDelete(id);
    if (!candidate) return res.status(404).json({ message: "Candidate not found" });

    await logHistory({
      action: "RECRUITMENT_CANDIDATE_DELETED",
      description: `Candidate ${candidate.fullName} deleted`,
      user: req.user.id,
      entityType: "RecruitmentCandidate",
      entityId: candidate._id,
    });

    return res.json({ message: "Candidate deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createCandidate,
  listCandidates,
  getCandidateById,
  updateCandidate,
  deleteCandidate,
};
