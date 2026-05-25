const fs = require('fs');
const invoiceOcrParser = require('../services/invoiceOcrParser');
const Achat = require('../models/Achat');
const { createWorker } = require('tesseract.js');
const { extractInvoiceFromBuffer } = require('../services/textractOcrService');

let tesseractWorkerPromise = null;

async function getTesseractWorker() {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = createWorker('fra').catch((err) => {
      tesseractWorkerPromise = null;
      throw err;
    });
  }

  return tesseractWorkerPromise;
}

async function runTesseractOnBuffer(buffer) {
  try {
    const worker = await getTesseractWorker();
    const result = await worker.recognize(buffer);
    return result.data.text || '';
  } catch (err) {
    throw new Error(`Tesseract OCR failed: ${err.message}`);
  }
}

function getRequestedProvider(req) {
  const provider = req?.query?.provider || req?.body?.provider || process.env.OCR_PROVIDER || 'tesseract';
  return String(provider).toLowerCase();
}

function mergeParsedInvoice(baseParsed, overrideData = {}) {
  return {
    ...baseParsed,
    ...overrideData,
    items: Array.isArray(overrideData.items) && overrideData.items.length > 0
      ? overrideData.items
      : baseParsed.items,
  };
}

function normalizeCurrencyCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return 'TND';
  return normalized;
}

function detectCurrencyFromText(text) {
  const normalized = String(text || '').toUpperCase();
  if (/\bTND\b|\bDINAR\b|\bDT\b/.test(normalized)) return 'TND';
  if (/\bEUR\b|€/.test(normalized)) return 'EUR';
  if (/\bUSD\b|\$/.test(normalized)) return 'USD';
  if (/\bGBP\b|£/.test(normalized)) return 'GBP';
  if (/\bCHF\b/.test(normalized)) return 'CHF';
  if (/\bCAD\b/.test(normalized)) return 'CAD';
  return 'TND';
}

async function buildInternalPurchaseNumber() {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  const base = `ACH-${year}${month}${day}`;

  const achats = await Achat.find({}, 'purchaseNumber').lean();
  const existing = new Set((Array.isArray(achats) ? achats : [])
    .map((item) => String(item?.purchaseNumber || '').trim())
    .filter(Boolean));

  if (!existing.has(base)) return base;

  let attempt = 1;
  while (existing.has(`${base}-${attempt}`)) {
    attempt += 1;
  }

  return `${base}-${attempt}`;
}

async function parseInvoiceText(req, res) {
  try {
    if (req.file && (req.file.buffer || req.file.path)) {
      const fileBuffer = req.file.buffer || await fs.promises.readFile(req.file.path);
      const provider = getRequestedProvider(req);

      if (provider === 'textract') {
        const extracted = await extractInvoiceFromBuffer(fileBuffer);
        const parsed = invoiceOcrParser.parse(extracted.rawText || '');
        const mergedParsed = mergeParsedInvoice(parsed, {
          invoiceNumber: extracted.fields?.invoiceNumber || parsed.invoiceNumber || null,
          date: extracted.fields?.date || parsed.date || null,
          client: extracted.fields?.supplier || parsed.client || null,
          totalHT: extracted.fields?.totalHT ?? parsed.totalHT ?? 0,
          tvaAmount: extracted.fields?.tvaAmount ?? parsed.tvaAmount ?? 0,
          totalTTC: extracted.fields?.totalTTC ?? parsed.totalTTC ?? 0,
          items: extracted.items && extracted.items.length > 0 ? extracted.items : parsed.items,
        });

        return res.json({
          provider: extracted.provider,
          source: extracted.source,
          rawText: extracted.rawText,
          parsed: mergedParsed,
          fields: {
            numeroFacture: { value: mergedParsed.invoiceNumber || '' },
            dateFacture: { value: mergedParsed.date || '' },
            fournisseur: { value: mergedParsed.client || '' },
            devise: { value: normalizeCurrencyCode(extracted.fields?.currencyCode || detectCurrencyFromText(extracted.rawText)) },
            tauxChange: { value: 1 },
            montantHT: { value: mergedParsed.totalHT ?? null },
            montantTVA: { value: mergedParsed.tvaAmount ?? null },
            montantTTC: { value: mergedParsed.totalTTC ?? null },
          },
          lines: Array.isArray(mergedParsed.items) ? mergedParsed.items : [],
        });
      }

      const text = await runTesseractOnBuffer(fileBuffer);
      const parsed = invoiceOcrParser.parse(text);
      return res.json({
        parsed,
        rawText: text,
        provider: 'tesseract',
        source: 'tesseract.js',
        fields: {
          numeroFacture: { value: parsed.invoiceNumber || '' },
          dateFacture: { value: parsed.date || '' },
          fournisseur: { value: parsed.client || '' },
          devise: { value: detectCurrencyFromText(text) },
          tauxChange: { value: 1 },
          montantHT: { value: parsed.totalHT ?? null },
          montantTVA: { value: parsed.tvaAmount ?? null },
          montantTTC: { value: parsed.totalTTC ?? null },
        },
        lines: Array.isArray(parsed.items) ? parsed.items : [],
      });
    }

    const text = req && req.body ? req.body.text : undefined;
    if (!text) {
      return res.status(400).json({ message: 'Provide OCR `text` in request body (Content-Type: application/json) or upload `image` multipart/form-data.' });
    }
    const parsed = invoiceOcrParser.parse(text);
    return res.json(parsed);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

async function createAchatFromInvoice(req, res) {
  try {
    const text = req && req.body ? req.body.text : undefined;
    const supplierId = req && req.body ? req.body.supplierId : undefined;
    if (!text) return res.status(400).json({ message: 'Provide OCR `text` in request body (Content-Type: application/json).' });
    const parsed = invoiceOcrParser.parse(text);

    // If caller did not provide supplierId, return parsed result and suggest next step
    if (!supplierId) {
      return res.status(200).json({ message: 'Parsed invoice. Provide supplierId and ensure you are authenticated to create Achat.', parsed });
    }

    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required to create Achat' });
    }

    // Build Achat payload mapping parsed items to expected structure if possible
    const achatItems = (parsed.items || []).map(it => ({
      product: it.productId || it.product || null,
      quantity: it.quantity || 0,
      unitCost: it.unitPrice || 0,
    }));

    if (achatItems.length === 0) {
      return res.status(400).json({ message: 'No purchasable line items were detected in the invoice text.', parsed });
    }

    if (achatItems.some((item) => !item.product)) {
      return res.status(400).json({
        message: 'OCR parsed the invoice, but at least one line item is missing a product mapping. Send productId for each line before creating the Achat.',
        parsed,
      });
    }

    const purchasePayload = {
      purchaseNumber: await buildInternalPurchaseNumber(),
      date: parsed.date ? new Date(parsed.date) : new Date(),
      supplier: supplierId,
      items: achatItems,
      totalHT: parsed.totalHT || 0,
      tvaAmount: parsed.tvaAmount || 0,
      totalAmount: parsed.totalTTC || parsed.totalAmount || 0,
      totalAmountTTC: parsed.totalTTC || parsed.totalAmount || 0,
      createdBy: req.user.id,
      ocrSource: 'ocr-parse',
    };

    const created = await Achat.create(purchasePayload);
    return res.status(201).json({ achat: created, parsed });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

module.exports = {
  parseInvoiceText,
  createAchatFromInvoice,
  parseInvoiceFile: async function parseInvoiceFile(req, res) {
    try {
      const file = req && req.file ? req.file : undefined;
      if (!file) return res.status(400).json({ message: 'No file uploaded. Send multipart form with field `file`.' });

      const fileBuffer = file.buffer || (file.path ? await fs.promises.readFile(file.path) : null);
      if (!fileBuffer) {
        return res.status(400).json({ message: 'Uploaded file buffer is missing.' });
      }

      const provider = getRequestedProvider(req);
      if (provider === 'textract') {
        const extracted = await extractInvoiceFromBuffer(fileBuffer);
        const parsed = invoiceOcrParser.parse(extracted.rawText || '');
        const mergedParsed = mergeParsedInvoice(parsed, {
          invoiceNumber: extracted.fields?.invoiceNumber || parsed.invoiceNumber || null,
          date: extracted.fields?.date || parsed.date || null,
          client: extracted.fields?.supplier || parsed.client || null,
          totalHT: extracted.fields?.totalHT ?? parsed.totalHT ?? 0,
          tvaAmount: extracted.fields?.tvaAmount ?? parsed.tvaAmount ?? 0,
          totalTTC: extracted.fields?.totalTTC ?? parsed.totalTTC ?? 0,
          items: extracted.items && extracted.items.length > 0 ? extracted.items : parsed.items,
        });

        return res.json({
          source: 'ocr',
          provider: extracted.provider,
          engine: extracted.source,
          rawText: extracted.rawText,
          parsed: mergedParsed,
          fields: {
            numeroFacture: { value: mergedParsed.invoiceNumber || '' },
            dateFacture: { value: mergedParsed.date || '' },
            fournisseur: { value: mergedParsed.client || '' },
            devise: { value: normalizeCurrencyCode(extracted.fields?.currencyCode || detectCurrencyFromText(extracted.rawText)) },
            tauxChange: { value: 1 },
            montantHT: { value: mergedParsed.totalHT ?? null },
            montantTVA: { value: mergedParsed.tvaAmount ?? null },
            montantTTC: { value: mergedParsed.totalTTC ?? null },
          },
          lines: Array.isArray(mergedParsed.items) ? mergedParsed.items : [],
        });
      }

      const text = await runTesseractOnBuffer(fileBuffer);
      const parsed = invoiceOcrParser.parse(text);
      return res.json({
        source: 'ocr',
        provider: 'tesseract',
        engine: 'tesseract.js',
        rawText: text,
        parsed,
        fields: {
          numeroFacture: { value: parsed.invoiceNumber || '' },
          dateFacture: { value: parsed.date || '' },
          fournisseur: { value: parsed.client || '' },
          devise: { value: detectCurrencyFromText(text) },
          tauxChange: { value: 1 },
          montantHT: { value: parsed.totalHT ?? null },
          montantTVA: { value: parsed.tvaAmount ?? null },
          montantTTC: { value: parsed.totalTTC ?? null },
        },
        lines: Array.isArray(parsed.items) ? parsed.items : [],
      });
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }
  }
};
