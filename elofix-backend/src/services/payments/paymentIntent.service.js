const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../../config/prisma");
const AppError = require("../../utils/AppError");
const { idempotencyGate, idempotencyCommit } = require("../../utils/idempotencyTransaction");
const paymentService = require("../payment.service");
const { getJobMeta } = require("../jobMeta.service");
const { getGateway, normalizeProvider, listEnabledGateways } = require("./gatewayRegistry");
const {
  paymentCurrency,
  frontendBaseUrl,
  allowAdminPaymentOverride,
  payfastSettleOnReturn,
} = require("./paymentConfig");
const escrowSettlement = require("./escrowSettlement.service");
const { assertCustomerNotBlocked } = require("../accountStatus.service");
const webhookService = require("./webhook.service");
const { logAudit } = require("../auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES, ACTOR_TYPES } = require("../../constants/auditActions");

function serializeIntent(row) {
  if (!row) return null;
  return {
    id: row.id,
    merchantReference: row.merchantReference,
    provider: row.provider,
    kind: row.kind,
    userId: row.userId,
    jobId: row.jobId,
    materialOrderId: row.materialOrderId,
    amount: Number(row.amount),
    currency: row.currency,
    state: row.state,
    escrowStatus: row.escrowStatus,
    providerPayoutStatus: row.providerPayoutStatus,
    gatewayTransactionId: row.gatewayTransactionId,
    returnUrl: row.returnUrl,
    cancelUrl: row.cancelUrl,
    paidAt: row.paidAt,
    failedAt: row.failedAt,
    cancelledAt: row.cancelledAt,
    refundedAt: row.refundedAt,
    disputedAt: row.disputedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    metadata:
      row.gatewayPayload && typeof row.gatewayPayload === "object" ? row.gatewayPayload : null,
  };
}

function toPrismaDecimal(v) {
  return new Prisma.Decimal(String(Number(v).toFixed(2)));
}

async function assertNoDuplicatePaidIntent(tx, { kind, jobId, materialOrderId, metadata }) {
  if (kind === "LABOR" && jobId) {
    const existing = await tx.paymentIntent.findFirst({
      where: { jobId, kind: "LABOR", state: "PAID" },
    });
    if (existing) {
      throw new AppError("Labor payment already completed", 400);
    }
    const pendingPaid = await tx.job.findUnique({ where: { id: jobId }, select: { laborPaid: true } });
    if (pendingPaid?.laborPaid) {
      throw new AppError("Labor already paid", 400);
    }
  }
  if (kind === "DELIVERY_FEE") {
    const deliveryRequestId = metadata?.deliveryRequestId
      ? String(metadata.deliveryRequestId).trim()
      : "";
    if (deliveryRequestId) {
      const dr = await tx.deliveryRequest.findUnique({ where: { id: deliveryRequestId } });
      if (!dr) throw new AppError("Delivery request not found", 404);
      const drPayload = dr.payload && typeof dr.payload === "object" ? dr.payload : {};
      if (String(dr.status) === "paid" || drPayload.payment?.deliveryPaid === true) {
        throw new AppError("Delivery fee already paid", 400);
      }
    }
    if (materialOrderId) {
      const order = await tx.materialOrder.findUnique({ where: { id: materialOrderId } });
      const p = order?.payload && typeof order.payload === "object" ? order.payload : {};
      if (p.payment?.deliveryPaid === true) {
        throw new AppError("Delivery fee already paid", 400);
      }
    }
    return;
  }
  if (materialOrderId) {
    const order = await tx.materialOrder.findUnique({ where: { id: materialOrderId } });
    if (order?.paymentStatus === "paid") {
      throw new AppError("Order already paid", 400);
    }
    // Scope to the same kind so a delivery-fee intent never blocks materials payment
    // (and vice versa) now that multiple intent kinds coexist per material order.
    const existing = await tx.paymentIntent.findFirst({
      where: { materialOrderId, kind, state: "PAID" },
    });
    if (existing) {
      throw new AppError("Payment already completed for this order", 400);
    }
  }
}

async function resolveAmountForKind(tx, { kind, jobId, materialOrderId, amount, metadata }) {
  if (amount != null && Number(amount) > 0) {
    return toPrismaDecimal(amount);
  }
  if (kind === "LABOR" && jobId) {
    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (!job) throw new AppError("Job not found", 404);
    const meta = await getJobMeta(jobId);
    const gross = paymentService.expectedLaborGrossFromJob(job, meta);
    if (gross.lte(0)) throw new AppError("Invalid labor amount", 400);
    return gross;
  }
  if (kind === "DELIVERY_FEE") {
    const deliveryRequestId = metadata?.deliveryRequestId
      ? String(metadata.deliveryRequestId).trim()
      : "";
    if (deliveryRequestId) {
      const dr = await tx.deliveryRequest.findUnique({ where: { id: deliveryRequestId } });
      if (!dr) throw new AppError("Delivery request not found", 404);
      const fee = Number(dr.quotedFee || 0);
      if (fee <= 0) throw new AppError("Invalid delivery fee amount", 400);
      return toPrismaDecimal(fee);
    }
  }
  if ((kind === "MATERIAL_ORDER" || kind === "JOB_STORE_ORDER" || kind === "DELIVERY_FEE") && materialOrderId) {
    const order = await tx.materialOrder.findUnique({ where: { id: materialOrderId } });
    if (!order) throw new AppError("Material order not found", 404);
    const p = order.payload && typeof order.payload === "object" ? order.payload : {};
    const total =
      kind === "DELIVERY_FEE"
        ? Number(p.deliveryFee || p.delivery?.fee || p.deliveryQuote?.fee || 0)
        : Number(p.totalAmount || p.total || order.materialsSubtotal || 0);
    if (total <= 0) throw new AppError("Invalid order amount", 400);
    return toPrismaDecimal(total);
  }
  throw new AppError("amount is required", 400);
}

async function authorizeIntentAccess(intent, userId, role) {
  if (String(role) === "ADMIN") return;
  if (String(intent.userId) !== String(userId)) {
    throw new AppError("Forbidden", 403);
  }
}

async function createPaymentIntent({
  userId,
  role,
  kind,
  jobId,
  materialOrderId,
  amount,
  provider,
  returnUrl,
  cancelUrl,
  metadata,
  idempotencyKey,
  requestHash,
  route,
}) {
  const providerKey = normalizeProvider(provider);
  if (!providerKey) {
    throw new AppError("Invalid payment provider", 400);
  }
  const kindNorm = String(kind || "").toUpperCase();
  const validKinds = ["LABOR", "MATERIAL_ORDER", "JOB_STORE_ORDER", "DELIVERY_FEE"];
  if (!validKinds.includes(kindNorm)) {
    throw new AppError("Invalid payment kind", 400);
  }

  const customerBlockKinds = new Set(["MATERIAL_ORDER", "JOB_STORE_ORDER", "DELIVERY_FEE"]);
  if (customerBlockKinds.has(kindNorm)) {
    const customerRow = await prisma.user.findUnique({
      where: { id: String(userId) },
      select: { blocked: true },
    });
    assertCustomerNotBlocked(customerRow);
  }

  const gw = getGateway(providerKey);

  const txResult = await prisma.$transaction(
    async (tx) => {
      const gate = await idempotencyGate(tx, { idempotencyKey, requestHash, route });
      if (gate.replay) {
        const existing = await tx.paymentIntent.findFirst({
          where: { idempotencyKey: idempotencyKey || "__none__" },
        });
        if (existing) {
          const customer = await tx.user.findUnique({
            where: { id: String(userId) },
            select: { email: true, name: true, phone: true },
          });
          const checkout = await gw.createCheckout(
            {
              ...existing,
              amount: Number(existing.amount),
              returnUrl: existing.returnUrl || `${frontendBaseUrl()}/payments/return?intentId=${existing.id}`,
              cancelUrl: existing.cancelUrl || `${frontendBaseUrl()}/payments/cancel?intentId=${existing.id}`,
            },
            customer
          );
          return {
            replay: true,
            payload: {
              intentId: existing.id,
              merchantReference: existing.merchantReference,
              intent: serializeIntent(existing),
              checkout,
              replay: true,
            },
          };
        }
      }

      if (kindNorm === "LABOR" && jobId) {
        const job = await tx.job.findUnique({ where: { id: jobId } });
        if (!job) throw new AppError("Job not found", 404);
        if (String(job.customerId) !== String(userId)) {
          throw new AppError("Only the customer can pay for this job", 403);
        }
      }
      if (materialOrderId) {
        const order = await tx.materialOrder.findUnique({ where: { id: materialOrderId } });
        if (!order) throw new AppError("Material order not found", 404);
        if (String(order.userId) !== String(userId)) {
          throw new AppError("Forbidden", 403);
        }
      }
      if (kindNorm === "DELIVERY_FEE" && metadata?.deliveryRequestId) {
        const dr = await tx.deliveryRequest.findUnique({
          where: { id: String(metadata.deliveryRequestId) },
        });
        if (!dr) throw new AppError("Delivery request not found", 404);
        if (String(dr.customerId) !== String(userId)) {
          throw new AppError("Forbidden", 403);
        }
        if (String(dr.status) !== "approved") {
          throw new AppError("Delivery must be approved before payment", 400);
        }
        if (jobId && dr.jobId && String(dr.jobId) !== String(jobId)) {
          throw new AppError("Delivery request does not match this job", 400);
        }
      }

      await assertNoDuplicatePaidIntent(tx, { kind: kindNorm, jobId, materialOrderId, metadata });

      const resolvedAmount = await resolveAmountForKind(tx, {
        kind: kindNorm,
        jobId,
        materialOrderId,
        amount,
        metadata,
      });

      const defaultReturn = `${frontendBaseUrl()}/payments/return?intentId=`;
      const defaultCancel = `${frontendBaseUrl()}/payments/cancel?intentId=`;

      const customer = await tx.user.findUnique({
        where: { id: String(userId) },
        select: { email: true, name: true, phone: true },
      });

      // Reuse an existing non-paid DELIVERY_FEE intent for this order instead of
      // creating a duplicate (composite unique on [materialOrderId, kind]).
      // Covers retries after a PENDING/PROCESSING/FAILED/CANCELLED attempt.
      if (kindNorm === "DELIVERY_FEE" && materialOrderId) {
        const reusable = await tx.paymentIntent.findFirst({
          where: {
            materialOrderId,
            kind: "DELIVERY_FEE",
            state: { not: "PAID" },
          },
        });
        if (reusable) {
          const refreshed = await tx.paymentIntent.update({
            where: { id: reusable.id },
            data: {
              provider: providerKey,
              amount: resolvedAmount,
              state: "PENDING",
              failedAt: null,
              cancelledAt: null,
              returnUrl: returnUrl || reusable.returnUrl || null,
              cancelUrl: cancelUrl || reusable.cancelUrl || null,
              gatewayPayload:
                metadata && typeof metadata === "object" ? metadata : reusable.gatewayPayload ?? undefined,
            },
          });

          const reuseCheckout = await gw.createCheckout(
            {
              ...refreshed,
              amount: Number(refreshed.amount),
              returnUrl: refreshed.returnUrl || `${defaultReturn}${refreshed.id}`,
              cancelUrl: refreshed.cancelUrl || `${defaultCancel}${refreshed.id}`,
            },
            customer
          );

          await idempotencyCommit(tx, { idempotencyKey, requestHash, route });

          return {
            replay: false,
            payload: {
              intentId: refreshed.id,
              merchantReference: refreshed.merchantReference,
              intent: serializeIntent(refreshed),
              checkout: reuseCheckout,
              reused: true,
            },
          };
        }
      }

      const merchantReference = `EF-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;

      const intent = await tx.paymentIntent.create({
        data: {
          id: randomUUID(),
          merchantReference,
          provider: providerKey,
          kind: kindNorm,
          userId: String(userId),
          jobId: jobId || null,
          materialOrderId: materialOrderId || null,
          amount: resolvedAmount,
          currency: paymentCurrency(),
          state: "PENDING",
          escrowStatus: kindNorm === "LABOR" ? "HELD" : "NOT_APPLICABLE",
          providerPayoutStatus: kindNorm === "LABOR" ? "NONE" : "NOT_APPLICABLE",
          idempotencyKey: idempotencyKey || null,
          returnUrl: returnUrl || null,
          cancelUrl: cancelUrl || null,
          gatewayPayload: metadata && typeof metadata === "object" ? metadata : undefined,
        },
      });

      const checkout = await gw.createCheckout(
        {
          ...intent,
          amount: Number(intent.amount),
          returnUrl: returnUrl || `${defaultReturn}${intent.id}`,
          cancelUrl: cancelUrl || `${defaultCancel}${intent.id}`,
        },
        customer
      );

      const response = {
        intentId: intent.id,
        merchantReference: intent.merchantReference,
        intent: serializeIntent(intent),
        checkout,
      };

      await idempotencyCommit(tx, { idempotencyKey, requestHash, route });

      return { replay: false, payload: response };
    },
    {
      maxWait: 5000,
      timeout: 20000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );

  return txResult.payload;
}

async function getPaymentIntentById(intentId, userId, role) {
  const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) {
    throw new AppError("Payment intent not found", 404);
  }
  await authorizeIntentAccess(intent, userId, role);
  return serializeIntent(intent);
}

/**
 * Client return URL poll. Production: webhooks settle payment. Sandbox localhost:
 * PayFast cannot POST ITN to localhost — settle when user hits return_url (success only).
 */
async function confirmPaymentReturn(intentId, userId, role) {
  const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) {
    throw new AppError("Payment intent not found", 404);
  }
  await authorizeIntentAccess(intent, userId, role);

  if (
    intent.state !== "PAID" &&
    intent.provider === "PAYFAST" &&
    payfastSettleOnReturn()
  ) {
    const webhookOut = await webhookService.processWebhookResult("PAYFAST", {
      valid: true,
      merchantReference: intent.merchantReference,
      gatewayTransactionId: `sandbox-return-${Date.now()}`,
      state: "PAID",
      amount: Number(intent.amount),
      externalEventId: `sandbox-return-${intent.id}`,
      raw: {
        source: "sandbox_return_url",
        intentId: intent.id,
        card_last4: "4242",
        card_brand: "visa",
      },
    });
    if (webhookOut?.httpStatus && webhookOut.httpStatus >= 400) {
      console.error("[confirmPaymentReturn] sandbox settle failed", {
        intentId: intent.id,
        message: webhookOut.message,
      });
    } else {
      console.log("[confirmPaymentReturn] sandbox settle on return", {
        intentId: intent.id,
        merchantReference: intent.merchantReference,
      });
    }
  } else if (intent.state !== "PAID" && intent.provider === "PAYFAST") {
    console.warn("[confirmPaymentReturn] waiting for ITN webhook", {
      intentId: intent.id,
      state: intent.state,
      payfastMode: process.env.PAYFAST_MODE || "sandbox",
      settleOnReturn: payfastSettleOnReturn(),
    });
  } else if (intent.state === "PENDING" || intent.state === "PROCESSING") {
    await prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { state: "PROCESSING" },
    });
  }

  const fresh = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
  return {
    intent: serializeIntent(fresh),
    message:
      fresh.state === "PAID"
        ? "Payment confirmed"
        : "Payment processing — you will be notified when confirmed",
  };
}

async function adminForceSettle(intentId, adminUserId) {
  if (!allowAdminPaymentOverride()) {
    throw new AppError("Admin payment override is disabled in production", 403);
  }
  const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) {
    throw new AppError("Payment intent not found", 404);
  }
  if (intent.state === "PAID") {
    return { intent: serializeIntent(intent), alreadySettled: true };
  }

  const verifyResult = {
    valid: true,
    merchantReference: intent.merchantReference,
    gatewayTransactionId: `admin-${adminUserId}-${Date.now()}`,
    state: "PAID",
    amount: Number(intent.amount),
    externalEventId: `admin-force-${intent.id}`,
    raw: {
      source: "admin_force_settle",
      adminUserId,
      card_last4: "4242",
      card_brand: "visa",
    },
  };

  const out = await webhookService.processWebhookResult(intent.provider, verifyResult);
  const fresh = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
  await logAudit(AUDIT_ACTIONS.ADMIN_PAYMENT_FORCE_SETTLE, {
    userId: adminUserId,
    actorType: ACTOR_TYPES.ADMIN,
    entityType: ENTITY_TYPES.PAYMENT,
    entityId: intentId,
    newValue: { state: fresh?.state, webhook: out?.result?.state },
  });
  return { intent: serializeIntent(fresh), webhook: out };
}

async function listProviders() {
  return listEnabledGateways();
}

module.exports = {
  createPaymentIntent,
  getPaymentIntentById,
  confirmPaymentReturn,
  adminForceSettle,
  listProviders,
  serializeIntent,
};
