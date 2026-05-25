const mongoose = require("mongoose");

const budgetSchema = new mongoose.Schema(
  {
    // Identification
    name: { type: String, required: true, trim: true }, // Ex: "Budget Achats Janvier 2026"
    description: { type: String, trim: true, default: "" },
    
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null, // null = budget global
    },
    
    // Période budgétaire
    month: { type: Number, required: true, min: 1, max: 12 }, // 1-12
    year: { type: Number, required: true, min: 2020, max: 2100 },
    
    // Montants
    totalBudget: { type: Number, required: true, min: 0 }, // Budget alloué
    spent: { type: Number, default: 0, min: 0 }, // Dépenses actuelles
    reserved: { type: Number, default: 0, min: 0 }, // Réservé/Engagé
    
    // Status
    status: {
      type: String,
      enum: ["DRAFT", "APPROVED", "ACTIVE", "CLOSED", "EXCEEDED"],
      default: "DRAFT",
    },
    
    // Alertes
    warningThreshold: { type: Number, default: 80 }, // Alerte à 80%
    isWarning: { type: Boolean, default: false },
    isExceeded: { type: Boolean, default: false },
    
    // Notes et approvals
    notes: { type: String, trim: true, default: "" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    approvedAt: { type: Date, default: null },
    
    // Audit
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual - Montant disponible
budgetSchema.virtual("available").get(function () {
  return this.totalBudget - this.spent - this.reserved;
});

// Virtual - Pourcentage utilisé
budgetSchema.virtual("percentageUsed").get(function () {
  if (this.totalBudget === 0) return 0;
  return Math.round(((this.spent + this.reserved) / this.totalBudget) * 100);
});

// Index pour recherches rapides
budgetSchema.index({ month: 1, year: 1, department: 1 });
budgetSchema.index({ status: 1 });
budgetSchema.index({ createdBy: 1 });
budgetSchema.index({ approvedBy: 1 });

// Middleware - Mettre à jour les flags
// Use a synchronous pre-save hook without `next` to avoid issues
budgetSchema.pre("save", function () {
  const percentageUsed = this.percentageUsed;

  this.isWarning = percentageUsed >= this.warningThreshold && percentageUsed < 100;
  this.isExceeded = this.spent + this.reserved > this.totalBudget;

  if (this.isExceeded) {
    this.status = "EXCEEDED";
  }
});

module.exports = mongoose.model("Budget", budgetSchema);
