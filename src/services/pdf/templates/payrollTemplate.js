const PDFDocument = require("pdfkit");
const drawHeader = require("../molecules/drawHeader");
const drawInfoCards = require("../molecules/drawInfoCards");
const drawItemsTable = require("../organisms/drawItemsTable");
const drawSignatures = require("../molecules/drawSignatures");
const colors = require("../atoms/colors");

module.exports = async function generatePayrollPdf(payroll, settings) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 36, size: "A4" });
      const chunks = [];
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("error", reject);
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      const periodLabel = `${String(payroll.periodMonth || "").padStart(2, "0")}/${payroll.periodYear || ""}`;
      await drawHeader(doc, settings, "FICHE DE PAIE", periodLabel);

      const emp = payroll.employee || {};
      const empName = emp.name || `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || "Employé";
      const hireDateStr = emp.hireDate ? new Date(emp.hireDate).toLocaleDateString("fr-FR") : "-";
      const paymentDateStr = payroll.paymentDate ? new Date(payroll.paymentDate).toLocaleDateString("fr-FR") : "-";
      
      const deptName = emp.department?.name || emp.departmentName || "-";
      const postTitle = emp.positionRef?.title || emp.position || "-";

      drawInfoCards(
        doc,
        "Détails Période & Paiement",
        [
          `Période : ${periodLabel}`,
          `Date de paiement : ${paymentDateStr}`,
          `Statut : ${String(payroll.status || "DRAFT").toUpperCase()}`,
          `Devise : TND`,
        ],
        "Salarié",
        [
          `Nom : ${empName}`,
          `CIN : ${emp.cin || "-"} | Matricule : ${emp.employeeCode || "-"}`,
          `Poste : ${postTitle} (${emp.contractType || "-"})`,
          `Département : ${deptName} | Embauche : ${hireDateStr}`,
        ]
      );

      // Lines table: Code | Désignation / Rubrique | Gains | Retenues
      const headers = ["Code", "Rubrique / Désignation", "Gains (TND)", "Retenues (TND)"];
      const widths = [60, 240, 110, 110];
      const aligns = ["left", "left", "right", "right"];

      const formatMoney = (val) => val > 0 ? val.toLocaleString("fr-TN", { style: "currency", currency: "TND" }) : "-";

      const rows = [
        ["100", "Salaire de base (Brut)", formatMoney(payroll.grossSalary || 0), "-"],
        ["110", "Primes et indemnités", formatMoney(payroll.bonusAmount || 0), "-"],
        ["200", "Retenues et cotisations", "-", formatMoney(payroll.deductionAmount || 0)]
      ];

      drawItemsTable(doc, headers, widths, rows, aligns);

      // Net to pay card
      const contentLeft = doc.page.margins.left;
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const y = doc.y + 15;
      const cardWidth = 180;
      const cardHeight = 36;

      const money = (val) => Number(val || 0).toLocaleString("fr-TN", { style: "currency", currency: "TND" });

      doc.save();
      doc.roundedRect(contentLeft + pageWidth - cardWidth, y, cardWidth, cardHeight, 6).fillAndStroke(colors.light, colors.border);
      doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(10);
      doc.text("Net à Payer", contentLeft + pageWidth - cardWidth + 10, y + 13, { width: 80 });
      doc.fontSize(11).fillColor(colors.primary);
      doc.text(money(payroll.netSalary || 0), contentLeft + pageWidth - 90, y + 12, { width: 80, align: "right" });
      doc.restore();
      doc.y = y + cardHeight + 15;

      drawSignatures(doc, "Signature de l'employeur (Cachet)", "Signature du salarié");

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
