const CompanySettings = require("../../models/CompanySettings");
const generateDevisPdf = require("./templates/devisTemplate");
const generateLivraisonPdf = require("./templates/livraisonTemplate");
const generateFacturePdf = require("./templates/factureTemplate");
const generatePayrollPdf = require("./templates/payrollTemplate");
const generateAttendancePdf = require("./templates/attendanceTemplate");
const generateEvaluationPdf = require("./templates/evaluationTemplate");
const generateReceiptPdf = require("./templates/receiptTemplate");

async function generatePdf(type, entity) {
  // Always query CompanySettings first (or fallback if empty)
  let settings = await CompanySettings.findOne();
  if (!settings) {
    settings = {
      name: "Mon Entreprise",
      address: "Adresse de l'entreprise",
      phone: "N° de Téléphone",
      email: "contact@entreprise.com",
      taxNumber: "0000000/A/P/M/000",
      logoUrl: "",
    };
  }

  const normalizedType = String(type).trim().toLowerCase();
  
  if (normalizedType === "devis") {
    return generateDevisPdf(entity, settings);
  } else if (normalizedType === "livraison") {
    return generateLivraisonPdf(entity, settings);
  } else if (normalizedType === "facture") {
    return generateFacturePdf(entity, settings);
  } else if (normalizedType === "payroll" || normalizedType === "paie") {
    return generatePayrollPdf(entity, settings);
  } else if (normalizedType === "attendance" || normalizedType === "presence") {
    return generateAttendancePdf(entity, settings);
  } else if (normalizedType === "evaluation") {
    return generateEvaluationPdf(entity, settings);
  } else if (normalizedType === "receipt" || normalizedType === "recu" || normalizedType === "paiement") {
    return generateReceiptPdf(entity, settings);
  } else {
    throw new Error(`Unsupported PDF document type: ${type}`);
  }
}

module.exports = {
  generatePdf,
};
