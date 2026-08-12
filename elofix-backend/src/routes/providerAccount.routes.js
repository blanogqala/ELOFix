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
router.put("/withdrawal-profile/replace", asyncHandler(providerAccountController.putWithdrawalProfileReplace));
router.delete("/withdrawal-profile", asyncHandler(providerAccountController.deleteWithdrawalProfile));
router.get("/withdrawals", asyncHandler(providerAccountController.getWithdrawals));
router.get("/transactions", asyncHandler(providerAccountController.getTransactions));
router.get("/trust-score", asyncHandler(providerAccountController.getTrustScore));
router.get("/refund-debt", asyncHandler(providerAccountController.getRefundDebt));
router.get(
  "/jobs/:jobId/refund-obligation",
  asyncHandler(providerAccountController.getJobRefundObligation)
);
router.post(
  "/jobs/:jobId/refund-obligation/checkout",
  asyncHandler(providerAccountController.postRefundObligationCheckout)
);
router.post("/refund-debt/repayments", asyncHandler(providerAccountController.postRefundRepayment));
router.post(
  "/withdraw",
  financialIdem.attachFinancialRequestFingerprint,
  financialIdem.requireIdempotencyKey,
  asyncHandler(providerAccountController.postWithdraw)
);

module.exports = router;
