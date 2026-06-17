const express = require("express");
const providerAccountController = require("../controllers/providerAccount.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");
const financialIdem = require("../middleware/financialIdempotency.middleware");

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(["PROVIDER"]));

router.get("/balance", asyncHandler(providerAccountController.getBalance));
router.get("/earnings", asyncHandler(providerAccountController.getEarnings));
router.get("/earnings/:jobId", asyncHandler(providerAccountController.getEarningJob));
router.get("/withdrawal-profile", asyncHandler(providerAccountController.getWithdrawalProfile));
router.put("/withdrawal-profile", asyncHandler(providerAccountController.putWithdrawalProfile));
router.get("/withdrawals", asyncHandler(providerAccountController.getWithdrawals));
router.post(
  "/withdraw",
  financialIdem.attachFinancialRequestFingerprint,
  financialIdem.requireIdempotencyKey,
  asyncHandler(providerAccountController.postWithdraw)
);

module.exports = router;
