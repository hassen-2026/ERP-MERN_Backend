const colors = require("../atoms/colors");

module.exports = function drawInfoCards(doc, leftTitle, leftLines, rightTitle, rightLines) {
  const contentLeft = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const cardWidth = (pageWidth - 12) / 2;
  const y = doc.y + 10;
  const cardHeight = 76;

  // Left card
  doc.save();
  doc.roundedRect(contentLeft, y, cardWidth, cardHeight, 6).fillAndStroke("white", colors.border);
  doc.roundedRect(contentLeft, y, cardWidth, 20, 6).fill(colors.light);
  doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(9).text(leftTitle, contentLeft + 10, y + 6);
  doc.fillColor(colors.text).font("Helvetica").fontSize(8);
  leftLines.forEach((line, i) => {
    doc.text(line, contentLeft + 10, y + 26 + (i * 12), { width: cardWidth - 20 });
  });
  doc.restore();

  // Right card
  doc.save();
  doc.roundedRect(contentLeft + cardWidth + 12, y, cardWidth, cardHeight, 6).fillAndStroke("white", colors.border);
  doc.roundedRect(contentLeft + cardWidth + 12, y, cardWidth, 20, 6).fill(colors.light);
  doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(9).text(rightTitle, contentLeft + cardWidth + 22, y + 6);
  doc.fillColor(colors.text).font("Helvetica").fontSize(8);
  rightLines.forEach((line, i) => {
    doc.text(line, contentLeft + cardWidth + 22, y + 26 + (i * 12), { width: cardWidth - 20 });
  });
  doc.restore();

  doc.moveDown(6);
};
