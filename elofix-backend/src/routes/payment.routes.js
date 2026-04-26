const express = require("express");
const paymentController = require("../controllers/payment.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");
const financialIdem = require("../middleware/financialIdempotency.middleware");

const router = express.Router();

router.use(authenticate);

router.post(
  "/paystack/verify",
  financialIdem.attachFinancialRequestFingerprint,
  financialIdem.requireIdempotencyKey,
  asyncHandler(paymentController.verifyPaystack)
);

router.post(
  "/release",
  authorizeRoles(["ADMIN"]),
  financialIdem.attachFinancialRequestFingerprint,
  financialIdem.requireIdempotencyKey,
  asyncHandler(paymentController.releaseEscrow)
);

router.get("/cards", asyncHandler(paymentController.getSavedCards));
router.post("/cards", asyncHandler(paymentController.addCard));
router.delete("/cards/:cardId", asyncHandler(paymentController.deleteCard));
router.patch("/cards/:cardId/default", asyncHandler(paymentController.setDefaultCard));

router.get("/invoices", asyncHandler(paymentController.getInvoices));
router.get("/invoices/:invoiceId", asyncHandler(paymentController.getInvoice));
router.post("/invoices", asyncHandler(paymentController.createInvoice));
router.post("/invoices/refund", asyncHandler(paymentController.createRefundInvoice));

module.exports = router;
