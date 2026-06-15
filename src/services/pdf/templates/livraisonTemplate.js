const PDFDocument = require("pdfkit");
const drawHeader = require("../molecules/drawHeader");
const drawInfoCards = require("../molecules/drawInfoCards");
const drawItemsTable = require("../organisms/drawItemsTable");
const drawSignatures = require("../molecules/drawSignatures");
const resolveField = require("../atoms/resolveField");

module.exports = async function generateLivraisonPdf(livraison, settings) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 36, size: "A4" });
      const chunks = [];
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("error", reject);
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      await drawHeader(doc, settings, "BON DE LIVRAISON", livraison.deliveryNumber);

      const deliveryDate = livraison.date ? new Date(livraison.date).toLocaleDateString("fr-FR") : "-";
      const clientName = resolveField(livraison.commandes?.[0]?.client || livraison.commandeItems?.[0]?.commande?.client, "nom", "name");
      const clientPhone = resolveField(livraison.commandes?.[0]?.client || livraison.commandeItems?.[0]?.commande?.client, "telephone", "phone");
      const clientAddress = resolveField(livraison.commandes?.[0]?.client || livraison.commandeItems?.[0]?.commande?.client, "adresse", "address");

      drawInfoCards(
        doc,
        "Informations Livraison",
        [
          `Numéro : ${livraison.deliveryNumber || "-"}`,
          `Date : ${deliveryDate}`,
          `Statut : ${String(livraison.status || "-").toUpperCase()}`,
          `N° Commande : ${livraison.commandes?.[0]?.commandeNumber || "-"}`,
        ],
        "Destinataire",
        [
          `Nom : ${clientName}`,
          `Tél : ${clientPhone}`,
          `Adresse : ${clientAddress}`,
          `Transporteur : ${livraison.transporter?.name || "-"} (${livraison.transporter?.plateNumber || "-"})`,
        ]
      );

      // Lines table
      const headers = ["#", "Désignation", "Référence", "Qté Demandée", "Qté Livrée"];
      const widths = [28, 230, 80, 80, 84];
      const aligns = ["left", "left", "left", "right", "right"];

      const deliveryLines = Array.isArray(livraison.bonCommandeLines) && livraison.bonCommandeLines.length > 0
        ? livraison.bonCommandeLines
        : (livraison.commandeItems || []).map(item => ({
            commandeItem: item,
            requestedQuantity: Number(item.orderedQuantity ?? item.quantity ?? 0),
            deliveredQuantity: Number(item.deliveredQuantity ?? item.orderedQuantity ?? item.quantity ?? 0),
          }));

      const rows = deliveryLines.map((line, index) => {
        const item = line.commandeItem || line || {};
        const product = item.product || {};
        const productName = product.name || "Produit";
        const productRef = product.reference || "-";
        const reqQty = line.requestedQuantity ?? item.orderedQuantity ?? item.quantity ?? 0;
        const delQty = line.deliveredQuantity ?? item.deliveredQuantity ?? reqQty;

        return [
          String(index + 1),
          productName,
          productRef,
          String(reqQty),
          String(delQty),
        ];
      });

      drawItemsTable(doc, headers, widths, rows, aligns);
      drawSignatures(doc, "Transporteur (Nom & Signature)", "Destinataire (Nom, Date & Signature)");

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
