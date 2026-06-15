const colors = require("../atoms/colors");

module.exports = function drawItemsTable(doc, headers, widths, rows, colAligns = []) {
  const contentLeft = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let currentY = doc.y + 15;

  // Draw table header
  doc.save();
  doc.rect(contentLeft, currentY, pageWidth, 20).fill(colors.accent);
  doc.fillColor("white").font("Helvetica-Bold").fontSize(8);
  
  let currentX = contentLeft;
  headers.forEach((header, index) => {
    const width = widths[index];
    const align = colAligns[index] || "left";
    doc.text(header, currentX + 6, currentY + 6, { width: width - 12, align });
    currentX += width;
  });
  doc.restore();

  currentY += 20;

  // Draw table rows
  rows.forEach((row, rowIndex) => {
    const rowHeight = 22;

    // Check page break
    if (currentY + rowHeight > doc.page.height - 110) {
      doc.addPage();
      currentY = 40; // reset y on new page
      // Redraw table header
      doc.save();
      doc.rect(contentLeft, currentY, pageWidth, 20).fill(colors.accent);
      doc.fillColor("white").font("Helvetica-Bold").fontSize(8);
      let tempX = contentLeft;
      headers.forEach((header, index) => {
        const width = widths[index];
        const align = colAligns[index] || "left";
        doc.text(header, tempX + 6, currentY + 6, { width: width - 12, align });
        tempX += width;
      });
      doc.restore();
      currentY += 20;
    }

    // Row background
    doc.save();
    doc.rect(contentLeft, currentY, pageWidth, rowHeight).fill(rowIndex % 2 === 0 ? "white" : colors.light);
    doc.restore();

    // Row texts
    doc.fillColor(colors.text).fontSize(8).font("Helvetica");
    let cellX = contentLeft;
    row.forEach((cell, cellIndex) => {
      const width = widths[cellIndex];
      const align = colAligns[cellIndex] || "left";
      doc.text(String(cell ?? ""), cellX + 6, currentY + 6, {
        width: width - 12,
        align,
        ellipsis: true,
      });
      cellX += width;
    });

    currentY += rowHeight;
  });

  doc.y = currentY;
};
