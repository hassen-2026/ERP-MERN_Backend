const mongoose = require("mongoose");
const User = require("../models/User");
const Notification = require("../models/Notification");

async function createNotificationsForUsers(userIds, payload, session = null) {
  const normalizedIds = [...new Set((userIds || []).map((id) => String(id)).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
  if (normalizedIds.length === 0) return [];

  const docs = normalizedIds.map((recipient) => ({
    recipient,
    type: payload.type || "GENERAL",
    title: payload.title,
    message: payload.message,
    entityType: payload.entityType || "",
    entityId: payload.entityId || null,
    metadata: payload.metadata || null,
    createdBy: payload.createdBy || null,
  }));

  const options = session ? { session } : undefined;
  return Notification.insertMany(docs, options);
}

async function createNotificationsForRole(role, payload, session = null) {
  const query = User.find({ role, isActive: true }).select("_id");
  if (session) {
    query.session(session);
  }

  const users = await query;
  return createNotificationsForUsers(users.map((user) => user._id), payload, session);
}

async function notifyLowStockIfNeeded({ product, previousQuantity, createdBy, session = null }) {
  const currentQuantity = Number(product?.quantity || 0);
  const threshold = Number(product?.minThreshold || 0);
  const previousValue = Number(previousQuantity);

  if (!Number.isFinite(currentQuantity) || !Number.isFinite(threshold)) return [];
  if (currentQuantity > threshold) return [];
  if (Number.isFinite(previousValue) && previousValue <= threshold) return [];

  return createNotificationsForRole(
    "PROCUREMENT_MANAGER",
    {
      type: "LOW_STOCK",
      title: "Stock sous seuil",
      message: `Le produit ${product?.reference || product?.name || ""} est passé sous le seuil de stock (${currentQuantity} / ${threshold}).`,
      entityType: "Product",
      entityId: product?._id,
      metadata: {
        productId: product?._id,
        reference: product?.reference || "",
        quantity: currentQuantity,
        minThreshold: threshold,
      },
      createdBy,
    },
    session,
  );
}

module.exports = {
  createNotificationsForUsers,
  createNotificationsForRole,
  notifyLowStockIfNeeded,
};
