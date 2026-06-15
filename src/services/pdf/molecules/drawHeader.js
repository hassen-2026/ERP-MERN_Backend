const colors = require("../atoms/colors");
const downloadLogo = require("../atoms/downloadLogo");

module.exports = async function drawHeader(doc, settings, title, docNumber) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const contentLeft = doc.page.margins.left;
  
  doc.save();
  // Banner background
  doc.rect(contentLeft, 22, pageWidth, 70).fill(colors.primary);
  doc.fillColor("white").fontSize(22).font("Helvetica-Bold").text(title, contentLeft + 18, 40);
  doc.fontSize(10).font("Helvetica").text(`Référence : ${docNumber || "-"}`, contentLeft + 18, 66);
  doc.restore();

  // Company Details Block
  doc.save();
  doc.fillColor(colors.text).fontSize(9);
  let companyY = 100;
  
  if (settings.logoUrl) {
    const logoBuffer = await downloadLogo(settings.logoUrl);
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, contentLeft, companyY, { width: 50 });
        companyY += 56;
      } catch (err) {
        console.error("Failed to render logo in PDFKit:", err.message);
      }
    }
  }

  doc.font("Helvetica-Bold").fontSize(11).text(settings.name, contentLeft, companyY);
  doc.font("Helvetica").fontSize(8).fillColor(colors.muted);
  doc.text(`Adresse : ${settings.address || "-"}`, contentLeft, companyY + 14);
  doc.text(`Tél : ${settings.phone || "-"} | E-mail : ${settings.email || "-"}`, contentLeft, companyY + 24);
  doc.text(`Matricule Fiscale : ${settings.taxNumber || "-"}`, contentLeft, companyY + 34);
  doc.restore();
  
  doc.moveDown(3);
};
