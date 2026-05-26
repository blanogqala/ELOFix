const express = require("express");
const storeController = require("../controllers/store.controller");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.get("/", asyncHandler(storeController.listStores));
router.get("/:id/products", asyncHandler(storeController.getStoreProducts));
router.get("/:id", asyncHandler(storeController.getStore));

module.exports = router;
