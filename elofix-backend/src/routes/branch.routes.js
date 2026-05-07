const express = require("express");
const branchController = require("../controllers/branch.controller");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.get("/nearby", asyncHandler(branchController.listNearby));

module.exports = router;
