const PDFDocument = require("pdfkit");
const drawHeader = require("../molecules/drawHeader");
const drawInfoCards = require("../molecules/drawInfoCards");
const drawItemsTable = require("../organisms/drawItemsTable");
const drawSignatures = require("../molecules/drawSignatures");

module.exports = async function generateAttendancePdf(data, settings) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 36, size: "A4" });
      const chunks = [];
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("error", reject);
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      const { employee, month, year, attendances = [] } = data;
      const periodLabel = `${String(month).padStart(2, "0")}/${year}`;
      await drawHeader(doc, settings, "FICHE DE PRESENCE", periodLabel);

      const empName = employee.name || `${employee.firstName || ""} ${employee.lastName || ""}`.trim() || "Employé";
      const hireDateStr = employee.hireDate ? new Date(employee.hireDate).toLocaleDateString("fr-FR") : "-";
      
      const deptName = employee.department?.name || employee.departmentName || "-";
      const postTitle = employee.positionRef?.title || employee.position || "-";

      // Calculate stats
      const totalHours = attendances.reduce((sum, att) => sum + (att.totalHours || 0), 0);
      const daysPresent = attendances.filter(att => att.status === "PRESENT" || att.status === "LATE" || att.status === "REMOTE").length;
      const daysAbsent = attendances.filter(att => att.status === "ABSENT").length;
      const daysLate = attendances.filter(att => att.status === "LATE").length;

      drawInfoCards(
        doc,
        "Détails Période & Présences",
        [
          `Période : ${periodLabel}`,
          `Total Heures : ${totalHours.toFixed(2)} h`,
          `Jours Présents : ${daysPresent} | Retards : ${daysLate}`,
          `Jours Absents : ${daysAbsent}`,
        ],
        "Salarié",
        [
          `Nom : ${empName}`,
          `CIN : ${employee.cin || "-"} | Matricule : ${employee.employeeCode || "-"}`,
          `Poste : ${postTitle} (${employee.contractType || "-"})`,
          `Département : ${deptName} | Embauche : ${hireDateStr}`,
        ]
      );

      // Lines table: Date | Statut | Heure Entrée | Heure Sortie | Heures
      const headers = ["Date", "Statut", "Heure Entrée", "Heure Sortie", "Heures"];
      const widths = [100, 120, 100, 100, 103];
      const aligns = ["left", "left", "left", "left", "right"];

      const statusMap = {
        PRESENT: "Présent",
        ABSENT: "Absent",
        LATE: "En retard",
        REMOTE: "Télétravail",
        HALF_DAY: "Demi-journée",
      };

      const formatTime = (date) => {
        if (!date) return "-";
        const d = new Date(date);
        return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      };

      const rows = attendances.map((att) => {
        const dateStr = att.attendanceDate ? new Date(att.attendanceDate).toLocaleDateString("fr-FR") : "-";
        const statusStr = statusMap[att.status] || att.status || "-";
        const inStr = formatTime(att.checkIn);
        const outStr = formatTime(att.checkOut);
        const hoursStr = `${(att.totalHours || 0).toFixed(2)} h`;

        return [dateStr, statusStr, inStr, outStr, hoursStr];
      });

      drawItemsTable(doc, headers, widths, rows, aligns);

      // Signatures
      drawSignatures(doc, "Signature de l'employeur (Cachet)", "Signature du salarié");

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
