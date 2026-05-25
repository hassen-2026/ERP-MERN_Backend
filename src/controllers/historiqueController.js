const Historique = require("../models/Historique");

async function listHistorique(req, res) {
  try {
    const { userId, entityType, action } = req.query;
    const filter = {};
    if (userId) filter.user = userId;
    if (entityType) filter.entityType = entityType;
    if (action) filter.action = action;

    const history = await Historique.find(filter)
      .populate("user", "firstName lastName email role")
      .sort({ createdAt: -1 })
      .limit(300);
    return res.json(history);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = { listHistorique };
