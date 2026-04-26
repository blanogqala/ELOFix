const express = require("express");
const specialController = require("../controllers/special.controller");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.get("/", asyncHandler(specialController.getSpecials));

module.exports = router;
