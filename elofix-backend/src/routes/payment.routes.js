const express = require("express");
const paymentController = require("../controllers/payment.controller");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);

router.get("/cards", asyncHandler(paymentController.getSavedCards));
router.post("/cards", asyncHandler(paymentController.addCard));
router.delete("/cards/:cardId", asyncHandler(paymentController.deleteCard));
router.patch("/cards/:cardId/default", asyncHandler(paymentController.setDefaultCard));

router.get("/invoices", asyncHandler(paymentController.getInvoices));
router.get("/invoices/:invoiceId", asyncHandler(paymentController.getInvoice));
router.post("/invoices", asyncHandler(paymentController.createInvoice));
router.post("/invoices/refund", asyncHandler(paymentController.createRefundInvoice));

module.exports = router;
