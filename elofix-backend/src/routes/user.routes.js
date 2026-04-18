const express = require("express");
const userController = require("../controllers/user.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/:id", authenticate, asyncHandler(userController.getUserById));

module.exports = router;
