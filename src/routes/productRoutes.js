const express = require("express");
const auth = require("../middleware/auth");
const uploadProductImage = require("../middleware/productImageUpload");
const {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  lowStock
} = require("../controllers/productController");

const router = express.Router();

router.use(auth);
router.get("/", getProducts);
router.get("/low-stock", lowStock);
router.get("/:id", getProductById);
router.post("/", uploadProductImage.single("image"), createProduct);
router.put("/:id", uploadProductImage.single("image"), updateProduct);
router.delete("/:id", deleteProduct);

module.exports = router;
