const { Prisma } = require("@prisma/client");
const prisma = require("../../config/prisma");
const AppError = require("../../utils/AppError");
const { splitFiftyFiftySchedule, splitCommission, toCents } = require("./money.util");

const PAYMENT_MODES = Object.freeze({
  TWO_PAYMENT_50_50: "TWO_PAYMENT_50_50",
  SINGLE_PAYMENT_UPFRONT: "SINGLE_PAYMENT_UPFRONT",
  SINGLE_PAYMENT_ON_COMPLETION: "SINGLE_PAYMENT_ON_COMPLETION",
});

const PAYMENT_TYPES = Object.freeze({
  DEPOSIT: "DEPOSIT",
  COMPLETION: "COMPLETION",
  FULL_UPFRONT: "FULL_UPFRONT",
  FULL_COMPLETION: "FULL_COMPLETION",
  MATERIAL_ORDER: "MATERIAL_ORDER",
  DELIVERY_FEE: "DELIVERY_FEE",
  JOB_STORE_ORDER: "JOB_STORE_ORDER",
});

function isValidPaymentMode(mode) {
  return Object.values(PAYMENT_MODES).includes(String(mode || ""));
}

/**
 * Resolve category payment mode by category id or name (Job.category stores either).
 */
async function resolveCategoryPaymentMode(categoryKey, tx = prisma) {
  const key = String(categoryKey || "").trim();
  if (!key) return PAYMENT_MODES.TWO_PAYMENT_50_50;
  const byId = await tx.category.findUnique({ where: { id: key }, select: { paymentMode: true } });
  if (byId?.paymentMode) return byId.paymentMode;
  const byName = await tx.category.findFirst({
    where: { name: { equals: key, mode: "insensitive" } },
    select: { paymentMode: true },
  });
  return byName?.paymentMode || PAYMENT_MODES.TWO_PAYMENT_50_50;
}

/**
 * Build schedule amounts for a quoted gross under a payment mode.
 */
function computePaymentSchedule(mode, quotedMajor) {
  const m = String(mode || PAYMENT_MODES.TWO_PAYMENT_50_50);
  const quoted = Number(quotedMajor);
  if (!Number.isFinite(quoted) || quoted <= 0) {
    throw new AppError("quotedAmount must be a positive number", 400);
  }

  if (m === PAYMENT_MODES.TWO_PAYMENT_50_50) {
    const schedule = splitFiftyFiftySchedule(quoted);
    return {
      paymentMode: m,
      quotedAmount: schedule.quotedAmount,
      firstPaymentAmount: schedule.firstPaymentAmount,
      secondPaymentAmount: schedule.secondPaymentAmount,
    };
  }

  const full = new Prisma.Decimal(Number(quoted).toFixed(2));
  return {
    paymentMode: m,
    quotedAmount: full,
    firstPaymentAmount: full,
    secondPaymentAmount: null,
  };
}

/**
 * Snapshot payment mode + schedule onto a job (call when quotation/price is accepted).
 * Does not overwrite an existing snapshot unless force=true.
 */
async function snapshotPaymentModeOnJob(tx, jobId, { quotedAmount, categoryKey, force = false } = {}) {
  const job = await tx.job.findUnique({ where: { id: String(jobId) } });
  if (!job) throw new AppError("Job not found", 404);

  if (job.paymentModeSnapshot && !force) {
    return {
      paymentModeSnapshot: job.paymentModeSnapshot,
      quotedAmount: job.quotedAmount,
      firstPaymentAmount: job.firstPaymentAmount,
      secondPaymentAmount: job.secondPaymentAmount,
      paymentProgress: job.paymentProgress,
    };
  }

  const mode = await resolveCategoryPaymentMode(categoryKey || job.category, tx);
  const gross =
    quotedAmount != null
      ? Number(quotedAmount)
      : Number(job.totalPrice || job.price || 0);
  const schedule = computePaymentSchedule(mode, gross);

  const updated = await tx.job.update({
    where: { id: job.id },
    data: {
      paymentModeSnapshot: schedule.paymentMode,
      quotedAmount: schedule.quotedAmount,
      firstPaymentAmount: schedule.firstPaymentAmount,
      secondPaymentAmount: schedule.secondPaymentAmount,
      paymentProgress: job.paymentProgress || "NONE",
    },
  });

  return {
    paymentModeSnapshot: updated.paymentModeSnapshot,
    quotedAmount: updated.quotedAmount,
    firstPaymentAmount: updated.firstPaymentAmount,
    secondPaymentAmount: updated.secondPaymentAmount,
    paymentProgress: updated.paymentProgress,
  };
}

/**
 * Which labor PaymentType is due next for this job (or null if none / wrong stage).
 */
function resolveNextLaborPaymentType(job, meta = {}) {
  if (!job) return null;
  if (job.legacyEscrowV2) return null;

  const mode = String(job.paymentModeSnapshot || "");
  const progress = String(job.paymentProgress || "NONE");
  const statusOverride = String(meta.statusOverride || "").toUpperCase();
  const awaitingCompletion =
    statusOverride === "AWAITING_CONFIRMATION" ||
    statusOverride === "COMPLETION_PAYMENT_REQUIRED" ||
    statusOverride === "COMPLETION_REQUESTED";

  if (mode === PAYMENT_MODES.TWO_PAYMENT_50_50) {
    if (progress === "NONE" || progress === "") return PAYMENT_TYPES.DEPOSIT;
    if (progress === "FIRST_PAID" && awaitingCompletion) return PAYMENT_TYPES.COMPLETION;
    return null;
  }
  if (mode === PAYMENT_MODES.SINGLE_PAYMENT_UPFRONT) {
    if (progress === "NONE" || progress === "") return PAYMENT_TYPES.FULL_UPFRONT;
    return null;
  }
  if (mode === PAYMENT_MODES.SINGLE_PAYMENT_ON_COMPLETION) {
    if ((progress === "NONE" || progress === "") && awaitingCompletion) {
      return PAYMENT_TYPES.FULL_COMPLETION;
    }
    return null;
  }

  // Missing snapshot on non-legacy jobs: fail closed (no FULL_UPFRONT fallback).
  return null;
}

/**
 * Non-legacy jobs must have a paymentModeSnapshot before any payment/settlement.
 * Only jobs with legacyEscrowV2 === true may use the legacy escrow path.
 */
function assertPaymentModeReady(job) {
  if (!job) throw new AppError("Job not found", 404);
  if (job.legacyEscrowV2) return;
  if (!job.paymentModeSnapshot) {
    throw new AppError(
      "Payment schedule is not configured for this job. Provider must submit service price before payment.",
      409
    );
  }
}

/**
 * Expected gross for a labor paymentType from job snapshot.
 */
function expectedAmountForLaborPaymentType(job, paymentType) {
  const type = String(paymentType || "");
  if (type === PAYMENT_TYPES.DEPOSIT || type === PAYMENT_TYPES.FULL_UPFRONT || type === PAYMENT_TYPES.FULL_COMPLETION) {
    const amt = job.firstPaymentAmount != null ? Number(job.firstPaymentAmount) : Number(job.quotedAmount || job.totalPrice || job.price || 0);
    return new Prisma.Decimal(Number(amt).toFixed(2));
  }
  if (type === PAYMENT_TYPES.COMPLETION) {
    const amt = job.secondPaymentAmount != null ? Number(job.secondPaymentAmount) : 0;
    return new Prisma.Decimal(Number(amt).toFixed(2));
  }
  throw new AppError("Invalid labor payment type", 400);
}

/**
 * Map PaymentIntentKind + optional paymentType hint → PaymentType.
 */
function paymentTypeForKind(kind, paymentTypeHint, job) {
  const k = String(kind || "").toUpperCase();
  if (k === "MATERIAL_ORDER") return PAYMENT_TYPES.MATERIAL_ORDER;
  if (k === "JOB_STORE_ORDER") return PAYMENT_TYPES.JOB_STORE_ORDER;
  if (k === "DELIVERY_FEE") return PAYMENT_TYPES.DELIVERY_FEE;
  if (k === "LABOR") {
    if (paymentTypeHint && Object.values(PAYMENT_TYPES).includes(String(paymentTypeHint))) {
      return String(paymentTypeHint);
    }
    const next = resolveNextLaborPaymentType(job, {});
    if (!next) {
      throw new AppError("No labor payment is due for this job at this stage", 400);
    }
    return next;
  }
  throw new AppError("Invalid payment kind", 400);
}

/**
 * Human-readable schedule for API/UI.
 */
function serializePaymentSchedule(job) {
  if (!job) return null;
  const mode = job.paymentModeSnapshot || null;
  if (!mode && job.firstPaymentAmount == null) return null;
  return {
    paymentMode: mode,
    quotedAmount: job.quotedAmount != null ? Number(job.quotedAmount) : null,
    firstPaymentAmount: job.firstPaymentAmount != null ? Number(job.firstPaymentAmount) : null,
    secondPaymentAmount: job.secondPaymentAmount != null ? Number(job.secondPaymentAmount) : null,
    paymentProgress: job.paymentProgress || "NONE",
    legacyEscrowV2: Boolean(job.legacyEscrowV2),
  };
}

function paidTrancheFromMeta(rec, scheduledAmount) {
  const paid = Boolean(rec && String(rec.status || "").toLowerCase() === "paid");
  const scheduled =
    scheduledAmount != null && Number.isFinite(Number(scheduledAmount))
      ? Number(Number(scheduledAmount).toFixed(2))
      : null;
  return {
    amount: scheduled != null ? scheduled : paid ? Number(rec.amount) || 0 : 0,
    status: paid ? "PAID" : "UNPAID",
    paymentIntentId: paid ? rec.intentId || null : null,
    commissionAmount: paid && rec.commissionAmount != null ? Number(rec.commissionAmount) : null,
    providerShare: paid && rec.recipientAmount != null ? Number(rec.recipientAmount) : null,
  };
}

/**
 * Authoritative payment summary for job API / UI (no client recalculation).
 */
function buildPaymentSummary(job, meta = {}) {
  if (!job) return null;
  const mode = job.paymentModeSnapshot || null;
  const progress = String(job.paymentProgress || "NONE");
  const totalAmount = Number(job.quotedAmount != null ? job.quotedAmount : job.totalPrice || job.price || 0);
  const nextLaborPaymentType = job.legacyEscrowV2 ? null : resolveNextLaborPaymentType(job, meta);

  let deposit = null;
  let completion = null;
  if (mode === PAYMENT_MODES.TWO_PAYMENT_50_50) {
    deposit = paidTrancheFromMeta(
      meta.depositPayment || (progress !== "NONE" ? meta.servicePayment : null),
      job.firstPaymentAmount
    );
    completion = paidTrancheFromMeta(meta.completionPayment, job.secondPaymentAmount);
  } else if (mode === PAYMENT_MODES.SINGLE_PAYMENT_UPFRONT) {
    deposit = paidTrancheFromMeta(meta.servicePayment || meta.depositPayment, job.firstPaymentAmount || totalAmount);
    completion = null;
  } else if (mode === PAYMENT_MODES.SINGLE_PAYMENT_ON_COMPLETION) {
    deposit = null;
    completion = paidTrancheFromMeta(
      meta.completionPayment || meta.servicePayment,
      job.firstPaymentAmount || totalAmount
    );
  }

  let totalPaidByCustomer = 0;
  if (deposit && deposit.status === "PAID") totalPaidByCustomer += Number(deposit.amount) || 0;
  if (completion && completion.status === "PAID") totalPaidByCustomer += Number(completion.amount) || 0;
  if (
    totalPaidByCustomer <= 0 &&
    meta.servicePayment &&
    String(meta.servicePayment.status || "").toLowerCase() === "paid"
  ) {
    totalPaidByCustomer = Number(meta.servicePayment.amount) || 0;
  }
  totalPaidByCustomer = Number(totalPaidByCustomer.toFixed(2));
  const totalRemainingByCustomer = Math.max(0, Number((totalAmount - totalPaidByCustomer).toFixed(2)));

  const expectedProviderShare = Number(splitCommission(totalAmount).recipientAmount);
  const providerShareRecorded = Number(
    job.providerAmount != null ? Number(job.providerAmount) : 0
  );
  const providerShareRemaining = Math.max(
    0,
    Number((expectedProviderShare - providerShareRecorded).toFixed(2))
  );
  const commissionRecorded = Number(job.commissionAmount != null ? Number(job.commissionAmount) : 0);

  let label = "NONE";
  if (progress === "FULLY_PAID") label = "FULLY_PAID";
  else if (nextLaborPaymentType === PAYMENT_TYPES.DEPOSIT) label = "DEPOSIT_DUE";
  else if (nextLaborPaymentType === PAYMENT_TYPES.COMPLETION) label = "COMPLETION_DUE";
  else if (nextLaborPaymentType === PAYMENT_TYPES.FULL_UPFRONT) label = "FULL_UPFRONT_DUE";
  else if (nextLaborPaymentType === PAYMENT_TYPES.FULL_COMPLETION) label = "FULL_COMPLETION_DUE";
  else if (progress === "FIRST_PAID") label = "DEPOSIT_PAID";

  return {
    mode,
    totalAmount: Number(totalAmount.toFixed(2)),
    deposit,
    completion,
    totalPaidByCustomer,
    totalRemainingByCustomer,
    providerShareRecorded: Number(providerShareRecorded.toFixed(2)),
    providerShareRemaining,
    commissionRecorded: Number(commissionRecorded.toFixed(2)),
    paymentProgress: progress,
    nextLaborPaymentType,
    label,
  };
}

/**
 * Assert client cannot override amount: compare intent amount to expected (2c tolerance via cents).
 */
function assertAmountMatchesExpected(actualMajor, expectedMajor) {
  const a = toCents(actualMajor);
  const e = toCents(expectedMajor);
  if (Math.abs(a - e) > 2) {
    throw new AppError("Paid amount does not match expected payment for this stage", 400);
  }
}

module.exports = {
  PAYMENT_MODES,
  PAYMENT_TYPES,
  isValidPaymentMode,
  resolveCategoryPaymentMode,
  computePaymentSchedule,
  snapshotPaymentModeOnJob,
  resolveNextLaborPaymentType,
  expectedAmountForLaborPaymentType,
  paymentTypeForKind,
  serializePaymentSchedule,
  buildPaymentSummary,
  assertAmountMatchesExpected,
  assertPaymentModeReady,
  splitCommission,
};
