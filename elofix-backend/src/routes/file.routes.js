const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const fileController = require("../controllers/file.controller");

const router = express.Router();

router.get("/:fileId", asyncHandler(fileController.getFileById));

module.exports = router;
