const User = require("../models/User");
const Employee = require("../models/Employee");
const Commande = require("../models/Commande");
const Achat = require("../models/Achat");
const Department = require("../models/Department");
const Target = require("../models/Target");
const Budget = require("../models/Budget");
const Product = require("../models/Product");
const Payroll = require("../models/Payroll");
const LeaveRequest = require("../models/LeaveRequest");
const Client = require("../models/Client");
const Supplier = require("../models/Supplier");
const StockMovement = require("../models/StockMovement");

const getAdminDashboardData = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeEmployees = await Employee.countDocuments({ status: "active" });
    const totalOrders = await Commande.countDocuments();
    
    // Sum delivered orders totalAmount
    const revenueAggregation = await Commande.aggregate([
      { $match: { status: "DELIVERED" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } }
    ]);
    const revenue = revenueAggregation[0]?.total || 0;

    // Sum received purchases totalAmount
    const expenseAggregation = await Achat.aggregate([
      { $match: { status: "RECEIVED" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } }
    ]);
    const expenses = expenseAggregation[0]?.total || 0;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Sum budgets for current year
    const budgets = await Budget.find({ year: currentYear });
    const globalBudgetAllocated = budgets.reduce((sum, b) => sum + (b.totalBudget || 0), 0) || 0;
    const globalBudgetSpent = budgets.reduce((sum, b) => sum + (b.spent || 0) + (b.reserved || 0), 0) || 0;

    // Sum product stock value
    const products = await Product.find();
    const stockValue = products.reduce((sum, p) => sum + (p.quantity || 0) * (p.purchasePriceHT || 0), 0) || 0;

    // Sum payroll mass
    const payrolls = await Payroll.find({ periodYear: currentYear, periodMonth: currentMonth, status: { $ne: "CANCELLED" } });
    const payrollMass = payrolls.reduce((sum, p) => sum + (p.netSalary || 0), 0) || 0;

    // Active leaves / Presence Rate
    const activeLeaves = await LeaveRequest.countDocuments({
      status: "APPROVED",
      startDate: { $lte: now },
      endDate: { $gte: now },
    });
    const totalEmp = activeEmployees || 0;
    const presenceRate = totalEmp === 0 ? 0 : Math.max(0, Math.min(100, Math.round(((totalEmp - activeLeaves) / totalEmp) * 100)));

    return res.json({
      totalUsers,
      activeEmployees,
      totalOrders,
      revenue,
      expenses,
      globalBudgetAllocated,
      globalBudgetSpent,
      stockValue,
      payrollMass,
      presenceRate,
    });
  } catch (error) {
    console.error("Error in getAdminDashboardData:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

const getAdminChartData = async (req, res) => {
  try {
    const { period = "month" } = req.query;
    const now = new Date();
    
    let matchStage = {};
    let groupFormat = "";
    let sortStage = { "_id": 1 };

    if (period === "day") {
      // Last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      matchStage = { createdAt: { $gte: thirtyDaysAgo } };
      groupFormat = "%Y-%m-%d";
    } else if (period === "year") {
      // All years
      groupFormat = "%Y";
    } else {
      // Default: current year by month
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      matchStage = { createdAt: { $gte: startOfYear } };
      groupFormat = "%Y-%m";
    }

    // Revenue aggregation
    const revenueAggregation = await Commande.aggregate([
      { $match: { status: "DELIVERED", ...matchStage } },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: "$createdAt" } },
          total: { $sum: "$totalAmount" }
        }
      },
      { $sort: sortStage }
    ]);

    // Expense aggregation (Purchases)
    const expenseAggregation = await Achat.aggregate([
      { $match: { status: "RECEIVED", ...matchStage } },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: "$createdAt" } },
          total: { $sum: "$totalAmount" }
        }
      },
      { $sort: sortStage }
    ]);

    // Combine revenue and expense datasets
    const allKeys = new Set([
      ...revenueAggregation.map(r => r._id),
      ...expenseAggregation.map(e => e._id)
    ]);

    const monthNames = ["Janv", "Fevr", "Mars", "Avr", "Mai", "Juin", "Juil", "Aout", "Sept", "Oct", "Nov", "Dec"];

    const revenueData = await Promise.all(Array.from(allKeys).sort().map(async (key) => {
      const rev = revenueAggregation.find(r => r._id === key)?.total || 0;
      const exp = expenseAggregation.find(e => e._id === key)?.total || 0;
      
      let name = key;
      let mIndex = now.getMonth() + 1;

      if (period === "month") {
        const parts = key.split("-");
        mIndex = parseInt(parts[1], 10);
        name = `${monthNames[mIndex - 1]} ${parts[0]}`;
      } else if (period === "day") {
        const parts = key.split("-");
        mIndex = parseInt(parts[1], 10);
        name = `${parts[2]}/${parts[1]}`;
      }

      // Query real salaries if possible
      let salaries = 0;
      if (period === "month") {
        const parts = key.split("-");
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const monthPayrolls = await Payroll.find({ periodYear: y, periodMonth: m, status: { $ne: "CANCELLED" } });
        salaries = monthPayrolls.reduce((sum, p) => sum + (p.netSalary || 0), 0);
      }
      const salariesVal = salaries > 0 ? Math.round(salaries) : 0;

      return {
        name,
        revenue: Math.round(rev),
        expenses: Math.round(exp),
        salaries: salariesVal,
      };
    }));

    // Fallback if empty
    if (revenueData.length === 0) {
      if (period === "month") {
        monthNames.slice(0, 6).forEach((m, idx) => {
          revenueData.push({
            name: `${m} ${now.getFullYear()}`,
            revenue: 0,
            expenses: 0,
            salaries: 0,
          });
        });
      }
    }

    // Department Budget vs Spent Performance
    const departments = await Department.find();
    const departmentData = await Promise.all(departments.map(async (dept) => {
      const currentYear = now.getFullYear();
      const budgets = await Budget.find({ department: dept._id, year: currentYear });
      
      const totalBudget = budgets.reduce((sum, b) => sum + (b.totalBudget || 0), 0);
      const totalSpent = budgets.reduce((sum, b) => sum + (b.spent || 0) + (b.reserved || 0), 0);

      const allocated = totalBudget > 0 ? Math.round(totalBudget) : 0;
      const spent = totalSpent > 0 ? Math.round(totalSpent) : 0;

      return {
        dept: dept.name,
        allocated,
        spent,
      };
    }));

    // Stock Movements monthly trend
    const stockMovementsAggregation = await StockMovement.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            month: { $dateToString: { format: groupFormat, date: "$createdAt" } },
            type: "$type"
          },
          totalQty: { $sum: "$quantity" }
        }
      }
    ]);

    const movementMonths = {};
    stockMovementsAggregation.forEach(item => {
      const monthKey = item._id.month;
      const type = item._id.type;
      if (!movementMonths[monthKey]) {
        movementMonths[monthKey] = { name: monthKey, entries: 0, exits: 0 };
      }
      if (type === "in") {
        movementMonths[monthKey].entries += item.totalQty;
      } else if (type === "out") {
        movementMonths[monthKey].exits += item.totalQty;
      }
    });

    const stockMovementData = Array.from(allKeys).sort().map(key => {
      const data = movementMonths[key];
      let name = key;
      let mIndex = now.getMonth() + 1;
      if (period === "month") {
        const parts = key.split("-");
        mIndex = parseInt(parts[1], 10);
        name = `${monthNames[mIndex - 1]} ${parts[0]}`;
      } else if (period === "day") {
        const parts = key.split("-");
        mIndex = parseInt(parts[1], 10);
        name = `${parts[2]}/${parts[1]}`;
      }

      return {
        name,
        entries: data?.entries > 0 ? Math.round(data.entries) : 0,
        exits: data?.exits > 0 ? Math.round(data.exits) : 0,
      };
    });

    // Fallback if empty
    if (stockMovementData.length === 0) {
      if (period === "month") {
        monthNames.slice(0, 6).forEach((m, idx) => {
          stockMovementData.push({
            name: `${m} ${now.getFullYear()}`,
            entries: 0,
            exits: 0,
          });
        });
      }
    }

    // Target Performance (Objectifs vs Réalisé)
    const targetQuery = { year: now.getFullYear() };
    const targets = await Target.aggregate([
      { $match: targetQuery },
      {
        $group: {
          _id: "$month",
          targetValue: { $sum: "$targetValue" },
          actualValue: { $sum: "$actualValue" }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    const targetData = monthNames.map((name, index) => {
      const match = targets.find(t => t._id === (index + 1));
      return {
        month: name,
        targetValue: match ? Math.round(match.targetValue) : 0,
        actualValue: match ? Math.round(match.actualValue) : 0,
      };
    });

    // Distribution metrics
    const roles = ["ADMIN", "MANAGER", "SALES_MANAGER", "HR_MANAGER", "FINANCE_MANAGER", "PROCUREMENT_MANAGER", "LOGISTICS_MANAGER", "USER"];
    const roleDistribution = await Promise.all(roles.map(async (role) => {
      const count = await User.countDocuments({ role });
      return {
        name: role.replace("_", " ").toLowerCase(),
        value: count,
      };
    }));

    // Map Locations (Clients & Suppliers)
    const clients = await Client.find();
    const clientOrders = await Commande.find({ status: "DELIVERED" });
    const clientLocs = {};
    for (const client of clients) {
      const loc = client.adresse || "Tunis";
      const orders = clientOrders.filter(o => String(o.client) === String(client._id));
      const total = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      if (total > 0 || orders.length > 0) {
        if (!clientLocs[loc]) clientLocs[loc] = { location: loc, total: 0, count: 0, type: "client" };
        clientLocs[loc].total += total;
        clientLocs[loc].count += orders.length;
      }
    }

    const suppliers = await Supplier.find();
    const receivedPurchases = await Achat.find({ status: "RECEIVED" });
    const supplierLocs = {};
    for (const supplier of suppliers) {
      const loc = supplier.city || supplier.address || "Tunis";
      const purchases = receivedPurchases.filter(p => String(p.supplier) === String(supplier._id));
      const total = purchases.reduce((sum, p) => sum + (p.totalAmount || p.totalAmountTND || 0), 0);
      if (total > 0 || purchases.length > 0) {
        const fullLoc = supplier.country ? `${loc}, ${supplier.country}` : loc;
        if (!supplierLocs[fullLoc]) supplierLocs[fullLoc] = { location: fullLoc, total: 0, count: 0, type: "supplier" };
        supplierLocs[fullLoc].total += total;
        supplierLocs[fullLoc].count += purchases.length;
      }
    }

    let mapLocations = [
      ...Object.values(clientLocs),
      ...Object.values(supplierLocs)
    ];

    if (mapLocations.length === 0) {
      mapLocations = [];
    }

    return res.json({
      revenueData,
      departmentData,
      stockMovementData,
      targetData,
      roleDistribution,
      mapLocations,
    });
  } catch (error) {
    console.error("Error in getAdminChartData:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

module.exports = {
  getAdminDashboardData,
  getAdminChartData,
};
