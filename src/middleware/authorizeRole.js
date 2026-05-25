function normalizeRole(role) {
  return String(role || "").trim().toUpperCase();
}

function authorizeRole(...allowedRoles) {
  const normalizedAllowedRoles = allowedRoles.map(normalizeRole);

  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const currentRole = normalizeRole(req.user.role);
    if (!normalizedAllowedRoles.includes(currentRole)) {
      return res.status(403).json({ message: "Forbidden: insufficient role" });
    }

    return next();
  };
}

module.exports = authorizeRole;
