const PDFDocument = require("pdfkit");
const drawHeader = require("../molecules/drawHeader");
const drawInfoCards = require("../molecules/drawInfoCards");
const drawItemsTable = require("../organisms/drawItemsTable");
const drawSignatures = require("../molecules/drawSignatures");
const colors = require("../atoms/colors");

module.exports = async function generateEvaluationPdf(evaluation, settings) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 36, size: "A4" });
      const chunks = [];
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("error", reject);
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      const periodLabel = evaluation.periodLabel || "Courante";
      await drawHeader(doc, settings, "FICHE D'EVALUATION", periodLabel);

      const emp = evaluation.employee || {};
      const empName = emp.name || `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || "Employé";
      const hireDateStr = emp.hireDate ? new Date(emp.hireDate).toLocaleDateString("fr-FR") : "-";
      
      const deptName = emp.department?.name || emp.departmentName || "-";
      const postTitle = emp.positionRef?.title || emp.position || "-";

      const evaluator = evaluation.evaluator || {};
      const evaluatorName = `${evaluator.firstName || ""} ${evaluator.lastName || ""}`.trim() || "Évaluateur";
      const evaluatorRole = evaluator.role || "Manager";

      const evalDateStr = evaluation.evaluationDate ? new Date(evaluation.evaluationDate).toLocaleDateString("fr-FR") : "-";
      const nextDateStr = evaluation.nextReviewDate ? new Date(evaluation.nextReviewDate).toLocaleDateString("fr-FR") : "-";

      const statusMap = {
        DRAFT: "Brouillon",
        PENDING: "En attente",
        APPROVED: "Validée",
        REJECTED: "Rejetée",
        COMPLETED: "Terminée",
        ARCHIVED: "Archivée",
      };
      const statusLabel = statusMap[evaluation.status] || evaluation.status || "-";

      drawInfoCards(
        doc,
        "Détails Évaluation",
        [
          `Période : ${periodLabel}`,
          `Date d'évaluation : ${evalDateStr}`,
          `Statut : ${statusLabel}`,
          `Évaluateur : ${evaluatorName} (${evaluatorRole})`,
        ],
        "Collaborateur",
        [
          `Nom : ${empName}`,
          `Matricule : ${emp.employeeCode || "-"} | CIN : ${emp.cin || "-"}`,
          `Poste : ${postTitle} (${emp.contractType || "-"})`,
          `Département : ${deptName} | Embauche : ${hireDateStr}`,
        ]
      );

      // Score details table
      const headers = ["Critère d'évaluation", "Note obtenue", "Appréciation"];
      const widths = [220, 110, 220];
      const aligns = ["left", "right", "left"];

      const getAppreciation = (score) => {
        if (score >= 90) return "Excellent";
        if (score >= 75) return "Très Satisfaisant";
        if (score >= 50) return "Satisfaisant";
        if (score >= 35) return "A améliorer";
        return "Insuffisant";
      };

      const rows = [
        [
          "Compétences Techniques / Professionnelles",
          `${evaluation.technicalScore || 0} / 100`,
          getAppreciation(evaluation.technicalScore || 0)
        ],
        [
          "Comportement & Soft Skills",
          `${evaluation.behaviorScore || 0} / 100`,
          getAppreciation(evaluation.behaviorScore || 0)
        ],
        [
          "Atteinte des Objectifs",
          `${evaluation.goalScore || 0} / 100`,
          getAppreciation(evaluation.goalScore || 0)
        ]
      ];

      drawItemsTable(doc, headers, widths, rows, aligns);

      // Net score card
      const contentLeft = doc.page.margins.left;
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const y = doc.y + 15;
      const cardWidth = 200;
      const cardHeight = 36;

      doc.save();
      doc.roundedRect(contentLeft + pageWidth - cardWidth, y, cardWidth, cardHeight, 6).fillAndStroke(colors.light, colors.border);
      doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(10);
      doc.text("Score Global", contentLeft + pageWidth - cardWidth + 10, y + 13, { width: 90 });
      doc.fontSize(11).fillColor(colors.primary);
      doc.text(`${evaluation.overallScore || 0} / 100 (${getAppreciation(evaluation.overallScore || 0)})`, contentLeft + pageWidth - 100, y + 12, { width: 90, align: "right" });
      doc.restore();
      doc.y = y + cardHeight + 20;

      // Next review info (if present)
      if (evaluation.nextReviewDate) {
        doc.save();
        doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(10).text("Prochaine étape", contentLeft);
        doc.fillColor(colors.text).font("Helvetica").fontSize(9).text(`La prochaine évaluation de performance est planifiée pour le : ${nextDateStr}`, contentLeft, doc.y + 6);
        doc.restore();
        doc.y = doc.y + 25;
      }

      // Comments section (if present)
      if (evaluation.comments) {
        doc.save();
        doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(10).text("Commentaires / Observations", contentLeft);
        doc.fillColor(colors.text).font("Helvetica").fontSize(9).text(evaluation.comments, contentLeft, doc.y + 6, {
          width: pageWidth,
          align: "justify"
        });
        doc.restore();
        doc.y = doc.y + 35;
      }

      // Signatures
      drawSignatures(doc, "Signature de l'Évaluateur", "Signature du Collaborateur (Lu et approuvé)");

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
