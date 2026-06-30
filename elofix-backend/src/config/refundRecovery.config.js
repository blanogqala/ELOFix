/**
 * Platform bank account for provider refund-debt repayments.
 * Override via env in production.
 */
const PLATFORM_BANK = {
  bankName: process.env.EFX_REFUND_BANK_NAME || "Standard Bank",
  accountName: process.env.EFX_REFUND_ACCOUNT_NAME || "EloFix (Pty) Ltd",
  accountNumber: process.env.EFX_REFUND_ACCOUNT_NUMBER || "0000000000",
  branchCode: process.env.EFX_REFUND_BRANCH_CODE || "051001",
  accountType: process.env.EFX_REFUND_ACCOUNT_TYPE || "Business Cheque",
};

/** Days provider has to clear refund debt before auto-block (ignored when REFUND_DEBT_DUE_MINUTES is set). */
const REFUND_DEBT_DUE_DAYS = Number(process.env.REFUND_DEBT_DUE_DAYS) || 30;

/** Optional local-test override — e.g. REFUND_DEBT_DUE_MINUTES=1 */
const REFUND_DEBT_DUE_MINUTES =
  process.env.REFUND_DEBT_DUE_MINUTES != null && process.env.REFUND_DEBT_DUE_MINUTES !== ""
    ? Number(process.env.REFUND_DEBT_DUE_MINUTES)
    : null;

function getRefundDebtDueMs() {
  if (REFUND_DEBT_DUE_MINUTES != null && Number.isFinite(REFUND_DEBT_DUE_MINUTES) && REFUND_DEBT_DUE_MINUTES > 0) {
    return REFUND_DEBT_DUE_MINUTES * 60 * 1000;
  }
  return REFUND_DEBT_DUE_DAYS * 24 * 60 * 60 * 1000;
}

module.exports = {
  PLATFORM_BANK,
  REFUND_DEBT_DUE_DAYS,
  REFUND_DEBT_DUE_MINUTES,
  getRefundDebtDueMs,
};
