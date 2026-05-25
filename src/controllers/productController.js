const Product = require("../models/Product");
const Category = require("../models/Category");
const mongoose = require("mongoose");
const logHistory = require("../utils/historyLogger");
const { notifyLowStockIfNeeded } = require("../utils/notificationService");

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const UNKNOWN_CATEGORY_NAME = "UNKNOWN";

async function resolveUnknownCategory() {
  let unknownCategory = await Category.findOne({ name: UNKNOWN_CATEGORY_NAME });
  if (unknownCategory) return unknownCategory;

  try {
    unknownCategory = await Category.create({
      name: UNKNOWN_CATEGORY_NAME,
      description: "Default category used for OCR or uncategorized products",
      tvaRate: 0.19,
      isActive: true,
    });
    return unknownCategory;
  } catch (error) {
    // If another request created the category concurrently, re-read it.
    if (error?.code === 11000) {
      unknownCategory = await Category.findOne({ name: UNKNOWN_CATEGORY_NAME });
      if (unknownCategory) return unknownCategory;
    }
    throw error;
  }
}

const normalizeProductInput = (body = {}) => {
  const purchasePriceHT = toNumber(
    body.purchasePriceHT ?? body.buyPrice ?? body.prixHorsTva ?? body.purchasePrice ?? body.costPrice,
    0,
  );

  const salePriceCandidate = body.salePriceHT ?? body.sellPrice ?? body.unitPrice ?? body.salePrice;
  const salePriceTTC = body.prixTTC ?? body.salePriceTTC ?? body.sellPriceTTC;
  const salePriceHT = salePriceCandidate !== undefined
    ? toNumber(salePriceCandidate, 0)
    : salePriceTTC !== undefined
      ? toNumber(salePriceTTC, 0) / 1.19
      : purchasePriceHT;

  return {
    name: body.name,
    reference: body.reference,
    categoryId: body.categoryId,
    categorie: (body.category ?? body.categorie ?? "N/A").toString().trim(),
    description: body.description ?? " ",
    imageUrl: body.imageUrl ?? " ",
    quantity: toNumber(body.quantity ?? body.stockQuantity, 0),
    minThreshold: toNumber(body.minThreshold ?? body.lowStockThreshold, 0),
    purchasePriceHT,
    salePriceHT,
    imagePublicId: body.imagePublicId ?? " ",
  };
};

async function createProduct(req, res) {
  try {
    const input = normalizeProductInput(req.body);
    const finalImageUrl = req.file?.path || input.imageUrl;
    const finalImagePublicId = req.file?.filename || input.imagePublicId || " ";

    if (!isNonEmptyString(input.name) || !isNonEmptyString(input.reference)) {
      return res.status(400).json({ message: "name and reference are required" });
    }

    let category = null;
    let resolvedCategoryId = input.categoryId;

    if (isValidObjectId(input.categoryId)) {
      category = await Category.findById(input.categoryId);
    }

    if (!category) {
      category = await resolveUnknownCategory();
      resolvedCategoryId = category._id;
    }

    const exists = await Product.findOne({ reference: input.reference.toUpperCase() });
    if (exists) return res.status(409).json({ message: "reference already exists" });

    const product = await Product.create({
      name: input.name,
      reference: input.reference.toUpperCase(),
      categoryId: resolvedCategoryId,
      categorie: input.categorie.toUpperCase(),
      purchasePriceHT: input.purchasePriceHT,
      salePriceHT: input.salePriceHT,
      quantity: input.quantity,
      minThreshold: input.minThreshold,
      description: input.description,
      imageUrl: finalImageUrl,
      imagePublicId: finalImagePublicId,
    });

    await logHistory({
      action: "PRODUCT_CREATED",
      description: `Product ${product.reference} created`,
      user: req.user.id,
      entityType: "Product",
      entityId: product._id,
    });

    return res.status(201).json(product);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getProducts(_req, res) {
  try {
    const products = await Product.find().populate("categoryId").sort({ createdAt: -1 });
    return res.json(products);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getProductById(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid product id" });
    }
    const product = await Product.findById(req.params.id).populate("categoryId");
    if (!product) return res.status(404).json({ message: "Product not found" });
    return res.json(product);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateProduct(req, res) {
  try {
    const input = normalizeProductInput(req.body);

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid product id" });
    }
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const previousQuantity = Number(product.quantity || 0);

    if (input.categoryId !== undefined) {
      if (!isValidObjectId(input.categoryId)) {
        return res.status(400).json({ message: "categoryId is required" });
      }

      const category = await Category.findById(input.categoryId);
      if (!category) {
        return res.status(400).json({ message: "category not found" });
      }
    }

    if (input.name !== undefined) product.name = input.name;
    if (input.minThreshold !== undefined) product.minThreshold = input.minThreshold;
    if (input.purchasePriceHT !== undefined) product.purchasePriceHT = input.purchasePriceHT;
    if (input.salePriceHT !== undefined) product.salePriceHT = input.salePriceHT;
    if (input.quantity !== undefined) product.quantity = input.quantity;
    if (input.categoryId !== undefined) product.categoryId = input.categoryId;
    if (input.categorie !== undefined) product.categorie = input.categorie.toUpperCase();
    if (input.description !== undefined) product.description = input.description;
    if (input.imageUrl !== undefined) product.imageUrl = input.imageUrl;
    if (req.file?.path) product.imageUrl = req.file.path;
    if (req.file?.filename) product.imagePublicId = req.file.filename;

    await product.save();
    await logHistory({
      action: "PRODUCT_UPDATED",
      description: `Product ${product.reference} updated`,
      user: req.user.id,
      entityType: "Product",
      entityId: product._id,
    });
    await notifyLowStockIfNeeded({
      product,
      previousQuantity,
      createdBy: req.user.id,
    });
    return res.json(product);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function deleteProduct(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid product id" });
    }
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    await logHistory({
      action: "PRODUCT_DELETED",
      description: `Product ${product.reference} deleted`,
      user: req.user.id,
      entityType: "Product",
      entityId: product._id,
    });
    return res.json({ message: "Product deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function lowStock(_req, res) {
  try {
    const products = await Product.find({
      $expr: { $lte: ["$quantity", "$minThreshold"] },
    }).sort({ quantity: 1 });

    return res.json(products);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  lowStock,
};
