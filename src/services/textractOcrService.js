const {
  TextractClient,
  AnalyzeExpenseCommand,
  DetectDocumentTextCommand,
} = require('@aws-sdk/client-textract');

let textractClient = null;

function getTextractClient() {
  if (textractClient) return textractClient;

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!region) {
    throw new Error('AWS_REGION is required to use Textract');
  }

  textractClient = new TextractClient({ region });
  return textractClient;
}

function parseAmount(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value)
    .replace(/\s/g, '')
    .replace(/,/g, '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getFieldValue(fields, typeName) {
  const field = (fields || []).find((item) => item?.Type?.Text === typeName);
  return field?.ValueDetection?.Text || null;
}

function getFieldByType(fields, typeName) {
  return (fields || []).find((item) => item?.Type?.Text === typeName) || null;
}

function extractCurrencyCode(field) {
  const code = field?.Currency?.Code;
  if (!code) return null;
  return String(code).trim().toUpperCase();
}

function detectCurrencyFromText(text) {
  const normalized = String(text || '').toUpperCase();
  if (/\bTND\b|\bDINAR\b|\bDT\b/.test(normalized)) return 'TND';
  if (/\bEUR\b|€/.test(normalized)) return 'EUR';
  if (/\bUSD\b|\$/.test(normalized)) return 'USD';
  if (/\bGBP\b|£/.test(normalized)) return 'GBP';
  if (/\bCHF\b/.test(normalized)) return 'CHF';
  if (/\bCAD\b/.test(normalized)) return 'CAD';
  return null;
}

function normalizeExpenseItems(expenseDocuments) {
  const items = [];

  for (const document of expenseDocuments || []) {
    for (const group of document.LineItemGroups || []) {
      for (const lineItem of group.LineItems || []) {
        const description = getFieldValue(lineItem.LineItemExpenseFields, 'ITEM')
          || getFieldValue(lineItem.LineItemExpenseFields, 'DESCRIPTION')
          || '';
        const quantity = parseAmount(getFieldValue(lineItem.LineItemExpenseFields, 'QUANTITY')) || 0;
        const unitPrice = parseAmount(getFieldValue(lineItem.LineItemExpenseFields, 'PRICE'))
          || parseAmount(getFieldValue(lineItem.LineItemExpenseFields, 'UNIT_PRICE'))
          || 0;
        const amount = parseAmount(getFieldValue(lineItem.LineItemExpenseFields, 'AMOUNT'))
          || (quantity && unitPrice ? quantity * unitPrice : 0);
        const priceField = getFieldByType(lineItem.LineItemExpenseFields, 'PRICE')
          || getFieldByType(lineItem.LineItemExpenseFields, 'UNIT_PRICE')
          || getFieldByType(lineItem.LineItemExpenseFields, 'AMOUNT');
        const currencyCode = extractCurrencyCode(priceField);

        if (!description && !quantity && !unitPrice && !amount) {
          continue;
        }

        items.push({
          designation: description || 'Item',
          quantity,
          unitPrice,
          amount,
          currencyCode,
        });
      }
    }
  }

  return items;
}

function normalizeExpenseSummary(expenseDocuments) {
  const summaryFields = expenseDocuments?.[0]?.SummaryFields || [];
  const invoiceNumber = getFieldValue(summaryFields, 'INVOICE_RECEIPT_ID')
    || getFieldValue(summaryFields, 'DOCUMENT_NUMBER')
    || null;
  const date = getFieldValue(summaryFields, 'INVOICE_RECEIPT_DATE')
    || getFieldValue(summaryFields, 'DATE')
    || null;
  const supplier = getFieldValue(summaryFields, 'VENDOR_NAME')
    || getFieldValue(summaryFields, 'SUPPLIER_NAME')
    || null;
  const totalHT = parseAmount(getFieldValue(summaryFields, 'SUBTOTAL'));
  const tvaAmount = parseAmount(getFieldValue(summaryFields, 'TAX'));
  const totalTTC = parseAmount(getFieldValue(summaryFields, 'TOTAL'));
  const currencyCode = extractCurrencyCode(getFieldByType(summaryFields, 'TOTAL'))
    || extractCurrencyCode(getFieldByType(summaryFields, 'SUBTOTAL'))
    || extractCurrencyCode(getFieldByType(summaryFields, 'TAX'))
    || null;

  return {
    invoiceNumber,
    date,
    supplier,
    totalHT,
    tvaAmount,
    totalTTC,
    currencyCode,
  };
}

function buildRawTextFromBlocks(blocks = []) {
  return blocks
    .filter((block) => block?.BlockType === 'LINE' && block?.Text)
    .map((block) => block.Text)
    .join('\n');
}

async function extractInvoiceFromBuffer(buffer) {
  const client = getTextractClient();

  try {
    const response = await client.send(new AnalyzeExpenseCommand({
      Document: { Bytes: buffer },
    }));

    const expenseDocuments = response.ExpenseDocuments || [];
    const summary = normalizeExpenseSummary(expenseDocuments);
    const items = normalizeExpenseItems(expenseDocuments);
    const detectedCurrency = summary.currencyCode
      || items.find((item) => item.currencyCode)?.currencyCode
      || null;
    const rawText = [
      summary.invoiceNumber ? `Invoice Number: ${summary.invoiceNumber}` : null,
      summary.date ? `Date: ${summary.date}` : null,
      summary.supplier ? `Supplier: ${summary.supplier}` : null,
      detectedCurrency ? `Currency: ${detectedCurrency}` : null,
      summary.totalHT !== null ? `Total HT: ${summary.totalHT}` : null,
      summary.tvaAmount !== null ? `TVA: ${summary.tvaAmount}` : null,
      summary.totalTTC !== null ? `Total TTC: ${summary.totalTTC}` : null,
      ...items.map((item) => `${item.designation} ${item.quantity} ${item.unitPrice} ${item.amount}`),
    ].filter(Boolean).join('\n');

    return {
      provider: 'textract',
      source: 'aws-textract-analyze-expense',
      rawText,
      fields: {
        ...summary,
        currencyCode: detectedCurrency,
      },
      items,
    };
  } catch (expenseError) {
    const textResponse = await client.send(new DetectDocumentTextCommand({
      Document: { Bytes: buffer },
    }));

    const rawText = buildRawTextFromBlocks(textResponse.Blocks || []);

    return {
      provider: 'textract',
      source: 'aws-textract-detect-document-text',
      rawText,
      fields: { currencyCode: detectCurrencyFromText(rawText) },
      items: [],
      warning: expenseError.message,
    };
  }
}

module.exports = {
  extractInvoiceFromBuffer,
};
