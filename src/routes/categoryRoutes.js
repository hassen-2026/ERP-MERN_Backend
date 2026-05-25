const express = require("express");
const auth = require("../middleware/auth");
const uploadCategoryImage = require("../middleware/categoryImageUpload");
const {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} = require("../controllers/categoryController");

const router = express.Router();

router.use(auth);
router.get("/", getCategories);
router.get("/:id", getCategoryById);
router.post("/", uploadCategoryImage.single("image"), createCategory);
router.put("/:id", uploadCategoryImage.single("image"), updateCategory);
router.delete("/:id", deleteCategory);

module.exports = router;
