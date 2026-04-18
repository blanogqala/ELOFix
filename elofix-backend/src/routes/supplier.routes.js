const express = require("express");
const supplierController = require("../controllers/supplier.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", asyncHandler(supplierController.listSuppliers));
router.get("/products", asyncHandler(supplierController.getProductsByCategory));
router.get("/:id", asyncHandler(supplierController.getSupplier));

router.post(
  "/",
  authenticate,
  authorizeRoles(["ADMIN"]),
  asyncHandler(supplierController.createSupplier)
);
router.post(
  "/:id/products",
  authenticate,
  authorizeRoles(["ADMIN"]),
  asyncHandler(supplierController.addProduct)
);
router.patch(
  "/:id/products/:productId/price",
  authenticate,
  authorizeRoles(["ADMIN"]),
  asyncHandler(supplierController.updateProductPrice)
);

module.exports = router;
