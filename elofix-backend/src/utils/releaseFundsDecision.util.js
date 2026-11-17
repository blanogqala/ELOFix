const paymentModeService = require("../services/payments/paymentMode.service");

const { PAYMENT_TYPES } = paymentModeService;

function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * RELEASE_FUNDS bills a customer only for a real unpaid completion tranche.
 * Courier and legacy jobs already collected the gross into escrow, so a missing
 * secondPaymentAmount must not be replaced with half of totalPrice.
 *
 * @param {object} job
 * @param {object} meta
 * @param {{ amount?: unknown } | null} paused
 */
function resolveReleaseFundsDecision(job, meta, paused) {
  const safeMeta = meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
  const previewMeta = { ...safeMeta, statusOverride: "AWAITING_CONFIRMATION" };
  const heldEscrow = Boolean(job?.legacyEscrowV2 || safeMeta.courierFlow);
  const dueType = heldEscrow ? null : paymentModeService.resolveNextLaborPaymentType(job, previewMeta);
  const completionDue =
    dueType === PAYMENT_TYPES.COMPLETION || dueType === PAYMENT_TYPES.FULL_COMPLETION;

  if (!completionDue) {
    return {
      amountDue: 0,
      owesCompletion: false,
      releaseHeldEscrow: heldEscrow,
    };
  }

  const raw = paused
    ? Number(paused.amount)
    : Number(paymentModeService.expectedAmountForLaborPaymentType(job, dueType));
  const amountDue = Number.isFinite(raw) ? roundMoney(raw) : 0;
  if (!(amountDue > 0)) {
    return { amountDue: 0, owesCompletion: false, releaseHeldEscrow: heldEscrow };
  }
  return { amountDue, owesCompletion: true, releaseHeldEscrow: false };
}

module.exports = { resolveReleaseFundsDecision };
