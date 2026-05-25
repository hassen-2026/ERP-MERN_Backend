const express = require("express");
const {
  createLivraison,
  assignTransporterAndDeliver,
  listLivraisons,
  getLivraisonById,
  downloadLivraisonDeliveryNotePdf,
} = require("../controllers/livraisonController");

const router = express.Router();

router.get("/", listLivraisons);
router.get("/:id/bon-livraison/pdf", downloadLivraisonDeliveryNotePdf);
router.get("/:id", getLivraisonById);
router.post("/", createLivraison);
router.put("/:id/assign-transporter", assignTransporterAndDeliver);

module.exports = router;
