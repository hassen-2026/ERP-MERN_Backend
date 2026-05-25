const CurrencyRate = require("../models/CurrencyRate");

const DEFAULT_RATES = [
  { currencyCode: "TND", rateToTnd: 1 },
  { currencyCode: "EUR", rateToTnd: 3.4 },
  { currencyCode: "USD", rateToTnd: 3.15 },
  { currencyCode: "GBP", rateToTnd: 3.95 },
];

function normalizeCurrencyCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeRate(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

async function ensureDefaultRates(userId) {
  const count = await CurrencyRate.countDocuments();
  if (count > 0) return;

  const payload = DEFAULT_RATES.map((item) => ({
    ...item,
    updatedBy: userId,
  }));
  await CurrencyRate.insertMany(payload, { ordered: false });
}

async function listCurrencyRates(req, res) {
  try {
    await ensureDefaultRates(req.user?.id);
    const rates = await CurrencyRate.find().sort({ currencyCode: 1 });
    return res.json(rates);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function upsertCurrencyRates(req, res) {
  try {
    const rates = Array.isArray(req.body?.rates) ? req.body.rates : [];
    if (!rates.length) {
      return res.status(400).json({ message: "rates array is required" });
    }

    const updates = [];

    for (const item of rates) {
      const currencyCode = normalizeCurrencyCode(item?.currencyCode);
      const rateToTnd = normalizeRate(item?.rateToTnd);
      const isActive = item?.isActive !== undefined ? Boolean(item.isActive) : true;

      if (!currencyCode) {
        return res.status(400).json({ message: "currencyCode is required for each rate" });
      }

      if (rateToTnd === null) {
        return res.status(400).json({ message: `Invalid rateToTnd for ${currencyCode}` });
      }

      updates.push(
        CurrencyRate.findOneAndUpdate(
          { currencyCode },
          {
            currencyCode,
            rateToTnd,
            isActive,
            updatedBy: req.user?.id,
          },
          { upsert: true, new: true, runValidators: true }
        )
      );
    }

    await Promise.all(updates);

    const refreshed = await CurrencyRate.find().sort({ currencyCode: 1 });
    return res.json({ message: "Currency rates updated", rates: refreshed });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  listCurrencyRates,
  upsertCurrencyRates,
};