const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    reference: { type: String, required: true, unique: true, uppercase: true, trim: true },
    purchasePriceHT: { type: Number, default: 0, min: 0 },
    salePriceHT: { type: Number, default: 0, min: 0 },
    purchasePriceTTC: { type: Number, default: 0, min: 0 },
    salePriceTTC: { type: Number, default: 0, min: 0 },
    tvaRate: { type: Number, default: 0.19, min: 0, max: 1 },
    quantity: { type: Number, default: 0, min: 0 },
    minThreshold: { type: Number, default: 0, min: 0 },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category"},
    categorie: { type: String, uppercase: true, trim: true, default: "" },
    description: { type: String, default: " " },
    imageUrl: { type: String, default: " " },
    imagePublicId: { type: String, default: " " },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Hook pre-save pour calculer les prix TTC basés sur la TVA de la catégorie
productSchema.pre("save", async function () {
  try {
    let tvaRate = this.tvaRate || 0.19;

    // Si une catégorie est associée, récupérer son taux de TVA
    if (this.categoryId) {
      const Category = mongoose.model("Category");
      const category = await Category.findById(this.categoryId);
      if (category && category.tvaRate !== undefined) {
        tvaRate = category.tvaRate;
        this.tvaRate = tvaRate;
      }
    }

    // Calculer les prix TTC
    this.purchasePriceTTC = Number((this.purchasePriceHT * (1 + tvaRate)).toFixed(2));
    this.salePriceTTC = Number((this.salePriceHT * (1 + tvaRate)).toFixed(2));
    return;
  } catch (error) {
    throw error;
  }
});

module.exports = mongoose.model("Product", productSchema);
