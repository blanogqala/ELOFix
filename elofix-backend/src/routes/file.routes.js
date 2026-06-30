const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { optionalAuthenticate } = require("../middleware/auth.middleware");
const fileController = require("../controllers/file.controller");

const router = express.Router();

router.get("/:fileId", optionalAuthenticate, asyncHandler(fileController.getFileById));

module.exports = router;
