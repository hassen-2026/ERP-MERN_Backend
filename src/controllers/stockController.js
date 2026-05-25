const mongoose = require("mongoose");
const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");
const logHistory = require("../utils/historyLogger");
const { notifyLowStockIfNeeded } = require("../utils/notificationService");

async function createMovement(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { productId, type, quantity, note = "" } = req.body;

    if (!productId || !type || !quantity) {
      return res.status(400).json({ message: "productId, type and quantity are required" });
    }

    if (!["in", "out"].includes(type)) {
      return res.status(400).json({ message: "type must be 'in' or 'out'" });
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ message: "quantity must be a positive number" });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid productId" });
    }

    const product = await Product.findById(productId).session(session);
    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Product not found" });
    }

    const previousQuantity = Number(product.quantity || 0);

    if (type === "out" && product.quantity < qty) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Insufficient stock" });
    }

    if (type === "in") product.quantity += qty;
    else product.quantity -= qty;

    await product.save({ session });

    const movement = new StockMovement({
      product: product._id,
      type,
      quantity: qty,
      note,
      createdBy: req.user.id
    });
    await movement.save({ session });

    const populated = await movement.populate([
      { path: "product", select: "name reference" },
      { path: "createdBy", select: "firstName lastName email role" }
    ]);

    await session.commitTransaction();
    await logHistory({
      action: "STOCK_MOVEMENT_CREATED",
      description: `Stock movement ${type} on ${product.reference} (${qty})`,
      user: req.user.id,
      entityType: "StockMovement",
      entityId: populated._id,
      metaData: { type, quantity: qty, productId: product._id.toString() },
    });
    await notifyLowStockIfNeeded({
      product,
      previousQuantity,
      createdBy: req.user.id,
    });

    return res.status(201).json({
      movement: populated,
      product: {
        id: product._id,
        name: product.name,
        reference: product.reference,
        quantity: product.quantity,
        minThreshold: product.minThreshold,
        lowStock: product.quantity <= product.minThreshold
      }
    });
  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
}

async function listMovements(req, res) {
  try {
    const { productId } = req.query;
    const filter = productId ? { product: productId } : {};

    const movements = await StockMovement.find(filter)
      .populate("product", "name reference")
      .populate("createdBy", "firstName lastName email role")
      .sort({ createdAt: -1 });

    return res.json(movements);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = { createMovement, listMovements };
