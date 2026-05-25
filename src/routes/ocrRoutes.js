const express = require('express');
const { parseInvoiceText, createAchatFromInvoice } = require('../controllers/ocrController');
const router = express.Router();

router.post('/parse', parseInvoiceText);
router.post('/create-achat', createAchatFromInvoice);

module.exports = router;
