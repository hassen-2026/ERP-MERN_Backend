// Constants for User Roles
module.exports = {
  ROLES: {
    SUPER_ADMIN: "SUPER_ADMIN",
    ADMIN: "ADMIN",
    MANAGER: "MANAGER",
    SALES_MANAGER: "SALES_MANAGER",
    PROCUREMENT_MANAGER: "PROCUREMENT_MANAGER",
    HR_MANAGER: "HR_MANAGER",
    FINANCE_MANAGER: "FINANCE_MANAGER",
    LOGISTICS_MANAGER: "LOGISTICS_MANAGER",
    USER: "USER",
  },

  // Role descriptions
  ROLE_DESCRIPTIONS: {
    SUPER_ADMIN: "Administrateur Système - Accès complet",
    ADMIN: "Administrateur Général",
    MANAGER: "Manager/Chef de Département",
    SALES_MANAGER: "Chef des Ventes",
    PROCUREMENT_MANAGER: "Responsable Achats",
    HR_MANAGER: "Responsable Ressources Humaines",
    FINANCE_MANAGER: "Responsable Finance",
    LOGISTICS_MANAGER: "Responsable Logistique",
    USER: "Utilisateur Standard",
  },

  // Available roles for signup (excluding admin roles)
  SIGNUP_ROLES: [
    "USER",
    "SALES_MANAGER",
    "PROCUREMENT_MANAGER",
    "HR_MANAGER",
    "FINANCE_MANAGER",
    "LOGISTICS_MANAGER",
    "MANAGER",
  ],
};
