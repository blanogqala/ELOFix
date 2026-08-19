/**
 * Shared 30-calendar-day due window for customer labor obligations and
 * provider refund-debt recovery. Minutes override is for local tests only.
 * Env is read at call time so tests can override REFUND_DEBT_DUE_MINUTES.
 */

function resolvePaymentDueDays() {
  return Number(process.env.CUSTOMER_PAYMENT_DUE_DAYS || process.env.REFUND_DEBT_DUE_DAYS) || 30;
}

function resolvePaymentDueMinutes() {
  if (process.env.CUSTOMER_PAYMENT_DUE_MINUTES != null && String(process.env.CUSTOMER_PAYMENT_DUE_MINUTES).trim() !== "") {
    return Number(process.env.CUSTOMER_PAYMENT_DUE_MINUTES);
  }
  if (process.env.REFUND_DEBT_DUE_MINUTES != null && String(process.env.REFUND_DEBT_DUE_MINUTES).trim() !== "") {
    return Number(process.env.REFUND_DEBT_DUE_MINUTES);
  }
  return null;
}

function getPaymentDueMs() {
  const minutes = resolvePaymentDueMinutes();
  if (minutes != null && Number.isFinite(minutes) && minutes > 0) {
    return minutes * 60 * 1000;
  }
  return resolvePaymentDueDays() * 24 * 60 * 60 * 1000;
}

function getPaymentDueAt(from = new Date()) {
  return new Date(from.getTime() + getPaymentDueMs());
}

module.exports = {
  get PAYMENT_DUE_DAYS() {
    return resolvePaymentDueDays();
  },
  get PAYMENT_DUE_MINUTES() {
    return resolvePaymentDueMinutes();
  },
  getPaymentDueMs,
  getPaymentDueAt,
};
