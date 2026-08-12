const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const AppError = require("../../utils/AppError");
const { mutateJobMetaInTransaction, getJobMeta, normalizeMeta } = require("../jobMeta.service");
const { splitCommission } = require("./money.util");
const paymentModeService = require("./paymentMode.service");
const { paymentCurrency } = require("./paymentConfig");

const { PAYMENT_TYPES, PAYMENT_MODES } = paymentModeService;

function toAmountDecimal(amount) {
  return new Prisma.Decimal(String(Number(amount).toFixed(2)));
}

function providerChannel(provider) {
  return String(provider || "").toLowerCase();
}

/**
 * Immediate-settlement labor path: record commission/share on the intent, update job progress.
 * Does NOT create escrow holds or withdrawable Earning credits (decision 1B).
 *
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 */
async function settleLaborTransactionInTx(
  tx,
  {
    job,
    jobId,
    intent,
    customerUserId,
    gross,
    paymentRef,
    paidAt,
    cardLast4,
    channel,
    paymentType,
  }
) {
  const type = String(paymentType || intent.paymentType || "");
  if (!type) throw new AppError("paymentType is required for labor settlement", 400);

  const expected = paymentModeService.expectedAmountForLaborPaymentType(job, type);
  paymentModeService.assertAmountMatchesExpected(gross, expected);

  const split = splitCommission(gross);
  const t = split.grossAmount;

  // Idempotent: already have ledger for this intent
  const existingLedger = await tx.commissionLedger.findFirst({
    where: { paymentIntentId: intent.id },
  });
  if (!existingLedger) {
    await tx.commissionLedger.create({
      data: {
        id: randomUUID(),
        jobId,
        paymentIntentId: intent.id,
        amount: split.commissionAmount,
        source: `labor_${type.toLowerCase()}`,
        totalPrice: t,
        currency: paymentCurrency(),
      },
    });
  }

  await tx.paymentIntent.update({
    where: { id: intent.id },
    data: {
      commissionAmount: split.commissionAmount,
      recipientAmount: split.recipientAmount,
      recipientUserId: job.providerId || null,
      escrowStatus: "NOT_APPLICABLE",
      providerPayoutStatus: "COMPLETE",
      paymentType: type,
    },
  });

  paymentModeService.assertPaymentModeReady(job);
  const mode = String(job.paymentModeSnapshot);
  const isDeposit = type === PAYMENT_TYPES.DEPOSIT;
  const isCompletionPay =
    type === PAYMENT_TYPES.COMPLETION || type === PAYMENT_TYPES.FULL_COMPLETION;
  const isFullUpfront = type === PAYMENT_TYPES.FULL_UPFRONT;

  let nextProgress = job.paymentProgress || "NONE";
  let statusOverride = "SERVICE_PAID";
  let markCompleted = false;
  let laborPaid = true;

  if (mode === PAYMENT_MODES.TWO_PAYMENT_50_50) {
    if (isDeposit) {
      nextProgress = "FIRST_PAID";
      statusOverride = "SERVICE_PAID";
    } else if (type === PAYMENT_TYPES.COMPLETION) {
      nextProgress = "FULLY_PAID";
      statusOverride = "COMPLETED";
      markCompleted = true;
    }
  } else if (mode === PAYMENT_MODES.SINGLE_PAYMENT_UPFRONT && isFullUpfront) {
    nextProgress = "FULLY_PAID";
    statusOverride = "SERVICE_PAID";
  } else if (mode === PAYMENT_MODES.SINGLE_PAYMENT_ON_COMPLETION && type === PAYMENT_TYPES.FULL_COMPLETION) {
    nextProgress = "FULLY_PAID";
    statusOverride = "COMPLETED";
    markCompleted = true;
  }

  const jobStatus = job.status;
  const statusPatch = {
    laborPaid,
    paymentProgress: nextProgress,
    totalPrice: job.quotedAmount != null ? job.quotedAmount : t,
  };

  // Accumulate commission / provider share across transactions
  const prevCommission = toAmountDecimal(job.commissionAmount || 0);
  const prevProvider = toAmountDecimal(job.providerAmount || 0);
  statusPatch.commissionAmount = prevCommission.add(split.commissionAmount);
  statusPatch.providerAmount = prevProvider.add(split.recipientAmount);
  // Immediate settlement: releasedAmount tracks accounted recipient share (not escrow)
  statusPatch.releasedAmount = statusPatch.providerAmount;
  statusPatch.isFullyReleased = nextProgress === "FULLY_PAID";
  statusPatch.paymentReleased = nextProgress === "FULLY_PAID";
  statusPatch.escrowSecondReleaseDone = nextProgress === "FULLY_PAID";

  if (jobStatus === "ACCEPTED" || jobStatus === "PENDING") {
    statusPatch.status = markCompleted ? "COMPLETED" : "IN_PROGRESS";
  } else if (markCompleted) {
    statusPatch.status = "COMPLETED";
  }

  const jobProgressUtil = require("../../utils/jobProgress.util");
  const jobForProgress = {
    ...job,
    laborPaid: true,
    status: statusPatch.status || job.status,
  };

  const paymentsMetaKey = isDeposit ? "depositPayment" : isCompletionPay ? "completionPayment" : "servicePayment";

  const meta = await mutateJobMetaInTransaction(tx, jobId, (m) => {
    const paymentRecord = {
      status: "paid",
      amount: Number(t),
      commissionAmount: Number(split.commissionAmount),
      recipientAmount: Number(split.recipientAmount),
      paymentType: type,
      paidAt,
      paymentRef,
      paidBy: customerUserId,
      channel: String(channel),
      maskedPaymentMethod: `**** **** **** ${cardLast4 || "****"}`,
      intentId: intent.id,
    };
    const next = {
      ...m,
      hasStarted: true,
      laborPaid: true,
      [paymentsMetaKey]: paymentRecord,
      // Keep servicePayment for backward-compatible UI (first or only labor pay)
      servicePayment:
        isDeposit || isFullUpfront || (!m.servicePayment && !isCompletionPay)
          ? paymentRecord
          : m.servicePayment || paymentRecord,
      statusOverride,
      // Clear escrow holds for new model
      escrow: { heldAmount: 0, releasedAmount: Number(statusPatch.providerAmount) },
      ...(isDeposit ? { _notifyDepositPaid: true } : {}),
      ...(isCompletionPay ? { completionPaymentDue: null } : {}),
    };
    if (markCompleted) {
      next.completedAt = paidAt;
    }
    next.progressStep = jobProgressUtil.nextMonotonicProgressStep(next, jobForProgress);
    return next;
  });

  const jobRow = await tx.job.update({
    where: { id: jobId },
    data: statusPatch,
  });

  return {
    jobRow,
    meta,
    commissionAmount: split.commissionAmount,
    providerAmount: split.recipientAmount,
    paymentType: type,
    nextProgress,
    notifyDepositPaid: isDeposit,
  };
}

/**
 * Settle labor from a paid PaymentIntent (new immediate-settlement or route to legacy escrow).
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 */
async function settleLaborFromIntent(tx, intent, gatewayPayload) {
  const paymentService = require("../payment.service");
  const jobId = intent.jobId;
  if (!jobId) {
    throw new AppError("Labor payment requires jobId", 400);
  }
  let job = await tx.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new AppError("Job not found", 404);
  }
  if (!job.providerId) {
    throw new AppError("Job has no provider", 400);
  }

  const metaForGate = await getJobMeta(jobId);
  const disputedOrFrozen =
    metaForGate.statusOverride === "DISPUTED" || metaForGate.escrowFrozen === true;
  const intentPaymentType = String(intent.paymentType || "").toUpperCase();
  if (
    disputedOrFrozen &&
    (intentPaymentType === "COMPLETION" || intentPaymentType === "FULL_COMPLETION")
  ) {
    throw new AppError(
      "Cannot settle completion payment while this job is under dispute review",
      400
    );
  }
  if (String(intent.state || "").toUpperCase() === "DISPUTED" || String(intent.state || "").toUpperCase() === "CANCELLED") {
    throw new AppError("This payment intent can no longer be settled", 400);
  }

  // Ensure snapshot exists before settling (lazy snapshot for non-legacy only).
  // Only use authoritative job quote fields — never intent.amount (fail closed).
  if (!job.paymentModeSnapshot && !job.legacyEscrowV2) {
    const metaPeek = await getJobMeta(jobId);
    const quoted =
      (metaPeek?.servicePrice && Number(metaPeek.servicePrice.amount)) ||
      Number(job.quotedAmount || job.totalPrice || job.price || 0);
    if (quoted > 0) {
      try {
        await paymentModeService.snapshotPaymentModeOnJob(tx, jobId, {
          quotedAmount: quoted,
          categoryKey: job.category,
        });
        job = await tx.job.findUnique({ where: { id: jobId } });
      } catch (_) {
        // Fall through to assertPaymentModeReady (409) — never legacy escrow.
      }
    }
  }

  // Legacy escrow path: ONLY when explicitly marked legacyEscrowV2.
  if (job.legacyEscrowV2 === true) {
    if (job.laborPaid) {
      return { alreadySettled: true, job };
    }
    return settleLaborLegacyEscrow(tx, intent, gatewayPayload, job);
  }

  // Non-legacy without snapshot after attempt → configuration error (never fall back to escrow).
  paymentModeService.assertPaymentModeReady(job);

  const paymentType =
    intent.paymentType ||
    paymentModeService.resolveNextLaborPaymentType(job, await getJobMeta(jobId));
  if (!paymentType) {
    throw new AppError("No labor payment is due for this job at this stage", 400);
  }

  // New multi-transaction: allow second payment when FIRST_PAID
  if (paymentType === PAYMENT_TYPES.DEPOSIT || paymentType === PAYMENT_TYPES.FULL_UPFRONT) {
    if (job.laborPaid && String(job.paymentProgress) !== "NONE") {
      // Deposit/upfront already done
      const existingPaid = await tx.paymentIntent.findFirst({
        where: { jobId, kind: "LABOR", paymentType, state: "PAID", id: { not: intent.id } },
      });
      if (existingPaid || job.paymentProgress === "FIRST_PAID" || job.paymentProgress === "FULLY_PAID") {
        return { alreadySettled: true, job };
      }
    }
  }
  if (paymentType === PAYMENT_TYPES.COMPLETION || paymentType === PAYMENT_TYPES.FULL_COMPLETION) {
    if (String(job.paymentProgress) === "FULLY_PAID") {
      return { alreadySettled: true, job };
    }
  }

  const paidAt = new Date().toISOString();
  const last4 = String(gatewayPayload?.card_last4 || gatewayPayload?.last4 || "****");
  const gross = toAmountDecimal(intent.amount);

  const result = await settleLaborTransactionInTx(tx, {
    job,
    jobId,
    intent,
    customerUserId: intent.userId,
    gross,
    paymentRef: intent.merchantReference,
    paidAt,
    cardLast4: last4,
    channel: providerChannel(intent.provider),
    paymentType,
  });

  console.log("[settleLaborFromIntent] settled", {
    jobId,
    intentId: intent.id,
    paymentType,
    amount: Number(intent.amount),
    paymentProgress: result.nextProgress,
    merchantReference: intent.merchantReference,
    provider: intent.provider,
    gatewayTransactionId: intent.gatewayTransactionId || null,
  });

  return {
    alreadySettled: false,
    job: result.jobRow,
    notifyDepositPaid: Boolean(result.notifyDepositPaid),
    settledAudit: {
      intentId: intent.id,
      userId: intent.userId,
      jobId,
      amount: Number(intent.amount),
      paymentType,
    },
  };
}

async function settleLaborLegacyEscrow(tx, intent, gatewayPayload, job) {
  if (job.legacyEscrowV2 !== true) {
    throw new AppError(
      "Legacy escrow settlement is only available for jobs with legacyEscrowV2 enabled",
      400
    );
  }
  const paymentService = require("../payment.service");
  const jobId = job.id;
  if (job.laborPaid) {
    return { alreadySettled: true, job };
  }
  const prov = await tx.provider.findUnique({ where: { userId: job.providerId }, select: { id: true } });
  if (!prov) {
    throw new AppError("Provider profile not found", 404);
  }

  const meta = await getJobMeta(jobId);
  const expected = paymentService.expectedLaborGrossFromJob(job, meta);
  const gross = toAmountDecimal(intent.amount);
  const diff = gross.sub(expected).abs();
  if (diff.gt(0.02)) {
    throw new AppError("Paid amount does not match job price", 400);
  }

  const paidAt = new Date().toISOString();
  const last4 = String(gatewayPayload?.card_last4 || gatewayPayload?.last4 || "****");
  const split = splitCommission(gross);

  await paymentService.runSettleLaborInTransaction(tx, {
    job,
    jobId,
    customerUserId: intent.userId,
    providerProfileId: prov.id,
    gross,
    paymentRef: intent.merchantReference,
    paidAt,
    cardLast4: last4,
    idempotencyKeyForEarnings: intent.idempotencyKey ? `${intent.idempotencyKey}::t1` : `intent-${intent.id}`,
    channel: providerChannel(intent.provider),
  });

  await tx.paymentIntent.update({
    where: { id: intent.id },
    data: {
      escrowStatus: "PARTIALLY_RELEASED",
      providerPayoutStatus: "PARTIAL",
      paymentType: PAYMENT_TYPES.FULL_UPFRONT,
      commissionAmount: split.commissionAmount,
      recipientAmount: split.recipientAmount,
      recipientUserId: job.providerId,
    },
  });

  // Link commission ledger to intent if possible
  await tx.commissionLedger.updateMany({
    where: { jobId, paymentIntentId: null },
    data: { paymentIntentId: intent.id },
  });

  const updated = await tx.job.findUnique({ where: { id: jobId } });
  return {
    alreadySettled: false,
    job: updated,
    settledAudit: { intentId: intent.id, userId: intent.userId, jobId, amount: Number(intent.amount) },
  };
}

/**
 * Record commission/share on material/store/delivery intents (no wallet credits).
 */
async function stampIntentCommission(tx, intent, grossMajor, recipientUserId = null) {
  const split = splitCommission(grossMajor);
  await tx.paymentIntent.update({
    where: { id: intent.id },
    data: {
      commissionAmount: split.commissionAmount,
      recipientAmount: split.recipientAmount,
      recipientUserId: recipientUserId || null,
      escrowStatus: "NOT_APPLICABLE",
      providerPayoutStatus: "COMPLETE",
    },
  });
  return split;
}

module.exports = {
  settleLaborFromIntent,
  settleLaborTransactionInTx,
  settleLaborLegacyEscrow,
  stampIntentCommission,
  normalizeMeta,
};
