const PDFDocument = require("pdfkit");
const drawHeader = require("../molecules/drawHeader");
const drawInfoCards = require("../molecules/drawInfoCards");
const drawItemsTable = require("../organisms/drawItemsTable");
const drawTotals = require("../molecules/drawTotals");
const drawSignatures = require("../molecules/drawSignatures");
const resolveField = require("../atoms/resolveField");
const colors = require("../atoms/colors");

module.exports = async function generateFacturePdf(facture, settings) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 36, size: "A4" });
      const chunks = [];
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("error", reject);
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      await drawHeader(doc, settings, "FACTURE", facture.invoiceNumber);

      const invoiceDate = facture.date ? new Date(facture.date).toLocaleDateString("fr-FR") : "-";
      const clientName = resolveField(facture.client, "nom", "name");
      const clientPhone = resolveField(facture.client, "telephone", "phone");
      const clientAddress = resolveField(facture.client, "adresse", "address");

      drawInfoCards(
        doc,
        "Détails Facture",
        [
          `Numéro : ${facture.invoiceNumber || "-"}`,
          `Date : ${invoiceDate}`,
          `Paiement : ${String(facture.paymentStatus || "UNPAID").toUpperCase()}`,
          `Réf Commande : ${facture.commande?.commandeNumber || "-"}`,
        ],
        "Client Facturé",
        [
          `Nom : ${clientName}`,
          `Tél : ${clientPhone}`,
          `Adresse : ${clientAddress}`,
        ]
      );

      // Lines table
      const headers = ["#", "Désignation", "Référence", "Qté", "P.U. HT", "TVA", "Total TTC"];
      const widths = [24, 180, 68, 36, 60, 44, 90];
      const aligns = ["left", "left", "left", "right", "right", "right", "right"];

      const invoiceItems = Array.isArray(facture.items) ? facture.items : [];
      
      let computedTotalHT = 0;
      let computedTVATotal = 0;

      const rows = invoiceItems.map((item, index) => {
        const prod = item.product || {};
        const prodName = prod.name || "Produit";
        const prodRef = prod.reference || "-";
        const qty = Number(item.quantity || 0);
        const unitPrice = Number(item.unitPrice || 0);
        
        const tvaRate = Number(prod.tvaRate ?? prod.taxRate ?? 0);
        const lineHT = qty * unitPrice;
        const lineTVA = lineHT * tvaRate;
        const lineTTC = lineHT + lineTVA;

        computedTotalHT += lineHT;
        computedTVATotal += lineTVA;

        const formatMoney = (val) => val.toLocaleString("fr-TN", { style: "currency", currency: "TND" });

        return [
          String(index + 1),
          prodName,
          prodRef,
          String(qty),
          formatMoney(unitPrice),
          `${(tvaRate * 100).toFixed(0)}%`,
          formatMoney(lineTTC),
        ];
      });

      const totalTTC = Number(facture.totalAmountTTC || (computedTotalHT + computedTVATotal).toFixed(2));

      drawItemsTable(doc, headers, widths, rows, aligns);
      drawTotals(doc, computedTotalHT, computedTVATotal, totalTTC, "TND");
      drawSignatures(doc, "Mode de règlement / Cachet", "Signature & Bon pour accord");

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
