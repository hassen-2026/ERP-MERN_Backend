const PDFDocument = require("pdfkit");
const drawHeader = require("../molecules/drawHeader");
const drawInfoCards = require("../molecules/drawInfoCards");
const drawItemsTable = require("../organisms/drawItemsTable");
const drawSignatures = require("../molecules/drawSignatures");
const colors = require("../atoms/colors");

module.exports = async function generateReceiptPdf(payment, settings) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 36, size: "A4" });
      const chunks = [];
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("error", reject);
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      const receiptRef = `REC-${payment._id.toString().slice(-6).toUpperCase()}`;
      await drawHeader(doc, settings, "RECU DE PAIEMENT", receiptRef);

      const facture = payment.facture || {};
      const client = facture.client || {};
      const clientName = client.nom || "-";
      
      const paymentDateStr = payment.date ? new Date(payment.date).toLocaleDateString("fr-FR") : "-";
      
      const methodLabels = {
        CASH: "Cash",
        CARD: "Carte bancaire",
        BANK_TRANSFER: "Virement bancaire",
        MOBILE_MONEY: "Mobile Money",
        OTHER: "Autre",
      };
      const methodLabel = methodLabels[payment.paymentMethod] || payment.paymentMethod || "Autre";

      drawInfoCards(
        doc,
        "Détails Règlement",
        [
          `Référence reçu : ${receiptRef}`,
          `Date du règlement : ${paymentDateStr}`,
          `Mode de règlement : ${methodLabel}`,
          `Facture associée : ${facture.invoiceNumber || "-"}`,
        ],
        "Client",
        [
          `Nom : ${clientName}`,
          `Tél : ${client.telephone || "-"}`,
          `E-mail : ${client.email || "-"}`,
          `Adresse : ${client.adresse || "-"}`,
        ]
      );

      // Lines table
      const headers = ["Désignation / Objet du règlement", "Montant Facture", "Montant Réglé"];
      const widths = [280, 130, 140];
      const aligns = ["left", "right", "right"];

      const formatMoney = (val) => Number(val || 0).toLocaleString("fr-TN", { style: "currency", currency: "TND" });

      const rows = [
        [
          `Acompte / Règlement sur Facture N° ${facture.invoiceNumber || "-"}`,
          formatMoney(facture.totalAmountTTC),
          formatMoney(payment.amount)
        ]
      ];

      drawItemsTable(doc, headers, widths, rows, aligns);

      // Total Encaissé block
      const contentLeft = doc.page.margins.left;
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const y = doc.y + 15;
      const cardWidth = 200;
      const cardHeight = 36;

      doc.save();
      doc.roundedRect(contentLeft + pageWidth - cardWidth, y, cardWidth, cardHeight, 6).fillAndStroke(colors.light, colors.border);
      doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(10);
      doc.text("Montant Encaissé", contentLeft + pageWidth - cardWidth + 10, y + 13, { width: 95 });
      doc.fontSize(11).fillColor(colors.primary);
      doc.text(formatMoney(payment.amount), contentLeft + pageWidth - 90, y + 12, { width: 80, align: "right" });
      doc.restore();
      
      doc.y = y + cardHeight + 20;

      // Note (if present)
      if (payment.note) {
        doc.save();
        doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(10).text("Notes / Observations", contentLeft);
        doc.fillColor(colors.text).font("Helvetica").fontSize(9).text(payment.note, contentLeft, doc.y + 6, {
          width: pageWidth,
          align: "justify"
        });
        doc.restore();
        doc.y = doc.y + 35;
      }

      drawSignatures(doc, "Signature & Cachet Caisse", "Signature du Client");

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
