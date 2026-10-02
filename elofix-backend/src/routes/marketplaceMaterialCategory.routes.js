const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const controller = require("../controllers/marketplaceMaterialCategory.controller");

const router = express.Router();

router.get("/", asyncHandler(controller.listActive));

module.exports = router;
