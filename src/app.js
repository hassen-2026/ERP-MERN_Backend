const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const stockRoutes = require("./routes/stockRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const supplierInvoiceRoutes = require("./routes/supplierInvoiceRoutes");
const ocrRoutes = require("./routes/ocrRoutes");
const userRouter = require("./routes/users.route");
const clientRoutes = require("./routes/clientRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const departmentRoutes = require("./routes/departmentRoutes");
const positionRoutes = require("./routes/positionRoutes");
const contractRoutes = require("./routes/contractRoutes");
const leaveRoutes = require("./routes/leaveRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const documentRoutes = require("./routes/documentRoutes");
const evaluationRoutes = require("./routes/evaluationRoutes");
const trainingRoutes = require("./routes/trainingRoutes");
const payrollRoutes = require("./routes/payrollRoutes");
const recruitmentRoutes = require("./routes/recruitmentRoutes");
const hrInsightsRoutes = require("./routes/hrInsightsRoutes");
const devisRoutes = require("./routes/devisRoutes");
const commandeRoutes = require("./routes/commandeRoutes");
const commandeItemRoutes = require("./routes/commandeItemRoutes");
const achatRoutes = require("./routes/achatRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const factureRoutes = require("./routes/factureRoutes");
const paiementRoutes = require("./routes/paiementRoutes");
const transporterRoutes = require("./routes/transporterRoutes");
const livraisonRoutes = require("./routes/livraisonRoutes");
const bonCommandeRoutes = require("./routes/bonCommandeRoutes");
const historiqueRoutes = require("./routes/historiqueRoutes");
const snapshotRoutes = require("./routes/snapshotRoutes");
const budgetRoutes = require("./routes/budgetRoutes");
const targetRoutes = require("./routes/targetRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const currencyRateRoutes = require("./routes/currencyRateRoutes");
const { createTarget } = require("./controllers/targetController");
const auth = require("./middleware/auth");
const { authorize } = require("./middleware/roleAuthorization");
const { ROLES } = require("./constants/userRoles");
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, message: "Server is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", auth, authorize([ROLES.ADMIN, ROLES.PROCUREMENT_MANAGER]), categoryRoutes);
app.use("/api/products", auth, authorize([ROLES.ADMIN, ROLES.PROCUREMENT_MANAGER, ROLES.LOGISTICS_MANAGER]), productRoutes);
app.use("/api/stock-movements", auth, authorize([ROLES.ADMIN, ROLES.PROCUREMENT_MANAGER, ROLES.LOGISTICS_MANAGER]), stockRoutes);
app.use("/api/suppliers", auth, authorize([ROLES.ADMIN, ROLES.PROCUREMENT_MANAGER]), supplierRoutes);
app.use("/api/supplier-invoices", auth, authorize([ROLES.ADMIN, ROLES.PROCUREMENT_MANAGER, ROLES.FINANCE_MANAGER]), supplierInvoiceRoutes);
app.use("/api/ocr", auth, ocrRoutes);
app.use("/api/users", auth, authorize([ROLES.ADMIN]), userRouter);
app.use("/user", auth, userRouter);
app.use("/api/clients", auth, authorize([ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER]), clientRoutes);
app.use("/api/employees", auth, authorize([ROLES.ADMIN, ROLES.HR_MANAGER]), employeeRoutes);
app.use("/api/hr/departments", auth, authorize([ROLES.ADMIN, ROLES.HR_MANAGER]), departmentRoutes);
app.use("/api/hr/positions", auth, authorize([ROLES.ADMIN, ROLES.HR_MANAGER]), positionRoutes);
app.use("/api/hr/contracts", auth, authorize([ROLES.ADMIN, ROLES.HR_MANAGER]), contractRoutes);
app.use("/api/hr/leaves", auth, authorize([ROLES.ADMIN, ROLES.HR_MANAGER]), leaveRoutes);
app.use("/api/hr/attendances", auth, authorize([ROLES.ADMIN, ROLES.HR_MANAGER]), attendanceRoutes);
app.use("/api/hr/documents", auth, authorize([ROLES.ADMIN, ROLES.HR_MANAGER]), documentRoutes);
app.use("/api/hr/evaluations", auth, authorize([ROLES.ADMIN, ROLES.HR_MANAGER]), evaluationRoutes);
app.use("/api/hr/trainings", auth, authorize([ROLES.ADMIN, ROLES.HR_MANAGER]), trainingRoutes);
app.use("/api/hr/payrolls", auth, authorize([ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.FINANCE_MANAGER]), payrollRoutes);
app.use("/api/hr/recruitment-candidates", auth, authorize([ROLES.ADMIN, ROLES.HR_MANAGER]), recruitmentRoutes);
app.use("/api/hr", auth, authorize([ROLES.ADMIN, ROLES.MANAGER, ROLES.HR_MANAGER]), hrInsightsRoutes);
app.use("/api/devis", auth, authorize([ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER]), devisRoutes);
app.use("/api/commandes", auth, authorize([ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER, ROLES.LOGISTICS_MANAGER]), commandeRoutes);
app.use("/api/commande-items", auth, authorize([ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER, ROLES.LOGISTICS_MANAGER]), commandeItemRoutes);
app.use("/api/achats", auth, authorize([ROLES.ADMIN, ROLES.PROCUREMENT_MANAGER, ROLES.FINANCE_MANAGER, ROLES.LOGISTICS_MANAGER, ROLES.USER]), achatRoutes);
app.use("/api/analytics", auth, authorize([ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER, ROLES.PROCUREMENT_MANAGER]), analyticsRoutes);
app.use("/api/factures", auth, authorize([ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER, ROLES.FINANCE_MANAGER]), factureRoutes);
app.use("/api/paiements", auth, authorize([ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.FINANCE_MANAGER]), paiementRoutes);
app.use("/api/transporters", auth, authorize([ROLES.ADMIN, ROLES.LOGISTICS_MANAGER]), transporterRoutes);
app.use("/api/livraisons", auth, authorize([ROLES.ADMIN, ROLES.LOGISTICS_MANAGER]), livraisonRoutes);
app.use("/api/bon-commandes", auth, authorize([ROLES.ADMIN, ROLES.PROCUREMENT_MANAGER, ROLES.SALES_MANAGER]), bonCommandeRoutes);
app.use("/api/historique", auth, authorize([ROLES.ADMIN, ROLES.MANAGER]), historiqueRoutes);
app.use("/api/snapshots", auth, authorize([ROLES.ADMIN, ROLES.MANAGER]), snapshotRoutes);
app.use("/api/budgets", auth, budgetRoutes);
app.use("/api/notifications", auth, notificationRoutes);
app.use(
  "/api/currency-rates",
  auth,
  authorize([ROLES.ADMIN, ROLES.PROCUREMENT_MANAGER, ROLES.SALES_MANAGER, ROLES.FINANCE_MANAGER]),
  currencyRateRoutes
);
app.post("/api/targets", auth, authorize([ROLES.ADMIN, ROLES.FINANCE_MANAGER]), createTarget);
app.use("/api/targets", auth, targetRoutes);

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

module.exports = app;
