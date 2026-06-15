const PDFDocument = require("pdfkit");
const drawHeader = require("../molecules/drawHeader");
const drawInfoCards = require("../molecules/drawInfoCards");
const drawItemsTable = require("../organisms/drawItemsTable");
const drawTotals = require("../molecules/drawTotals");
const drawSignatures = require("../molecules/drawSignatures");
const resolveField = require("../atoms/resolveField");

module.exports = async function generateDevisPdf(devis, settings) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 36, size: "A4" });
      const chunks = [];
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("error", reject);
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      const displayCurrencyCode = String(devis.currencyCode || "TND").toUpperCase();
      const exchangeRate = Number(devis.exchangeRateToTnd || 1) || 1;
      const hasCurrencyConversion = displayCurrencyCode !== "TND" && Number.isFinite(exchangeRate) && exchangeRate > 0;
      
      const convertForDisplay = (value) => {
        const num = Number(value || 0);
        if (!hasCurrencyConversion) return num;
        return Number((num / exchangeRate).toFixed(3));
      };

      const displayTotals = hasCurrencyConversion && devis.originalCurrencyTotals
        ? {
            totalHT: Number(devis.originalCurrencyTotals.totalHT || 0),
            tvaAmount: Number(devis.originalCurrencyTotals.tvaAmount || 0),
            totalAmountTTC: Number(devis.originalCurrencyTotals.totalAmountTTC || 0),
          }
        : {
            totalHT: convertForDisplay(devis.totalHT),
            tvaAmount: convertForDisplay(devis.tvaAmount),
            totalAmountTTC: convertForDisplay(devis.totalAmountTTC || devis.totalAmount || devis.totalHT + devis.tvaAmount),
          };

      await drawHeader(doc, settings, "DEVIS", devis.quoteNumber);

      const devisDate = devis.date ? new Date(devis.date).toLocaleDateString("fr-FR") : "-";
      const clientName = resolveField(devis.client, "nom", "name");
      const clientPhone = resolveField(devis.client, "telephone", "phone");
      const clientAddress = resolveField(devis.client, "adresse", "address");

      drawInfoCards(
        doc,
        "Informations Devis",
        [
          `Numéro : ${devis.quoteNumber || "-"}`,
          `Date : ${devisDate}`,
          `Statut : ${String(devis.status || "-").toUpperCase()}`,
          `Devise : ${displayCurrencyCode}`,
        ],
        "Client",
        [
          `Nom : ${clientName}`,
          `Tél : ${clientPhone}`,
          `Adresse : ${clientAddress}`,
        ]
      );

      // Lines table
      const headers = ["#", "Désignation", "Référence", "Qté", "P.U. HT", "Total HT"];
      const widths = [24, 220, 70, 40, 70, 78];
      const aligns = ["left", "left", "left", "right", "right", "right"];
      
      const devisLines = Array.isArray(devis.items) ? devis.items : [];
      const rows = devisLines.map((line, index) => {
        const prodName = line.product?.name || "Produit";
        const prodRef = line.product?.reference || "-";
        const qty = Number(line.quantity || 0);
        const unitHT = convertForDisplay(line.unitPrice || 0);
        const totalLine = qty * unitHT;

        const formatMoney = (val) => val.toLocaleString("fr-TN", { style: "currency", currency: displayCurrencyCode });

        return [
          String(index + 1),
          prodName,
          prodRef,
          String(qty),
          formatMoney(unitHT),
          formatMoney(totalLine),
        ];
      });

      drawItemsTable(doc, headers, widths, rows, aligns);
      drawTotals(doc, displayTotals.totalHT, displayTotals.tvaAmount, displayTotals.totalAmountTTC, displayCurrencyCode);
      drawSignatures(doc, "Cachet & Signature Vendeur", "Signature client (Lu et approuvé)");

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
