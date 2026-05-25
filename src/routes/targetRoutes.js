const express = require("express");
const auth = require("../middleware/auth");
const { authorize } = require("../middleware/roleAuthorization");
const { ROLES } = require("../constants/userRoles");
const {
  listTargets,
  getCurrentMonthTargets,
  getTargetById,
  createTarget,
  updateTarget,
  deleteTarget,
  updateTargetProgress,
  getTargetAnalytics,
} = require("../controllers/targetController");

const router = express.Router();

router.get("/current-month", auth, authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER, ROLES.SALES_MANAGER]), getCurrentMonthTargets);
router.get("/analytics/summary", auth, authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER, ROLES.SALES_MANAGER]), getTargetAnalytics);
router.get("/", auth, authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER, ROLES.SALES_MANAGER]), listTargets);
router.post("/", auth, authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER]), createTarget);
router.get("/:id", auth, authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER, ROLES.SALES_MANAGER]), getTargetById);
router.put("/:id", auth, authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER]), updateTarget);
router.delete("/:id", auth, authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER]), deleteTarget);
router.post("/:id/update-progress", auth, authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER]), updateTargetProgress);

module.exports = router;