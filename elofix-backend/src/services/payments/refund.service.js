const prisma = require("../../config/prisma");
const { getGateway } = require("./gatewayRegistry");
const escrowSettlement = require("./escrowSettlement.service");
const { logAudit } = require("../auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES, ACTOR_TYPES } = require("../../constants/auditActions");
const { roundMoney, EPS } = require("../../utils/refundMath.util");

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
  return {
    supported: true,
    ok,
    status: result.status || (ok ? "COMPLETED" : "FAILED"),
    requiresManualAction: Boolean(result.requiresManualAction),
    message: result.message || null,
    externalRefundId: result.externalRefundId || null,
    data: result.data,
  };
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
      const newRefunded = roundMoney((Number(intent.refundedAmount) || 0) + refundAmt);
      const fullyRefunded = newRefunded >= roundMoney(Number(intent.amount)) - EPS;
      await prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          state: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
          refundedAmount: newRefunded,
          refundedAt: fullyRefunded ? new Date() : intent.refundedAt || new Date(),
          gatewayPayload: {
            ...(intent.gatewayPayload && typeof intent.gatewayPayload === "object"
              ? intent.gatewayPayload
              : {}),
            lastRefund: {
              amount: refundAmt,
              at: new Date().toISOString(),
              externalRefundId: result.externalRefundId,
              idempotencyKey: opts.idempotencyKey || null,
            },
          },
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
          idempotencyKey: opts.idempotencyKey || null,
        },
      });
      if (intent.kind === "LABOR" && intent.jobId) {
        await escrowSettlement.markLaborIntentRefunded(intent.jobId);
      }
      if (intent.materialOrderId) {
        await escrowSettlement.markMaterialIntentRefunded(intent.materialOrderId, Boolean(amount));
      }
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
        supported: true,
        requiresManualAction: Boolean(result.requiresManualAction),
        results,
        refundedTotal: roundMoney(target - left),
        remaining: left,
        originalPaymentIntentIds,
        message: result.message || "gateway_refund_failed",
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
};
