const colors = require("../atoms/colors");

module.exports = function drawSignatures(doc, sellerTitle = "Cachet de l'entreprise", buyerTitle = "Signature client") {
  const contentLeft = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const y = doc.y + 15;
  const blockWidth = (pageWidth - 12) / 2;
  const blockHeight = 70;

  if (y + blockHeight > doc.page.height - 60) {
    doc.addPage();
  }

  const currentY = doc.y;

  // Seller card
  doc.save();
  doc.roundedRect(contentLeft, currentY, blockWidth, blockHeight, 6).fillAndStroke("white", colors.border);
  doc.roundedRect(contentLeft, currentY, blockWidth, 18, 6).fill(colors.light);
  doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(8).text(sellerTitle, contentLeft + 10, currentY + 5);
  doc.restore();

  // Buyer card
  doc.save();
  doc.roundedRect(contentLeft + blockWidth + 12, currentY, blockWidth, blockHeight, 6).fillAndStroke("white", colors.border);
  doc.roundedRect(contentLeft + blockWidth + 12, currentY, blockWidth, 18, 6).fill(colors.light);
  doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(8).text(buyerTitle, contentLeft + blockWidth + 22, currentY + 5);
  doc.restore();

  doc.y = currentY + blockHeight + 15;
};
