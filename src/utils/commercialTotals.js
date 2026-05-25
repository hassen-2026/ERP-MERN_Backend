const mongoose = require("mongoose");
const Product = require("../models/Product");

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeProductId(item) {
  return item?.product || item?.productId || item?.product_id || null;
}

function normalizeUnitPrice(item, priceField = "unitPrice") {
  if (priceField && item?.[priceField] !== undefined) {
    return Number(item[priceField]);
  }

  if (item?.unitPrice !== undefined) return Number(item.unitPrice);
  if (item?.unitCost !== undefined) return Number(item.unitCost);
  return 0;
}

async function computeCommercialTotals(items, options = {}) {
  const session = options.session || null;
  const priceField = options.priceField || "unitPrice";

  let totalHT = 0;
  let tvaAmount = 0;

  for (const item of items || []) {
    const productId = normalizeProductId(item);
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error("Invalid product id in items");
      error.status = 400;
      throw error;
    }

    let query = Product.findById(productId);
    if (session) query = query.session(session);
    const product = await query.select("tvaRate");
    if (!product) {
      const error = new Error(`Product not found: ${productId}`);
      error.status = 404;
      throw error;
    }

    const quantity = Number(item?.quantity);
    const unitPrice = normalizeUnitPrice(item, priceField);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      const error = new Error("Invalid quantity in items");
      error.status = 400;
      throw error;
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      const error = new Error("Invalid unitPrice in items");
      error.status = 400;
      throw error;
    }

    const lineHT = quantity * unitPrice;
    const lineTVA = lineHT * Number(product.tvaRate || 0);

    totalHT += lineHT;
    tvaAmount += lineTVA;
  }

  totalHT = roundMoney(totalHT);
  tvaAmount = roundMoney(tvaAmount);

  return {
    totalHT,
    tvaAmount,
    totalAmountTTC: roundMoney(totalHT + tvaAmount),
  };
}

module.exports = {
  computeCommercialTotals,
};