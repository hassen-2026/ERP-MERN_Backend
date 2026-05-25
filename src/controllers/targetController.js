const Target = require("../models/Target");

const resolveUserId = (user) => user?._id || user?.id || null;

async function listTargets(req, res) {
  try {
    const { month, year, status, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};
    if (month) filter.month = parseInt(month, 10);
    if (year) filter.year = parseInt(year, 10);
    if (status) filter.status = status;

    const targets = await Target.find(filter)
      .populate("department", "name code")
      .populate("createdBy", "email firstName lastName")
      .populate("achievedBy", "email firstName lastName")
      .sort({ year: -1, month: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10));

    const total = await Target.countDocuments(filter);

    return res.json({
      data: targets,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getCurrentMonthTargets(req, res) {
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const targets = await Target.find({ month, year, status: { $in: ["ACTIVE", "ACHIEVED"] } })
      .populate("department", "name code")
      .populate("createdBy", "email firstName lastName")
      .sort({ createdAt: -1 });

    return res.json(targets);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getTargetById(req, res) {
  try {
    const target = await Target.findById(req.params.id)
      .populate("department", "name code")
      .populate("createdBy", "email firstName lastName")
      .populate("achievedBy", "email firstName lastName");

    if (!target) {
      return res.status(404).json({ message: "Target not found" });
    }

    return res.json(target);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function createTarget(req, res) {
  try {
    const { name, description, department, month, year, targetValue, notes, createdBy: bodyCreatedBy } = req.body;
    const createdBy = resolveUserId(req.user) || bodyCreatedBy || null;

    if (!createdBy) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const existing = await Target.findOne({ department: department || null, month, year, name: String(name || "").trim() });
    if (existing) {
      return res.status(400).json({ message: "A target already exists for this period" });
    }

    const target = new Target({
      name,
      description,
      department: department || null,
      month,
      year,
      targetValue,
      notes,
      createdBy,
      status: "DRAFT",
    });

    await target.save();

    const populatedTarget = await Target.findById(target._id)
      .populate("department", "name code")
      .populate("createdBy", "email firstName lastName");

    return res.status(201).json(populatedTarget);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateTarget(req, res) {
  try {
    const target = await Target.findById(req.params.id);

    if (!target) {
      return res.status(404).json({ message: "Target not found" });
    }

    const { name, description, targetValue, notes, warningThreshold } = req.body;
    target.name = name || target.name;
    target.description = description || target.description;
    target.targetValue = targetValue ?? target.targetValue;
    target.notes = notes ?? target.notes;
    if (warningThreshold !== undefined) target.warningThreshold = warningThreshold;
    target.lastModifiedBy = resolveUserId(req.user);

    await target.save();

    const updatedTarget = await Target.findById(target._id)
      .populate("department", "name code")
      .populate("createdBy", "email firstName lastName");

    return res.json(updatedTarget);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function deleteTarget(req, res) {
  try {
    const target = await Target.findById(req.params.id);

    if (!target) {
      return res.status(404).json({ message: "Target not found" });
    }

    await Target.findByIdAndDelete(req.params.id);
    return res.json({ message: "Target deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateTargetProgress(req, res) {
  try {
    const { targetId, amount, operation = "add" } = req.body;
    const target = await Target.findById(targetId);

    if (!target) {
      return res.status(404).json({ message: "Target not found" });
    }

    if (operation === "add") {
      target.actualValue += Number(amount || 0);
    } else if (operation === "subtract") {
      target.actualValue = Math.max(0, target.actualValue - Number(amount || 0));
    }

    await target.save();
    return res.json(target);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getTargetAnalytics(req, res) {
  try {
    const { year } = req.query;
    const currentYear = year ? parseInt(year, 10) : new Date().getFullYear();

    const analytics = await Target.aggregate([
      {
        $match: { year: currentYear },
      },
      {
        $group: {
          _id: "$month",
          targetValue: { $sum: "$targetValue" },
          actualValue: { $sum: "$actualValue" },
          count: { $sum: 1 },
          achieved: {
            $sum: { $cond: [{ $gte: ["$actualValue", "$targetValue"] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const monthNames = ["Janv", "Fevr", "Mars", "Avr", "Mai", "Juin", "Juil", "Aout", "Sept", "Oct", "Nov", "Dec"];

    const chartData = analytics.map((item) => ({
      month: monthNames[item._id - 1] || String(item._id),
      targetValue: item.targetValue,
      actualValue: item.actualValue,
      completionRate: item.targetValue > 0 ? Math.round((item.actualValue / item.targetValue) * 100) : 0,
      count: item.count,
      achieved: item.achieved,
    }));

    return res.json(chartData);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  listTargets,
  getCurrentMonthTargets,
  getTargetById,
  createTarget,
  updateTarget,
  deleteTarget,
  updateTargetProgress,
  getTargetAnalytics,
};