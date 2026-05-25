const express = require("express");
const { createSnapshot, listSnapshots } = require("../controllers/snapshotController");

const router = express.Router();

router.get("/", listSnapshots);
router.post("/", createSnapshot);

module.exports = router;
