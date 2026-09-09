const express = require("express");
const authController = require("../controllers/auth.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, optionalAuthenticate } = require("../middleware/auth.middleware");
const {
  authLoginRateLimit,
  authRegisterRateLimit,
  authPasswordRateLimit,
  authGoogleStartRateLimit,
  authGoogleExchangeRateLimit,
} = require("../middleware/ipRateLimit.middleware");

const router = express.Router();

router.post("/register", authRegisterRateLimit, asyncHandler(authController.register));
router.post("/login", authLoginRateLimit, asyncHandler(authController.login));
router.get("/google", authGoogleStartRateLimit, asyncHandler(authController.startGoogleAuth));
router.get("/google/callback", authGoogleStartRateLimit, asyncHandler(authController.googleCallback));
router.post("/google/exchange", authGoogleExchangeRateLimit, asyncHandler(authController.exchangeGoogleAuth));
router.post("/forgot-password", authPasswordRateLimit, asyncHandler(authController.forgotPassword));
router.post("/reset-password", authPasswordRateLimit, asyncHandler(authController.resetPassword));
router.post("/change-password", authenticate, asyncHandler(authController.changePassword));
router.post("/logout", optionalAuthenticate, asyncHandler(authController.logout));
router.get("/me", authenticate, asyncHandler(authController.getMe));

module.exports = router;
