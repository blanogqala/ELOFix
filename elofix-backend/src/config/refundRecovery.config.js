const { PAYMENT_DUE_DAYS, PAYMENT_DUE_MINUTES, getPaymentDueMs } = require("./paymentDue.config");

/**
 * Platform bank account for provider refund-debt repayments.
 * Override via env in production.
 */
const PLATFORM_BANK = {
  bankName: process.env.EFX_REFUND_BANK_NAME || "Standard Bank",
  accountName: process.env.EFX_REFUND_ACCOUNT_NAME || "LITI Holdings (Pty) Ltd",
  accountNumber: process.env.EFX_REFUND_ACCOUNT_NUMBER || "0000000000",
  branchCode: process.env.EFX_REFUND_BRANCH_CODE || "051001",
  accountType: process.env.EFX_REFUND_ACCOUNT_TYPE || "Business Cheque",
};

/** Days provider has to clear refund debt before restriction (ignored when minutes override is set). */
const REFUND_DEBT_DUE_DAYS = PAYMENT_DUE_DAYS;
const REFUND_DEBT_DUE_MINUTES = PAYMENT_DUE_MINUTES;

function getRefundDebtDueMs() {
  return getPaymentDueMs();
}

module.exports = {
  PLATFORM_BANK,
  REFUND_DEBT_DUE_DAYS,
  REFUND_DEBT_DUE_MINUTES,
  getRefundDebtDueMs,
};
