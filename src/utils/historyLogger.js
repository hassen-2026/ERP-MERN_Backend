const Historique = require("../models/Historique");

async function logHistory({ action, description, metaData, user, entityType, entityId }) {
  try {
    await Historique.create({
      action,
      description: description || "",
      metaData: metaData || {},
      user: user || undefined,
      entityType: entityType || "",
      entityId: entityId ? String(entityId) : "",
    });
  } catch (error) {
    console.error("History logging failed:", error.message);
  }
}

module.exports = logHistory;
