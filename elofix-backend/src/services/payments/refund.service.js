const prisma = require("../../config/prisma");
const { getGateway } = require("./gatewayRegistry");
const escrowSettlement = require("./escrowSettlement.service");
const { logAudit } = require("../auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES, ACTOR_TYPES } = require("../../constants/auditActions");
const { roundMoney, EPS, isAsyncPendingGatewayRefund } = require("../../utils/refundMath.util");
const { emitDomainUpdate } = require("../../utils/realtimeEmitter");
const { isActivePendingRefundStatus } = require("./paystack.payload");
const { toCents } = require("./money.util");

const refundFinalizationTestHooks = {
  afterApplyIntentRefundMoney: null,
};

function setRefundFinalizationTestHook(name, fn) {
  refundFinalizationTestHooks[name] = typeof fn === "function" ? fn : null;
}

const REFUNDABLE_STATES = new Set(["PAID", "PARTIALLY_REFUNDED", "DISPUTED"]);

/**
 * Normalize adapter refund() results into a stable EloFix shape.
 */
function normalizeGatewayRefundResult(result) {
  if (!result || typeof result !== "object") {
    return {
      supported: false,
      ok: false,
      status: "FAILED",
      requiresManualAction: true,
      message: "empty_gateway_result",
    };
  }
  if (result.supported === false) {
    return {
      supported: false,
      ok: false,
      status: result.status || "MANUAL_REQUIRED",
      requiresManualAction: true,
      message: result.message || "refund_not_supported",
      externalRefundId: result.externalRefundId || null,
      data: result.data,
    };
  }
  const ok = Boolean(result.ok);
  const pending = isAsyncPendingGatewayRefund(result);
  return {
    supported: true,
    ok,
    pending,
    status: result.status || (ok ? "COMPLETED" : pending ? "PENDING" : "FAILED"),
    requiresManualAction: Boolean(result.requiresManualAction),
    message: result.message || null,
    externalRefundId: result.externalRefundId || null,
    data: result.data,
  };
}

function intentPayload(intent) {
  return intent?.gatewayPayload && typeof intent.gatewayPayload === "object" && !Array.isArray(intent.gatewayPayload)
    ? { ...intent.gatewayPayload }
    : {};
}

function readPendingRefund(intent) {
  const pending = intentPayload(intent).pendingRefund;
  if (!pending || typeof pending !== "object" || Array.isArray(pending)) return null;
  if (!isActivePendingRefundStatus(pending.status)) return null;
  return pending;
}

function buildPendingRefundRecord(result, amount, idempotencyKey, previous) {
  return {
    externalRefundId: result.externalRefundId || previous?.externalRefundId || null,
    requestedAmount: roundMoney(amount),
    status: result.status || "PENDING",
    requestedAt: previous?.requestedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    idempotencyKey: idempotencyKey || previous?.idempotencyKey || null,
  };
}

async function persistPendingRefund(intent, result, amount, idempotencyKey) {
  const payload = intentPayload(intent);
  payload.pendingRefund = buildPendingRefundRecord(result, amount, idempotencyKey, payload.pendingRefund);
  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { gatewayPayload: payload },
  });
  return payload.pendingRefund;
}

async function updatePendingRefundStatus(intent, status, extra = {}) {
  const payload = intentPayload(intent);
  const prev = payload.pendingRefund && typeof payload.pendingRefund === "object" ? payload.pendingRefund : {};
  const nextStatus = String(status || "").toUpperCase();
  if (nextStatus === "FAILED") {
    payload.lastRefundAttempt = {
      ...prev,
      status: "FAILED",
      failedAt: new Date().toISOString(),
      ...extra,
    };
    delete payload.pendingRefund;
  } else {
    payload.pendingRefund = {
      ...prev,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
      ...extra,
    };
  }
  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { gatewayPayload: payload },
  });
  return payload.pendingRefund || null;
}

async function emitRefundDomainUpdate(intent) {
  try {
    const refundJobId = intent.jobId || null;
    if (!refundJobId) return;
    const refundJob = await prisma.job.findUnique({
      where: { id: refundJobId },
      select: { customerId: true },
    });
    if (refundJob?.customerId) {
      emitDomainUpdate({
        domain: "refund",
        action: "updated",
        jobId: refundJobId,
        entityId: intent.id,
        userIds: [refundJob.customerId],
      });
    }
  } catch (emitErr) {
    console.error("[refund.service] emitDomainUpdate error:", emitErr?.message || emitErr);
  }
}

function refundFinalizationKey(externalRefundId, idempotencyKey) {
  if (externalRefundId) return `paystack-refund:${String(externalRefundId)}`;
  if (idempotencyKey) return `paystack-refund-key:${String(idempotencyKey)}`;
  return null;
}

function finalizedRefundIds(intent) {
  const payload = intentPayload(intent);
  return Array.isArray(payload.finalizedRefundIds) ? payload.finalizedRefundIds.map(String) : [];
}

function isRefundAlreadyFinalized(intent, externalRefundIdOrOpts, maybeKey) {
  const opts =
    externalRefundIdOrOpts && typeof externalRefundIdOrOpts === "object"
      ? externalRefundIdOrOpts
      : { externalRefundId: externalRefundIdOrOpts, idempotencyKey: maybeKey };
  const externalRefundId = opts.externalRefundId != null ? String(opts.externalRefundId) : null;
  const idempotencyKey = opts.idempotencyKey || null;
  const payload = intentPayload(intent);
  const last = payload.lastRefund && typeof payload.lastRefund === "object" ? payload.lastRefund : {};
  const ids = finalizedRefundIds(intent);
  if (externalRefundId && ids.includes(externalRefundId)) return true;
  const key = refundFinalizationKey(externalRefundId, idempotencyKey);
  if (last.finalized) {
    if (externalRefundId && String(last.externalRefundId) === externalRefundId) return true;
    if (key && last.finalizationKey && String(last.finalizationKey) === key) return true;
    if (idempotencyKey && last.idempotencyKey && String(last.idempotencyKey) === String(idempotencyKey)) {
      return true;
    }
  }
  return false;
}

function webhookRefundIdFromSanitized(sanitized) {
  if (!sanitized || typeof sanitized !== "object") return null;
  if (sanitized.id != null && String(sanitized.id).trim()) return String(sanitized.id).trim();
  if (sanitized.refund_reference && String(sanitized.refund_reference).trim()) {
    return String(sanitized.refund_reference).trim();
  }
  return null;
}

function storedPendingRefundId(intent) {
  const pending = readPendingRefund(intent);
  if (pending?.externalRefundId) return String(pending.externalRefundId);
  return null;
}

function lastRefundRecord(intent) {
  const last = intentPayload(intent).lastRefund;
  return last && typeof last === "object" && !Array.isArray(last) ? last : null;
}

function lastRefundAttemptRecord(intent) {
  const last = intentPayload(intent).lastRefundAttempt;
  return last && typeof last === "object" && !Array.isArray(last) ? last : null;
}

/**
 * Safe finalized-slice metadata for crash/retry resume.
 * Never guesses from PaymentIntent.amount.
 */
function readFinalizedRefund(intent, externalRefundId) {
  const last = lastRefundRecord(intent);
  if (!last || last.finalized !== true) return null;
  const lastId = last.externalRefundId != null ? String(last.externalRefundId) : null;
  const wantId = externalRefundId != null && String(externalRefundId).trim() ? String(externalRefundId).trim() : null;
  if (wantId && lastId && wantId !== lastId) return null;
  if (wantId && !lastId && !finalizedRefundIds(intent).includes(wantId)) return null;
  if (last.amount == null || !Number.isFinite(Number(last.amount))) return null;
  return {
    externalRefundId: lastId || wantId,
    amount: roundMoney(Number(last.amount)),
    idempotencyKey: last.idempotencyKey || null,
    finalizationKey: last.finalizationKey || null,
    finalized: true,
  };
}

function amountCentsMatchesMajor(amountCents, major) {
  if (amountCents == null || major == null || !Number.isFinite(Number(major))) return null;
  if (!Number.isFinite(Number(amountCents))) return null;
  return Math.round(Number(amountCents)) === toCents(major);
}

/**
 * Resolve the Paystack refund identity for a webhook.
 * Webhook id/reference wins only when it does not contradict the stored pending id.
 * Missing webhook id may fall back to pending, lastRefund, or lastRefundAttempt
 * only when that identity is unambiguous for this PaymentIntent.
 */
function resolveEffectiveRefundId(intent, webhookRefundId, opts = {}) {
  const event = String(opts.event || "").trim().toLowerCase();
  const webhookAmountCents = opts.webhookAmountCents;
  const hookId = webhookRefundId ? String(webhookRefundId).trim() : "";
  const pending = readPendingRefund(intent);
  const storedId = pending?.externalRefundId ? String(pending.externalRefundId) : null;
  const last = lastRefundRecord(intent);
  const lastId = last?.externalRefundId ? String(last.externalRefundId) : null;
  const lastAttempt = lastRefundAttemptRecord(intent);
  const lastAttemptId = lastAttempt?.externalRefundId ? String(lastAttempt.externalRefundId) : null;
  const ids = finalizedRefundIds(intent);

  if (hookId && storedId && hookId !== storedId) {
    if (ids.includes(hookId) || (lastId && hookId === lastId)) {
      return {
        effectiveRefundId: hookId,
        alreadyFinalized: true,
        mismatch: false,
        historical: true,
        source: "webhook_finalized",
      };
    }
    if (lastAttemptId && hookId === lastAttemptId) {
      return {
        effectiveRefundId: hookId,
        alreadyFinalized: true,
        mismatch: false,
        historical: true,
        source: "webhook_lastRefundAttempt",
      };
    }
    return { effectiveRefundId: null, alreadyFinalized: false, mismatch: true, source: "contradiction" };
  }

  if (hookId) {
    const historical = Boolean(
      ids.includes(hookId) ||
        (lastId && hookId === lastId) ||
        (lastAttemptId && hookId === lastAttemptId)
    );
    return {
      effectiveRefundId: hookId,
      alreadyFinalized:
        historical || isRefundAlreadyFinalized(intent, { externalRefundId: hookId }),
      mismatch: false,
      historical,
      source: "webhook",
    };
  }

  if (event === "refund.failed") {
    if (storedId && !lastAttemptId) {
      return { effectiveRefundId: storedId, alreadyFinalized: false, mismatch: false, source: "pending" };
    }
    if (!storedId && lastAttemptId) {
      if (
        webhookAmountCents != null &&
        amountCentsMatchesMajor(webhookAmountCents, lastAttempt.requestedAmount) === false
      ) {
        return {
          effectiveRefundId: null,
          alreadyFinalized: false,
          mismatch: false,
          ambiguous: true,
          source: "lastRefundAttempt_amount_mismatch",
        };
      }
      return {
        effectiveRefundId: lastAttemptId,
        alreadyFinalized: true,
        mismatch: false,
        historical: true,
        source: "lastRefundAttempt",
      };
    }
    if (storedId && lastAttemptId) {
      const attemptMatch = amountCentsMatchesMajor(webhookAmountCents, lastAttempt.requestedAmount);
      const pendingMatch = amountCentsMatchesMajor(webhookAmountCents, pending?.requestedAmount);
      if (attemptMatch === true && pendingMatch !== true) {
        return {
          effectiveRefundId: lastAttemptId,
          alreadyFinalized: true,
          mismatch: false,
          historical: true,
          source: "lastRefundAttempt_amount",
        };
      }
      if (pendingMatch === true && attemptMatch !== true) {
        return { effectiveRefundId: storedId, alreadyFinalized: false, mismatch: false, source: "pending_amount" };
      }
      return {
        effectiveRefundId: null,
        alreadyFinalized: false,
        mismatch: false,
        ambiguous: true,
        source: "ambiguous_pending_and_lastRefundAttempt",
      };
    }
    return { effectiveRefundId: null, alreadyFinalized: false, mismatch: false, source: "none" };
  }

  if (storedId && !lastId) {
    return { effectiveRefundId: storedId, alreadyFinalized: false, mismatch: false, source: "pending" };
  }

  if (!storedId && lastId) {
    if (webhookAmountCents != null && amountCentsMatchesMajor(webhookAmountCents, last.amount) === false) {
      return {
        effectiveRefundId: null,
        alreadyFinalized: false,
        mismatch: false,
        ambiguous: true,
        source: "lastRefund_amount_mismatch",
      };
    }
    return {
      effectiveRefundId: lastId,
      alreadyFinalized: true,
      mismatch: false,
      source: "lastRefund",
    };
  }

  if (storedId && lastId) {
    const lastMatch = amountCentsMatchesMajor(webhookAmountCents, last.amount);
    const pendingMatch = amountCentsMatchesMajor(webhookAmountCents, pending?.requestedAmount);
    if (lastMatch === true && pendingMatch !== true) {
      return { effectiveRefundId: lastId, alreadyFinalized: true, mismatch: false, source: "lastRefund_amount" };
    }
    if (pendingMatch === true && lastMatch !== true) {
      return { effectiveRefundId: storedId, alreadyFinalized: false, mismatch: false, source: "pending_amount" };
    }
    return {
      effectiveRefundId: null,
      alreadyFinalized: false,
      mismatch: false,
      ambiguous: true,
      source: "ambiguous_pending_and_last",
    };
  }

  return { effectiveRefundId: null, alreadyFinalized: false, mismatch: false, source: "none" };
}

function refundWebhookEventId(effectiveRefundId, event) {
  return `paystack-refund:${String(effectiveRefundId)}:${String(event || "event")}`;
}

async function applyIntentRefundMoney(intent, refundAmt, result, idempotencyKey) {
  const externalRefundId = result?.externalRefundId || null;
  if (isRefundAlreadyFinalized(intent, { externalRefundId, idempotencyKey })) {
    return { alreadyFinalized: true, refundAmt, intent };
  }
  const newRefunded = roundMoney((Number(intent.refundedAmount) || 0) + refundAmt);
  const fullyRefunded = newRefunded >= roundMoney(Number(intent.amount)) - EPS;
  const payload = intentPayload(intent);
  const pendingOnIntent =
    payload.pendingRefund && typeof payload.pendingRefund === "object" ? payload.pendingRefund : null;
  const pendingMatchesThisRefund = Boolean(
    pendingOnIntent?.externalRefundId &&
      externalRefundId &&
      String(pendingOnIntent.externalRefundId) === String(externalRefundId)
  );
  if (!pendingOnIntent || pendingMatchesThisRefund) {
    delete payload.pendingRefund;
  }
  const key = refundFinalizationKey(externalRefundId, idempotencyKey);
  const ids = finalizedRefundIds(intent);
  if (externalRefundId && !ids.includes(String(externalRefundId))) {
    ids.push(String(externalRefundId));
  }
  payload.finalizedRefundIds = ids;
  payload.lastRefund = {
    amount: refundAmt,
    at: new Date().toISOString(),
    externalRefundId,
    idempotencyKey: idempotencyKey || null,
    finalizationKey: key,
    finalized: true,
  };
  const updated = await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: {
      state: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
      refundedAmount: newRefunded,
      refundedAt: fullyRefunded ? new Date() : intent.refundedAt || new Date(),
      gatewayPayload: payload,
      ...(intent.kind === "LABOR" ? { escrowStatus: "REFUNDED" } : {}),
    },
  });
  await logAudit(AUDIT_ACTIONS.PAYMENT_REFUND, {
    entityType: ENTITY_TYPES.PAYMENT,
    entityId: intent.id,
    actorType: ACTOR_TYPES.SYSTEM,
    newValue: {
      amount: refundAmt,
      kind: intent.kind,
      jobId: intent.jobId,
      materialOrderId: intent.materialOrderId,
      externalRefundId: result.externalRefundId,
      idempotencyKey: idempotencyKey || null,
    },
  });
  if (intent.materialOrderId) {
    await escrowSettlement.markMaterialIntentRefunded(intent.materialOrderId, Boolean(refundAmt));
  }
  await emitRefundDomainUpdate(intent);
  if (typeof refundFinalizationTestHooks.afterApplyIntentRefundMoney === "function") {
    await refundFinalizationTestHooks.afterApplyIntentRefundMoney({
      intent: updated,
      refundAmt,
      externalRefundId,
    });
  }
  return { alreadyFinalized: false, refundAmt, intent: updated };
}

async function hasFinalCustomerRefundInvoice(jobId, externalRefundId) {
  if (!jobId) return false;
  const rows = await prisma.invoice.findMany({ where: { jobId: String(jobId) } });
  return rows.some((row) => {
    const p = row.payload && typeof row.payload === "object" ? row.payload : {};
    if (String(p.type || "") !== "refund") return false;
    if (externalRefundId && p.meta?.externalRefundId && String(p.meta.externalRefundId) === String(externalRefundId)) {
      return true;
    }
    return false;
  });
}

async function jobHasActivePendingRefund(jobId) {
  const intents = await findRefundableLaborIntents(jobId);
  return intents.some((row) => Boolean(readPendingRefund(row)));
}

/**
 * After one Paystack slice processes, start the next FIFO slice only if
 * customer business pending remains and no other slice is already pending.
 */
async function continueFifoRefundIfNeeded(jobId, remainingBusinessAmount) {
  const left = roundMoney(remainingBusinessAmount);
  if (left <= EPS) return { continued: false, reason: "nothing_remaining", established: false };
  if (await jobHasActivePendingRefund(jobId)) {
    return { continued: false, reason: "already_pending", established: true };
  }
  const out = await refundJobLaborAcrossIntents(jobId, left, {
    idempotencyKey: `paystack-fifo-continue:${jobId}:${left.toFixed(2)}`,
  });
  const established = Boolean(
    out.pending ||
      (Array.isArray(out.results) &&
        out.results.some((row) => row.pending && (row.externalRefundId || row.status === "PENDING" || row.status === "NEEDS_ATTENTION")))
  );
  return { ...out, continued: established, established };
}

function classifyFifoContinuation(businessComplete, continued) {
  if (businessComplete) {
    return { needed: false, established: true, retryable: false, reason: null };
  }
  if (!continued) {
    return { needed: true, established: false, retryable: true, reason: "continuation_not_attempted" };
  }
  if (continued.reason === "already_pending") {
    return { needed: true, established: true, retryable: false, reason: "already_pending" };
  }
  if (continued.reason === "nothing_remaining") {
    return { needed: false, established: true, retryable: false, reason: "nothing_remaining" };
  }
  if (continued.established || continued.pending) {
    return { needed: true, established: true, retryable: false, reason: continued.message || "pending" };
  }
  const msg = continued.message || "continuation_failed";
  const nonRetry =
    msg === "no_paid_intent" ||
    msg === "insufficient_paid_tranche" ||
    msg === "manual_action_required" ||
    msg === "zero_amount";
  return { needed: true, established: false, retryable: !nonRetry, reason: msg };
}

async function finalizeJobCustomerRefundArtifacts(intent, refundAmt, externalRefundId) {
  if (!intent.jobId) return { invoiceCreated: false, notified: false, businessComplete: false };
  const paymentService = require("../payment.service");
  const notificationEvents = require("../notificationEvents.service");
  const { mutateJobMetaInTransaction } = require("../jobMeta.service");

  const job = await prisma.job.findUnique({
    where: { id: String(intent.jobId) },
    select: { id: true, customerId: true, meta: true },
  });
  if (!job) return { invoiceCreated: false, notified: false, businessComplete: false };

  const meta = job.meta && typeof job.meta === "object" && !Array.isArray(job.meta) ? job.meta : {};
  const refund = meta.refund && typeof meta.refund === "object" ? meta.refund : {};
  const refsBefore = Array.isArray(refund.gatewayRefundRefs) ? refund.gatewayRefundRefs.map(String) : [];
  const sliceAlreadyApplied = Boolean(externalRefundId && refsBefore.includes(String(externalRefundId)));
  const alreadyCompleted = String(refund.customerRefundStatus || "") === "REFUND_COMPLETED";
  const alreadyNotified = Boolean(refund.customerNotifiedAt) || Boolean(refund.completedAt && alreadyCompleted);

  let invoiceCreated = false;
  if (externalRefundId && !(await hasFinalCustomerRefundInvoice(job.id, externalRefundId))) {
    await paymentService.createRefundInvoiceInTransaction(prisma, {
      userId: job.customerId,
      jobId: job.id,
      laborRefund: refundAmt,
      materialsRefund: 0,
      cardLast4: refund.paymentMethodLast4 || "0000",
      meta: {
        externalRefundId: externalRefundId || null,
        source: "paystack_refund_processed",
        paymentIntentId: intent.id,
      },
    });
    invoiceCreated = true;
  }

  if (!sliceAlreadyApplied && !alreadyCompleted) {
    await prisma.$transaction(async (tx) => {
      await mutateJobMetaInTransaction(tx, job.id, (m) => {
        const current = m.refund && typeof m.refund === "object" ? m.refund : {};
        const prevImmediate = Number(current.immediateRefund) || 0;
        const prevPending = Number(current.pendingRefund) || 0;
        const newPending = Math.max(0, roundMoney(prevPending - refundAmt));
        const businessComplete = newPending <= EPS;
        const refs = Array.isArray(current.gatewayRefundRefs) ? current.gatewayRefundRefs.slice() : [];
        if (externalRefundId && !refs.includes(String(externalRefundId))) {
          refs.push(String(externalRefundId));
        }
        const now = new Date().toISOString();
        return {
          ...m,
          refund: {
            ...current,
            status: businessComplete ? "processed" : "partial",
            customerRefundStatus: businessComplete ? "REFUND_COMPLETED" : "REFUND_PROCESSING",
            immediateRefund: roundMoney(prevImmediate + refundAmt),
            pendingRefund: newPending,
            readyPayoutAmount: businessComplete ? 0 : current.readyPayoutAmount,
            gatewayRefundRefs: refs,
            completedAt: businessComplete ? current.completedAt || now : current.completedAt || null,
            customerNotifiedAt: businessComplete ? current.customerNotifiedAt || now : current.customerNotifiedAt || null,
          },
        };
      });
    });
  }

  const freshJob = await prisma.job.findUnique({
    where: { id: job.id },
    select: { meta: true },
  });
  const freshMeta = freshJob?.meta && typeof freshJob.meta === "object" ? freshJob.meta : {};
  const freshRefund = freshMeta.refund && typeof freshMeta.refund === "object" ? freshMeta.refund : {};
  const remaining = Math.max(0, roundMoney(Number(freshRefund.pendingRefund) || 0));
  const businessComplete = remaining <= EPS;

  let notified = false;
  if (job.customerId && businessComplete && !alreadyNotified) {
    const notifyAmount = Number(freshRefund.immediateRefund) || refundAmt;
    await notificationEvents.notifyCustomerRefundProcessed(job.customerId, job.id, notifyAmount);
    notified = true;
  }

  let continued = null;
  if (!businessComplete) {
    continued = await continueFifoRefundIfNeeded(job.id, remaining);
  }
  const continuation = classifyFifoContinuation(businessComplete, continued);

  if (continuation.needed && !continuation.established) {
    await prisma.$transaction(async (tx) => {
      await mutateJobMetaInTransaction(tx, job.id, (m) => {
        const current = m.refund && typeof m.refund === "object" ? m.refund : {};
        return {
          ...m,
          refund: {
            ...current,
            customerRefundStatus: "REFUND_PROCESSING",
            continuationError: continuation.reason || "continuation_failed",
            continuationRetryable: continuation.retryable,
          },
        };
      });
    });
  } else if (!continuation.needed || continuation.established) {
    await prisma.$transaction(async (tx) => {
      await mutateJobMetaInTransaction(tx, job.id, (m) => {
        const current = m.refund && typeof m.refund === "object" ? m.refund : {};
        if (!current.continuationError) return m;
        const next = { ...current };
        delete next.continuationError;
        delete next.continuationRetryable;
        return { ...m, refund: next };
      });
    });
  }

  return { invoiceCreated, notified, businessComplete, remaining, continued, continuation };
}

/**
 * Shared finalize used by immediate gateway ok and refund.processed webhook.
 * Customer invoice/notification only when finalizeCustomerArtifacts is true.
 */
async function finalizeCustomerGatewayRefund(intent, { amount, externalRefundId, idempotencyKey, finalizeCustomerArtifacts = false } = {}) {
  const recovered = readFinalizedRefund(intent, externalRefundId);
  let refundAmt = amount != null && Number.isFinite(Number(amount)) ? roundMoney(Number(amount)) : null;
  if (refundAmt == null && recovered?.amount != null) refundAmt = recovered.amount;
  if (refundAmt == null) {
    return {
      alreadyFinalized: Boolean(recovered),
      refundAmt: 0,
      amount: 0,
      intentId: intent.id,
      invoiceCreated: false,
      notified: false,
      businessComplete: false,
      continuation: { needed: false, established: false, retryable: false, reason: "missing_slice_amount" },
      failedClosed: true,
    };
  }
  const result = { externalRefundId, ok: true, status: "COMPLETED" };
  const money = await applyIntentRefundMoney(intent, refundAmt, result, idempotencyKey || recovered?.idempotencyKey);
  let artifacts = { invoiceCreated: false, notified: false, continuation: null };
  if (finalizeCustomerArtifacts) {
    const fresh = await prisma.paymentIntent.findUnique({ where: { id: intent.id } });
    artifacts = await finalizeJobCustomerRefundArtifacts(fresh || intent, refundAmt, externalRefundId);
  }
  return { ...money, ...artifacts, amount: refundAmt, intentId: intent.id };
}

/**
 * Paid LABOR intents for a job, oldest first (deposit before completion).
 */
async function findRefundableLaborIntents(jobId) {
  return prisma.paymentIntent.findMany({
    where: {
      jobId: String(jobId),
      kind: "LABOR",
      state: { in: ["PAID", "PARTIALLY_REFUNDED", "DISPUTED"] },
    },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
  });
}

function remainingRefundableOnIntent(intent) {
  const gross = Number(intent.amount) || 0;
  const already = Number(intent.refundedAmount) || 0;
  return roundMoney(Math.max(0, gross - already));
}

/**
 * Request gateway refund when provider supports it (best-effort).
 * Marks intent REFUNDED / PARTIALLY_REFUNDED only when gateway reports success.
 *
 * @param {string} intentId
 * @param {number} [amount]
 * @param {{ idempotencyKey?: string }} [opts]
 */
async function requestGatewayRefund(intentId, amount, opts = {}) {
  const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent || !REFUNDABLE_STATES.has(intent.state)) {
    return normalizeGatewayRefundResult({
      supported: false,
      ok: false,
      status: "FAILED",
      message: "no_paid_intent",
      requiresManualAction: false,
    });
  }

  const remaining = remainingRefundableOnIntent(intent);
  const refundAmt =
    amount != null && Number.isFinite(Number(amount))
      ? roundMoney(Math.min(Number(amount), remaining))
      : remaining;

  if (refundAmt <= EPS) {
    return normalizeGatewayRefundResult({
      supported: true,
      ok: false,
      status: "FAILED",
      message: "nothing_left_to_refund",
    });
  }

  if (!intent.gatewayTransactionId) {
    return normalizeGatewayRefundResult({
      supported: false,
      ok: false,
      status: "MANUAL_REQUIRED",
      requiresManualAction: true,
      message: "missing_gateway_transaction_id",
    });
  }

  const existingPending = readPendingRefund(intent);
  if (existingPending) {
    return {
      ...normalizeGatewayRefundResult({
        supported: true,
        ok: false,
        pending: true,
        status: existingPending.status,
        requiresManualAction: String(existingPending.status || "").toUpperCase() === "NEEDS_ATTENTION",
        externalRefundId: existingPending.externalRefundId,
        message: "paystack_refund_already_pending",
      }),
      amount: existingPending.requestedAmount != null ? Number(existingPending.requestedAmount) : refundAmt,
      intentId: intent.id,
      reusedPending: true,
    };
  }

  const providerKey = intent.provider;
  try {
    const gw = getGateway(providerKey);
    if (!gw.refund) {
      return normalizeGatewayRefundResult({
        supported: false,
        ok: false,
        status: "MANUAL_REQUIRED",
        requiresManualAction: true,
        message: "refund_not_supported",
      });
    }

    const raw = await gw.refund(intent.gatewayTransactionId, refundAmt);
    const result = normalizeGatewayRefundResult(raw);

    if (result.supported && result.ok) {
      await applyIntentRefundMoney(intent, refundAmt, result, opts.idempotencyKey);
    } else if (result.supported && result.pending) {
      await persistPendingRefund(intent, result, refundAmt, opts.idempotencyKey);
    }

    return { ...result, amount: refundAmt, intentId: intent.id };
  } catch (e) {
    return normalizeGatewayRefundResult({
      supported: true,
      ok: false,
      status: "FAILED",
      message: e.message,
    });
  }
}

/**
 * refundOriginalPayment — business-facing wrapper.
 * Refunds against a specific original PaymentIntent / gateway transaction.
 */
async function refundOriginalPayment({ intentId, amount, idempotencyKey } = {}) {
  if (!intentId) {
    return normalizeGatewayRefundResult({
      supported: false,
      ok: false,
      status: "FAILED",
      message: "intentId_required",
    });
  }
  return requestGatewayRefund(intentId, amount, { idempotencyKey });
}

/**
 * Allocate a customer refund amount across paid LABOR intents (FIFO / oldest first).
 * Caps by remaining refundable on each intent (never refunds unpaid completion).
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   supported: boolean,
 *   requiresManualAction: boolean,
 *   results: object[],
 *  refundedTotal: number,
 *   remaining: number,
 *   originalPaymentIntentIds: string[],
 *   message?: string
 * }>}
 */
async function refundJobLaborAcrossIntents(jobId, amount, { idempotencyKey } = {}) {
  const target = roundMoney(amount);
  if (target <= EPS) {
    return {
      ok: true,
      supported: true,
      requiresManualAction: false,
      results: [],
      refundedTotal: 0,
      remaining: 0,
      originalPaymentIntentIds: [],
      message: "zero_amount",
    };
  }

  const intents = await findRefundableLaborIntents(jobId);
  if (!intents.length) {
    return {
      ok: false,
      supported: false,
      requiresManualAction: true,
      results: [],
      refundedTotal: 0,
      remaining: target,
      originalPaymentIntentIds: [],
      message: "no_paid_intent",
    };
  }

  let left = target;
  const results = [];
  const originalPaymentIntentIds = [];

  for (const intent of intents) {
    if (left <= EPS) break;
    const slice = Math.min(left, remainingRefundableOnIntent(intent));
    if (slice <= EPS) continue;

    const key = idempotencyKey
      ? `${idempotencyKey}:${intent.id}:${slice.toFixed(2)}`
      : undefined;
    const result = await refundOriginalPayment({
      intentId: intent.id,
      amount: slice,
      idempotencyKey: key,
    });
    results.push({ intentId: intent.id, amount: slice, ...result });
    originalPaymentIntentIds.push(intent.id);

    if (result.requiresManualAction || result.supported === false) {
      return {
        ok: false,
        supported: false,
        requiresManualAction: true,
        results,
        refundedTotal: roundMoney(target - left),
        remaining: left,
        originalPaymentIntentIds,
        message: result.message || "manual_action_required",
      };
    }

    if (!result.ok) {
      return {
        ok: false,
        pending: Boolean(result.pending),
        supported: true,
        requiresManualAction: Boolean(result.requiresManualAction),
        status: result.status || null,
        results,
        refundedTotal: roundMoney(target - left),
        remaining: left,
        originalPaymentIntentIds,
        message: result.pending
          ? result.message || "paystack_refund_pending"
          : result.message || "gateway_refund_failed",
      };
    }

    left = roundMoney(left - slice);
  }

  return {
    ok: left <= EPS,
    supported: true,
    requiresManualAction: false,
    results,
    refundedTotal: roundMoney(target - left),
    remaining: left,
    originalPaymentIntentIds,
    message: left > EPS ? "insufficient_paid_tranche" : null,
  };
}

module.exports = {
  requestGatewayRefund,
  refundOriginalPayment,
  refundJobLaborAcrossIntents,
  findRefundableLaborIntents,
  normalizeGatewayRefundResult,
  remainingRefundableOnIntent,
  readPendingRefund,
  persistPendingRefund,
  updatePendingRefundStatus,
  finalizeCustomerGatewayRefund,
  applyIntentRefundMoney,
  hasFinalCustomerRefundInvoice,
  isRefundAlreadyFinalized,
  refundFinalizationKey,
  webhookRefundIdFromSanitized,
  resolveEffectiveRefundId,
  refundWebhookEventId,
  continueFifoRefundIfNeeded,
  readFinalizedRefund,
  lastRefundAttemptRecord,
  setRefundFinalizationTestHook,
};
