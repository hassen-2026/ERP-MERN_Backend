const express = require("express");
const uploadEmployeeImage = require("../middleware/employeeImageUpload");
const {
  createEmployee,
  listEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
} = require("../controllers/employeeController");

const router = express.Router();

router.get("/", listEmployees);
router.get("/:id", getEmployeeById);
router.post("/", uploadEmployeeImage.single("image"), createEmployee);
router.put("/:id", uploadEmployeeImage.single("image"), updateEmployee);
router.delete("/:id", deleteEmployee);

module.exports = router;
