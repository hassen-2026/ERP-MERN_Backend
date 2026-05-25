const Category = require("../models/Category");
const mongoose = require("mongoose");
const logHistory = require("../utils/historyLogger");

async function createCategory(req, res) {
  try {
    const { name, description, tvaRate, isActive } = req.body;

    if (!name) {
      return res.status(400).json({ message: "name is required" });
    }

    const exists = await Category.findOne({ name: name.toUpperCase() });
    if (exists) return res.status(409).json({ message: "Category already exists" });

    const imageUrl = req.file?.path || "";

    const category = await Category.create({
      name: name.toUpperCase(),
      description: description || "",
      tvaRate: Number(tvaRate) || 0.19,
      isActive: isActive !== false,
      imageUrl,
    });

    await logHistory({
      action: "CATEGORY_CREATED",
      description: `Category ${category.name} created`,
      user: req.user?.id,
      entityType: "Category",
      entityId: category._id,
    });

    return res.status(201).json(category);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getCategories(_req, res) {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
    return res.json(categories);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getCategoryById(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid category id" });
    }
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });
    return res.json(category);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateCategory(req, res) {
  try {
    const { name, description, tvaRate, isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    if (name !== undefined) category.name = name.toUpperCase();
    if (description !== undefined) category.description = description;
    if (tvaRate !== undefined) category.tvaRate = Number(tvaRate);
    if (isActive !== undefined) category.isActive = isActive;
    if (req.file?.path) category.imageUrl = req.file.path;

    await category.save();

    await logHistory({
      action: "CATEGORY_UPDATED",
      description: `Category ${category.name} updated`,
      user: req.user?.id,
      entityType: "Category",
      entityId: category._id,
    });

    return res.json(category);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function deleteCategory(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid category id" });
    }
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    await logHistory({
      action: "CATEGORY_DELETED",
      description: `Category ${category.name} deleted`,
      user: req.user?.id,
      entityType: "Category",
      entityId: category._id,
    });

    return res.json({ message: "Category deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
