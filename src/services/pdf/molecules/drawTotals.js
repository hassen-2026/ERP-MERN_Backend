const colors = require("../atoms/colors");

module.exports = function drawTotals(doc, totalHT, tvaAmount, totalTTC, currencyCode = "TND") {
  const contentLeft = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const y = doc.y + 15;
  const cardWidth = 180;
  const cardHeight = 66;

  const money = (val) => Number(val || 0).toLocaleString("fr-TN", { style: "currency", currency: currencyCode });

  doc.save();
  doc.roundedRect(contentLeft + pageWidth - cardWidth, y, cardWidth, cardHeight, 6).fillAndStroke(colors.light, colors.border);
  
  doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(8);
  doc.text("Total HT", contentLeft + pageWidth - cardWidth + 10, y + 10, { width: 80 });
  doc.text("TVA", contentLeft + pageWidth - cardWidth + 10, y + 26, { width: 80 });
  doc.text("Total TTC", contentLeft + pageWidth - cardWidth + 10, y + 44, { width: 80 });

  doc.fillColor(colors.primary).fontSize(8);
  doc.text(money(totalHT), contentLeft + pageWidth - 90, y + 10, { width: 80, align: "right" });
  doc.text(money(tvaAmount), contentLeft + pageWidth - 90, y + 26, { width: 80, align: "right" });
  
  doc.fontSize(11).fillColor(colors.primary);
  doc.text(money(totalTTC), contentLeft + pageWidth - 90, y + 42, { width: 80, align: "right" });
  
  doc.restore();
  doc.y = y + cardHeight + 15;
};
