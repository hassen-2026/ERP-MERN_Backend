const express = require("express");
const auth = require("../middleware/auth");
const { authorize } = require("../middleware/roleAuthorization");
const { ROLES } = require("../constants/userRoles");
const {
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
} = require("../controllers/budgetController");

const router = express.Router();

// ============ SPECIFIC ROUTES (MUST BE BEFORE :id ROUTES) ============

// GET - Budgets du mois courant
router.get("/current-month", auth, authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER, ROLES.PROCUREMENT_MANAGER]), getCurrentMonthBudgets);

// GET - Budgets accessibles à l'utilisateur selon son rôle
router.get("/my", auth, authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER, ROLES.PROCUREMENT_MANAGER, ROLES.MANAGER]), getMyBudgets);

// GET - Analytics budgétaires (must be before /:id)
router.get("/analytics/summary", auth, authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER, ROLES.PROCUREMENT_MANAGER]), getBudgetAnalytics);

// ============ STANDARD CRUD ROUTES ============

// GET - Tous les budgets
router.get("/", auth, authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER, ROLES.PROCUREMENT_MANAGER]), listBudgets);

// POST - Créer un budget (Admin/Finance only)
router.post("/", authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER]), createBudget);

// GET - Budget par ID
router.get("/:id", auth, authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER, ROLES.PROCUREMENT_MANAGER]), getBudgetById);

// PUT - Modifier un budget (Admin/Finance only)
router.put("/:id", authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER]), updateBudget);

// ============ SPECIAL ROUTES ============

// POST - Approuver un budget (Admin/Finance only)
router.post("/:id/approve", authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER]), approveBudget);

// DELETE - Supprimer un budget (Admin/Finance only)
router.delete("/:id", authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER]), deleteBudget);

// POST - Mise à jour du spent (appelée par le système lors d'un achat)
router.post("/:id/update-spent", auth, authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER, ROLES.PROCUREMENT_MANAGER]), updateBudgetSpent);

module.exports = router;
