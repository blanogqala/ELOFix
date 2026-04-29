const express = require("express");
const authController = require("../controllers/auth.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/register", asyncHandler(authController.register));
router.post("/login", asyncHandler(authController.login));
router.post("/change-password", authenticate, asyncHandler(authController.changePassword));
router.get("/me", authenticate, asyncHandler(authController.getMe));

module.exports = router;
