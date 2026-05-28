const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const fileController = require("../controllers/file.controller");
const { optionalAuthenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/:fileId", optionalAuthenticate, asyncHandler(fileController.getFileById));

module.exports = router;
