const express = require("express");
const {
  createAchat,
  listAchats,
  getAchatById,
  updateAchat,
  deleteAchat,
  receiveAchat,
} = require("../controllers/achatController");

const ocrController = require("../controllers/ocrController");

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.get("/", listAchats);
// OCR endpoint for backwards compatibility: POST /api/achats/ocr/invoice
// Accepts either JSON { text } or multipart/form-data with file field `image`.
router.post("/ocr/invoice", upload.single('file'), (req, res, next) => {
  if (req.file) return ocrController.parseInvoiceFile(req, res, next);
  return ocrController.parseInvoiceText(req, res, next);
});
router.get("/:id", getAchatById);
router.post("/", createAchat);
router.put("/:id", updateAchat);
router.delete("/:id", deleteAchat);
router.patch("/:id/receive", receiveAchat);
router.post("/:id/receive", receiveAchat);

module.exports = router;
