// invoiceOcrParser.js
// Simple regex-based invoice parser for two templates.

function cleanText(text) {
  return text.replace(/\r/g, "\n").replace(/\t/g, " ").replace(/\u00A0/g, " ");
}

function parseAmount(s) {
  if (!s) return 0;
  const cleaned = String(s).replace(/\s/g, '').replace(/\u00A0/g, '').replace(/,/g, '.').replace(/DT/gi, '');
  const m = cleaned.match(/[-+]?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

function parseLinesTable(text) {
  // Find common line patterns: "Designation ... Quantité ... Prix ... Montant"
  const lines = [];
  const rows = text.split(/\n/).map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Try to match patterns like "Clavier USB 2 25,00 50,00"
    const m = row.match(/^(.+?)\s+(\d+[.,]?\d*)\s+(\d+[.,]?\d*)\s+(\d+[.,]?\d*)$/);
    if (m) {
      lines.push({
        designation: m[1].trim(),
        quantity: parseAmount(m[2]),
        unitPrice: parseAmount(m[3]),
        amount: parseAmount(m[4]),
      });
      continue;
    }

    // Try pattern with currency symbol: "Souris sans fil 1 15,00 DT 15,00 DT"
    const m2 = row.match(/^(.+?)\s+(\d+)\s+(\d+[.,]?\d*)\s*(?:DT)?\s+(\d+[.,]?\d*)\s*(?:DT)?$/i);
    if (m2) {
      lines.push({
        designation: m2[1].trim(),
        quantity: parseInt(m2[2], 10) || 0,
        unitPrice: parseAmount(m2[3]),
        amount: parseAmount(m2[4]),
      });
      continue;
    }

    // If row contains "|" separators, split
    if (row.indexOf('|') !== -1) {
      const parts = row.split('|').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 4) {
        lines.push({
          designation: parts[0],
          quantity: parseAmount(parts[1]),
          unitPrice: parseAmount(parts[2]),
          amount: parseAmount(parts[3]),
        });
        continue;
      }
    }
  }

  return lines;
}

function extractFieldByLabel(text, labelCandidates) {
  const lines = text.split(/\n/).map(l => l.trim());
  for (const label of labelCandidates) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toLowerCase().startsWith(label.toLowerCase())) {
        return line.substring(label.length).trim().replace(/^[:\-\s]+/, '');
      }
      // label may be followed on same line with colon
      const re = new RegExp(label + '\\s*[:\-]\\s*(.+)', 'i');
      const m = line.match(re);
      if (m) return m[1].trim();
    }
  }
  return null;
}

function detectTemplate(text) {
  const t = text.toLowerCase();
  if (t.includes('total ht') && t.includes('tva')) return 'templateA';
  if (t.includes('facture') && t.includes('prix unitaire')) return 'templateA';
  // add other heuristics
  return 'unknown';
}

function parseTemplateA(text) {
  // Based on the attached sample invoice (TechStore SARL)
  const t = cleanText(text);
  const lines = t.split(/\n/).map(l => l.trim()).filter(Boolean);

  // Header info heuristics
  const invoiceNumber = extractFieldByLabel(t, ['N°', 'N° de facture', 'Facture N°', 'Facture']);
  const date = extractFieldByLabel(t, ['Date', 'Date :', 'Date de facturation']);
  const dueDate = extractFieldByLabel(t, ['Échéance', 'Echéance', 'Date d\'échéance']);
  const clientLabelIdx = lines.findIndex(l => /^Client[:\s]/i.test(l) || /^Client\s*:/i.test(l));
  let client = null;
  if (clientLabelIdx !== -1) {
    client = lines[clientLabelIdx + 1] || lines[clientLabelIdx];
  } else {
    // fallback: first block after header
    client = extractFieldByLabel(t, ['Client', 'Facturé à', 'Facturé']);
  }

  const payment = extractFieldByLabel(t, ['Mode de paiement', 'Mode de paiement :', 'Mode de règlement']);

  // Lines table detection - search for "Designation" header
  const tableStartIdx = lines.findIndex(l => /D[eé]signa/i.test(l) || /Designation/i.test(l) || /Prix unitaire/i.test(l));
  let tableText = '';
  if (tableStartIdx !== -1) {
    tableText = lines.slice(tableStartIdx + 1, tableStartIdx + 20).join('\n');
  } else {
    // fallback: use whole text
    tableText = t;
  }

  const items = parseLinesTable(tableText);

  // Totals
  const totalHTLine = t.match(/Total\s+HT\s*[:\-]?\s*(\d+[\d\s,\.]+)\s*(?:DT)?/i);
  const tvaLine = t.match(/TVA\s*\(?([0-9]{1,2}%|[0-9.,]+)\)?\s*[:\-]?\s*(\d+[\d\s,\.]+)\s*(?:DT)?/i);
  const totalTTCLine = t.match(/Total\s+TTC\s*[:\-]?\s*(\d+[\d\s,\.]+)\s*(?:DT)?/i);

  const totalHT = totalHTLine ? parseAmount(totalHTLine[1]) : items.reduce((s,i)=>s+(i.amount||0),0);
  const tvaAmount = tvaLine ? parseAmount(tvaLine[2] || tvaLine[1]) : 0;
  const totalTTC = totalTTCLine ? parseAmount(totalTTCLine[1]) : (totalHT + tvaAmount);

  return {
    template: 'templateA',
    invoiceNumber: invoiceNumber || null,
    date: date || null,
    dueDate: dueDate || null,
    client: client || null,
    paymentMethod: payment || null,
    items,
    totalHT,
    tvaAmount,
    totalTTC,
  };
}

function parseUnknown(text) {
  // fallback generic extraction
  const t = cleanText(text);
  const items = parseLinesTable(t);
  const totalTTCLine = t.match(/Total\s+TTC\s*[:\-]?\s*(\d+[\d\s,\.]+)\s*(?:DT)?/i);
  const totalTTC = totalTTCLine ? parseAmount(totalTTCLine[1]) : items.reduce((s,i)=>s+(i.amount||0),0);
  return {
    template: 'unknown',
    items,
    totalTTC,
  };
}

function parse(text) {
  const cleaned = cleanText(text);
  const template = detectTemplate(cleaned);
  if (template === 'templateA') return parseTemplateA(cleaned);
  return parseUnknown(cleaned);
}

module.exports = {
  parse,
  parseTemplateA,
  parseTemplateB: parseTemplateA, // for now both mapped to same parser; add specific logic later
};
