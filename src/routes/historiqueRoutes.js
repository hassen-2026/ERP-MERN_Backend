const express = require("express");
const { listHistorique } = require("../controllers/historiqueController");

const router = express.Router();

router.get("/", listHistorique);

module.exports = router;
