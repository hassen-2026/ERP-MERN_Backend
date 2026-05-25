const { ROLES } = require("../constants/userRoles");

/**
 * Middleware pour vérifier si l'utilisateur a l'un des rôles requis
 * @param {string|array} requiredRoles - Rôles autorisés (string ou array)
 */
function authorize(requiredRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Non autorisé. Veuillez vous connecter." });
    }

    const userRole = req.user.role;
    const rolesArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

    // Vérifier si le rôle de l'utilisateur fait partie des rôles autorisés
    if (!rolesArray.includes(userRole)) {
      return res.status(403).json({ message: "Accès refusé. Rôle insuffisant." });
    }

    next();
  };
}

/**
 * Middleware pour vérifier si l'utilisateur est ADMIN ou SUPER_ADMIN
 */
function isAdmin(req, res, next) {
  return authorize([ROLES.ADMIN, ROLES.SUPER_ADMIN])(req, res, next);
}

/**
 * Middleware pour vérifier si l'utilisateur est SUPER_ADMIN
 */
function isSuperAdmin(req, res, next) {
  return authorize(ROLES.SUPER_ADMIN)(req, res, next);
}

module.exports = {
  authorize,
  isAdmin,
  isSuperAdmin,
};
