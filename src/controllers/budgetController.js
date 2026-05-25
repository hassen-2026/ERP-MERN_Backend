const Budget = require("../models/Budget");
const { ROLES } = require("../constants/userRoles");

const resolveUserId = (user) => user?._id || user?.id || null;

// ============ LIST BUDGETS ============

async function listBudgets(req, res) {
  try {
    const { month, year, status, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);
    if (status) filter.status = status;

    const budgets = await Budget.find(filter)
      .populate("department", "name code")
      .populate("createdBy", "email firstName lastName")
      .populate("approvedBy", "email firstName lastName")
      .sort({ year: -1, month: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Budget.countDocuments(filter);

    return res.json({
      data: budgets,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("listBudgets error:", error && error.stack ? error.stack : error);
    return res.status(500).json({ message: error.message });
  }
}

// ============ GET CURRENT MONTH BUDGETS ============

async function getCurrentMonthBudgets(req, res) {
  try {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const year = now.getFullYear();

    const budgets = await Budget.find({ month, year, status: { $in: ["ACTIVE", "APPROVED"] } })
      .populate("department", "name code")
      .sort({ department: 1 });

    return res.json(budgets);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// ============ GET MY BUDGETS ============

async function getMyBudgets(req, res) {
  try {
    const { month, year } = req.query;
    const userRole = req.user.role;

    let filter = {};

    if (userRole === ROLES.FINANCE_MANAGER) {
      filter = {};
    } else if (userRole === ROLES.MANAGER) {
      if (req.user.departmentId) {
        filter.department = req.user.departmentId;
      }
    } else if (userRole === ROLES.ADMIN || userRole === ROLES.PROCUREMENT_MANAGER) {
      filter = {};
    } else {
      return res.status(403).json({ message: "Accès refusé" });
    }

    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);

    const budgets = await Budget.find(filter)
      .populate("department", "name code")
      .populate("createdBy", "email firstName lastName")
      .sort({ year: -1, month: -1 });

    return res.json(budgets);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// ============ GET BUDGET BY ID ============

async function getBudgetById(req, res) {
  try {
    const { id } = req.params;

    const budget = await Budget.findById(id)
      .populate("department", "name code")
      .populate("createdBy", "email firstName lastName")
      .populate("approvedBy", "email firstName lastName");

    if (!budget) {
      return res.status(404).json({ message: "Budget not found" });
    }

    return res.json(budget);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// ============ CREATE BUDGET ============

async function createBudget(req, res) {
  try {
    const { name, description, department, month, year, totalBudget, notes, createdBy: bodyCreatedBy } = req.body;
    const createdBy = resolveUserId(req.user) || bodyCreatedBy || null;

    if (!createdBy) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Vérifier unicité (un seul budget par department/month/year)
    let existing;
    try {
      existing = await Budget.findOne({
        department: department || null,
        month,
        year,
      });
    } catch (e) {
      throw e;
    }

    if (existing) {
      return res.status(400).json({
        message: "A budget already exists for this period",
      });
    }

    const budget = new Budget({
      name,
      description,
      department: department || null,
      month,
      year,
      totalBudget,
      notes,
      createdBy,
      status: "DRAFT",
    });
    
    try {
      await budget.save();
    } catch (e) {
      throw e;
    }

    const populatedBudget = await Budget.findById(budget._id)
      .populate("department", "name code")
      .populate("createdBy", "email firstName lastName");

    return res.status(201).json(populatedBudget);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// ============ UPDATE BUDGET ============

async function updateBudget(req, res) {
  try {
    const { id } = req.params;
    const { name, description, totalBudget, notes, warningThreshold } = req.body;
    const modifiedBy = resolveUserId(req.user);

    const budget = await Budget.findById(id);

    if (!budget) {
      return res.status(404).json({ message: "Budget not found" });
    }

    // Empêcher modification si APPROVED ou CLOSED
    if (["APPROVED", "CLOSED"].includes(budget.status)) {
      return res.status(400).json({
        message: "Cannot modify an approved or closed budget",
      });
    }

    budget.name = name || budget.name;
    budget.description = description || budget.description;
    budget.totalBudget = totalBudget || budget.totalBudget;
    budget.notes = notes || budget.notes;
    if (warningThreshold) budget.warningThreshold = warningThreshold;
    budget.lastModifiedBy = modifiedBy;

    await budget.save();

    const updatedBudget = await Budget.findById(id)
      .populate("department", "name code")
      .populate("createdBy", "email firstName lastName");

    return res.json(updatedBudget);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// ============ APPROVE BUDGET ============

async function approveBudget(req, res) {
  try {
    const { id } = req.params;
    const approvedBy = resolveUserId(req.user);

    const budget = await Budget.findById(id);

    if (!budget) {
      return res.status(404).json({ message: "Budget not found" });
    }

    if (budget.status !== "DRAFT") {
      return res.status(400).json({
        message: "Only draft budgets can be approved",
      });
    }

    budget.status = "APPROVED";
    budget.approvedBy = approvedBy;
    budget.approvedAt = new Date();

    await budget.save();

    const approvedBudget = await Budget.findById(id)
      .populate("department", "name code")
      .populate("approvedBy", "email firstName lastName");

    return res.json(approvedBudget);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// ============ DELETE BUDGET ============

async function deleteBudget(req, res) {
  try {
    const { id } = req.params;

    const budget = await Budget.findById(id);

    if (!budget) {
      return res.status(404).json({ message: "Budget not found" });
    }

    if (budget.status !== "DRAFT") {
      return res.status(400).json({
        message: "Cannot delete an approved budget",
      });
    }

    await Budget.findByIdAndDelete(id);

    return res.json({ message: "Budget deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// ============ UPDATE SPENT AMOUNT ============

async function updateBudgetSpent(req, res) {
  try {
    const { budgetId, amount, operation = "add" } = req.body; // add or subtract

    const budget = await Budget.findById(budgetId);

    if (!budget) {
      return res.status(404).json({ message: "Budget not found" });
    }

    if (operation === "add") {
      budget.spent += amount;
    } else if (operation === "subtract") {
      budget.spent = Math.max(0, budget.spent - amount);
    }

    await budget.save();

    return res.json(budget);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// ============ GET BUDGET ANALYTICS ============

async function getBudgetAnalytics(req, res) {
  try {
    const { year } = req.query;
    const currentYear = year ? parseInt(year) : new Date().getFullYear();

    const analytics = await Budget.aggregate([
      {
        $match: {
          year: currentYear,
          status: { $in: ["ACTIVE", "APPROVED", "EXCEEDED"] },
        },
      },
      {
        $group: {
          _id: "$department",
          totalBudget: { $sum: "$totalBudget" },
          totalSpent: { $sum: "$spent" },
          totalReserved: { $sum: "$reserved" },
          count: { $sum: 1 },
          exceeded: {
            $sum: { $cond: [{ $gt: ["$isExceeded", false] }, 1, 0] },
          },
        },
      },
      {
        $sort: { totalBudget: -1 },
      },
    ]);

    const resolvedAnalytics = await Budget.populate(analytics, { path: "_id", select: "name code" });

    return res.json(resolvedAnalytics);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  listBudgets,
  getCurrentMonthBudgets,
  getMyBudgets,
  getBudgetById,
  createBudget,
  updateBudget,
  approveBudget,
  deleteBudget,
  updateBudgetSpent,
  getBudgetAnalytics,
};
