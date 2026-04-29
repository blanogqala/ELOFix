const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const materialOrderController = require("../controllers/materialOrder.controller");

const router = express.Router();

/** GET /api/orders — Admin: all orders or ?supplierId=; Supplier: own orders (?status=) */
router.get("/", authenticate, asyncHandler(materialOrderController.listOrdersQuery));

module.exports = router;
