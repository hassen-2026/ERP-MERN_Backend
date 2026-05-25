const express = require("express");
const uploadDepartmentImage = require("../middleware/departmentImageUpload");
const {
  createDepartment,
  listDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
} = require("../controllers/departmentController");

const router = express.Router();

router.get("/", listDepartments);
router.get("/:id", getDepartmentById);
router.post("/", uploadDepartmentImage.single("image"), createDepartment);
router.put("/:id", uploadDepartmentImage.single("image"), updateDepartment);
router.delete("/:id", deleteDepartment);

module.exports = router;
