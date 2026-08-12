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
    paymentType: row.paymentType || null,
    userId: row.userId,
    jobId: row.jobId,
    materialOrderId: row.materialOrderId,
    recipientUserId: row.recipientUserId || null,
    amount: Number(row.amount),
    commissionAmount: Number(row.commissionAmount || 0),
    recipientAmount: Number(row.recipientAmount || 0),
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

async function assertNoDuplicatePaidIntent(tx, { kind, jobId, materialOrderId, metadata, paymentType }) {
  if (kind === "LABOR" && jobId) {
    const paymentModeService = require("./paymentMode.service");
    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (!job) throw new AppError("Job not found", 404);
    const meta = await getJobMeta(jobId);

    // Legacy single full labor payment
    if (job.legacyEscrowV2) {
      const existing = await tx.paymentIntent.findFirst({
        where: { jobId, kind: "LABOR", state: "PAID" },
      });
      if (existing || job.laborPaid) {
        throw new AppError("Labor payment already completed", 400);
      }
      return;
    }

    const type =
      paymentType ||
      paymentModeService.resolveNextLaborPaymentType(job, meta);
    if (!type) {
      throw new AppError("No labor payment is due for this job at this stage", 400);
    }
    const existingType = await tx.paymentIntent.findFirst({
      where: {
        jobId,
        kind: "LABOR",
        paymentType: type,
        state: { in: ["PAID", "PENDING", "PROCESSING"] },
      },
    });
    if (existingType && existingType.state === "PAID") {
      throw new AppError("This payment stage is already completed", 400);
    }
    if (String(job.paymentProgress) === "FULLY_PAID") {
      throw new AppError("Labor payments already completed", 400);
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
      // Stale PAID intent after delivery cancel (deliveryPaid cleared) is healed by
      // cancelStalePaidDeliveryFeeIntent before reuse — do not block here.
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

/**
 * After courier delivery cancel, MO.deliveryPaid is cleared but a PAID DELIVERY_FEE
 * PaymentIntent may remain and block re-pay via @@unique([materialOrderId, kind]).
 * Cancel any such intents so the customer can pay for a new delivery option.
 */
async function cancelDeliveryFeeIntentsForMaterialOrder(materialOrderId, options = {}) {
  const mid = String(materialOrderId || "").trim();
  if (!mid) return { cancelled: 0 };
  const db = options.tx || prisma;
  const now = new Date();
  const result = await db.paymentIntent.updateMany({
    where: {
      materialOrderId: mid,
      kind: "DELIVERY_FEE",
      state: { not: "CANCELLED" },
    },
    data: {
      state: "CANCELLED",
      cancelledAt: now,
    },
  });
  return { cancelled: Number(result.count) || 0 };
}

/** In-tx: if PAID DELIVERY_FEE exists but MO deliveryPaid is false, cancel it for reuse. */
async function cancelStalePaidDeliveryFeeIntent(tx, materialOrderId) {
  const mid = String(materialOrderId || "").trim();
  if (!mid) return null;
  const order = await tx.materialOrder.findUnique({ where: { id: mid } });
  const p = order?.payload && typeof order.payload === "object" ? order.payload : {};
  if (p.payment?.deliveryPaid === true) return null;

  const paidIntent = await tx.paymentIntent.findFirst({
    where: { materialOrderId: mid, kind: "DELIVERY_FEE", state: "PAID" },
  });
  if (!paidIntent) return null;

  return tx.paymentIntent.update({
    where: { id: paidIntent.id },
    data: { state: "CANCELLED", cancelledAt: new Date() },
  });
}

async function resolveAmountForKind(tx, { kind, jobId, materialOrderId, amount, metadata, paymentType }) {
  const paymentModeService = require("./paymentMode.service");

  // Never trust client amount for labor — always derive from job snapshot / expected gross.
  if (kind === "LABOR" && jobId) {
    let job = await tx.job.findUnique({ where: { id: jobId } });
    if (!job) throw new AppError("Job not found", 404);
    const meta = await getJobMeta(jobId);

    if (!job.paymentModeSnapshot && !job.legacyEscrowV2) {
      const quoted =
        (meta?.servicePrice && Number(meta.servicePrice.amount)) ||
        Number(job.totalPrice || job.price || 0);
      if (quoted > 0) {
        await paymentModeService.snapshotPaymentModeOnJob(tx, jobId, {
          quotedAmount: quoted,
          categoryKey: job.category,
        });
        job = await tx.job.findUnique({ where: { id: jobId } });
      }
    }

    if (job.legacyEscrowV2 === true) {
      const gross = paymentService.expectedLaborGrossFromJob(job, meta);
      if (gross.lte(0)) throw new AppError("Invalid labor amount", 400);
      if (amount != null && Number(amount) > 0) {
        paymentModeService.assertAmountMatchesExpected(amount, gross);
      }
      return gross;
    }

    paymentModeService.assertPaymentModeReady(job);

    const type =
      paymentType ||
      paymentModeService.resolveNextLaborPaymentType(job, meta);
    if (!type) {
      throw new AppError("No labor payment is due for this job at this stage", 400);
    }
    const expected = paymentModeService.expectedAmountForLaborPaymentType(job, type);
    if (expected.lte(0)) throw new AppError("Invalid labor amount", 400);
    if (amount != null && Number(amount) > 0) {
      paymentModeService.assertAmountMatchesExpected(amount, expected);
    }
    return expected;
  }

  // Non-LABOR: always derive from persisted server-side order/job data.
  // Client amount is validation-only (optional hint); never authoritative.
  let serverAmount = null;

  if (kind === "DELIVERY_FEE") {
    const deliveryRequestId = metadata?.deliveryRequestId
      ? String(metadata.deliveryRequestId).trim()
      : "";
    if (deliveryRequestId) {
      const dr = await tx.deliveryRequest.findUnique({ where: { id: deliveryRequestId } });
      if (!dr) throw new AppError("Delivery request not found", 404);
      const fee = Number(dr.quotedFee || 0);
      if (fee <= 0) throw new AppError("Invalid delivery fee amount", 400);
      serverAmount = toPrismaDecimal(fee);
    }
  }

  if (
    serverAmount == null &&
    (kind === "MATERIAL_ORDER" || kind === "JOB_STORE_ORDER" || kind === "DELIVERY_FEE") &&
    materialOrderId
  ) {
    const order = await tx.materialOrder.findUnique({ where: { id: materialOrderId } });
    if (!order) throw new AppError("Material order not found", 404);
    if (String(order.paymentStatus || "").toLowerCase() === "paid" && kind === "MATERIAL_ORDER") {
      throw new AppError("Material order is already paid", 400);
    }
    const p = order.payload && typeof order.payload === "object" ? order.payload : {};
    let total;
    if (kind === "DELIVERY_FEE") {
      total = Number(p.deliveryFee || p.delivery?.fee || p.deliveryQuote?.fee || 0);
    } else {
      // Prefer persisted materialsSubtotal when set; otherwise locked payload totals from order creation.
      const persisted = Number(order.materialsSubtotal);
      total =
        Number.isFinite(persisted) && persisted > 0
          ? persisted
          : Number(p.totalAmount || p.total || p.materialsSubtotal || 0);
    }
    if (total <= 0) throw new AppError("Invalid order amount", 400);
    serverAmount = toPrismaDecimal(total);
  }

  if (serverAmount == null && kind === "JOB_STORE_ORDER" && jobId) {
    const meta = await getJobMeta(jobId);
    const storeOrders = Array.isArray(meta.storeOrders) ? meta.storeOrders : [];
    const orderId = metadata?.orderId ? String(metadata.orderId).trim() : "";
    const supplierId = metadata?.supplierId ? String(metadata.supplierId).trim() : "";
    const match = storeOrders.find((o) => {
      if (!o || typeof o !== "object") return false;
      if (orderId && String(o.orderId || "") === orderId) return true;
      if (supplierId && String(o.supplierId || "") === supplierId) return true;
      return false;
    });
    if (!match) {
      throw new AppError("Store order not found for this job", 404);
    }
    if (match.payment?.materialsPaid === true) {
      throw new AppError("Store order materials are already paid", 400);
    }
    const items = Array.isArray(match.items) ? match.items : [];
    const materialsTotal = items.reduce(
      (sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || item.price || 0),
      0
    );
    const deliveryFee = Number(match.deliveryFee || match.delivery?.fee || 0);
    const total = materialsTotal + (Number.isFinite(deliveryFee) ? deliveryFee : 0);
    if (total <= 0) throw new AppError("Invalid store order amount", 400);
    serverAmount = toPrismaDecimal(total);
  }

  if (serverAmount == null || serverAmount.lte(0)) {
    throw new AppError("Unable to resolve payment amount from server records", 400);
  }

  if (amount != null && Number(amount) > 0) {
    paymentModeService.assertAmountMatchesExpected(amount, serverAmount);
  }
  return serverAmount;
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
  cardId,
  cvv,
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

  let paymentCardMeta = null;
  if (String(role) === "CUSTOMER") {
    const cardCount = await prisma.savedCard.count({ where: { userId: String(userId) } });
    if (cardCount === 0) {
      throw new AppError("Add a payment card on the Payments page before paying.", 402);
    }
    if (!cardId) {
      throw new AppError("A saved payment card is required", 400);
    }
    if (!paymentService.isValidCvv(cvv)) {
      throw new AppError("Valid CVC is required", 400);
    }
    const card = await paymentService.assertCardExists(userId, cardId);
    paymentCardMeta = { cardId: card.id, cardLast4: card.last4, cardBrand: card.brand };
  }

  const intentMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...metadata, ...(paymentCardMeta || {}) }
      : paymentCardMeta || metadata;

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

      let resolvedPaymentType = null;
      const paymentModeService = require("./paymentMode.service");
      if (kindNorm === "LABOR" && jobId) {
        const job = await tx.job.findUnique({ where: { id: jobId } });
        if (!job) throw new AppError("Job not found", 404);
        if (String(job.customerId) !== String(userId)) {
          throw new AppError("Only the customer can pay for this job", 403);
        }
        if (job.status === "CANCELLED" || job.status === "REJECTED") {
          throw new AppError("Cannot pay for a cancelled or rejected job", 400);
        }
        const meta = await getJobMeta(jobId);
        if (meta.statusOverride === "DISPUTED" || meta.escrowFrozen === true) {
          throw new AppError(
            "Cannot create a labor payment while this job is under dispute review",
            400
          );
        }
        if (!job.paymentModeSnapshot && !job.legacyEscrowV2) {
          const quoted =
            (meta?.servicePrice && Number(meta.servicePrice.amount)) ||
            Number(job.totalPrice || job.price || 0);
          if (quoted > 0) {
            await paymentModeService.snapshotPaymentModeOnJob(tx, jobId, {
              quotedAmount: quoted,
              categoryKey: job.category,
            });
          }
        }
        const jobFresh = await tx.job.findUnique({ where: { id: jobId } });
        if (jobFresh.legacyEscrowV2 === true) {
          resolvedPaymentType = paymentModeService.PAYMENT_TYPES.FULL_UPFRONT;
        } else {
          paymentModeService.assertPaymentModeReady(jobFresh);
          resolvedPaymentType = paymentModeService.resolveNextLaborPaymentType(jobFresh, meta);
          if (!resolvedPaymentType) {
            throw new AppError("No labor payment is due for this job at this stage", 400);
          }
        }
        console.log("[createPaymentIntent] LABOR stage", {
          jobId,
          paymentModeSnapshot: jobFresh.paymentModeSnapshot || null,
          paymentProgress: jobFresh.paymentProgress || "NONE",
          nextLaborPaymentType: resolvedPaymentType,
          laborPaid: Boolean(jobFresh.laborPaid),
        });
      } else {
        resolvedPaymentType = paymentModeService.paymentTypeForKind(kindNorm, null, null);
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

      await assertNoDuplicatePaidIntent(tx, {
        kind: kindNorm,
        jobId,
        materialOrderId,
        metadata,
        paymentType: resolvedPaymentType,
      });

      const resolvedAmount = await resolveAmountForKind(tx, {
        kind: kindNorm,
        jobId,
        materialOrderId,
        amount,
        metadata,
        paymentType: resolvedPaymentType,
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
        // Heal stale PAID intents left after delivery cancel (deliveryPaid already false).
        await cancelStalePaidDeliveryFeeIntent(tx, materialOrderId);

        // Prefer current DR.jobId after cancel/re-hire so PaymentReturn links the new courier job.
        let deliveryFeeJobId = jobId ? String(jobId) : null;
        const drMetaId =
          intentMetadata && typeof intentMetadata === "object" && intentMetadata.deliveryRequestId
            ? String(intentMetadata.deliveryRequestId).trim()
            : "";
        if (drMetaId) {
          const drForJob = await tx.deliveryRequest.findUnique({
            where: { id: drMetaId },
            select: { jobId: true },
          });
          if (drForJob?.jobId) deliveryFeeJobId = String(drForJob.jobId);
        }

        const reusable = await tx.paymentIntent.findFirst({
          where: {
            materialOrderId,
            kind: "DELIVERY_FEE",
            state: { not: "PAID" },
          },
        });
        if (reusable) {
          // New merchant reference so PayFast / ITN / sandbox settle are a fresh payment,
          // not tied to a previously settled attempt on this reused row.
          const merchantReference = `EF-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
          const refreshed = await tx.paymentIntent.update({
            where: { id: reusable.id },
            data: {
              merchantReference,
              provider: providerKey,
              amount: resolvedAmount,
              paymentType: resolvedPaymentType,
              state: "PENDING",
              failedAt: null,
              cancelledAt: null,
              paidAt: null,
              refundedAt: null,
              gatewayTransactionId: null,
              jobId: deliveryFeeJobId || reusable.jobId || null,
              returnUrl: returnUrl || reusable.returnUrl || null,
              cancelUrl: cancelUrl || reusable.cancelUrl || null,
              gatewayPayload:
                intentMetadata && typeof intentMetadata === "object"
                  ? intentMetadata
                  : reusable.gatewayPayload ?? undefined,
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

        // Fresh create below — use the same resolved courier job id.
        jobId = deliveryFeeJobId || jobId || null;
      }

      if (kindNorm === "LABOR" && jobId && resolvedPaymentType) {
        // Reuse ONLY the same paymentType (DEPOSIT ≠ COMPLETION). Never reuse a PAID intent.
        const reusableLabor = await tx.paymentIntent.findFirst({
          where: {
            jobId,
            kind: "LABOR",
            paymentType: resolvedPaymentType,
            state: { in: ["PENDING", "PROCESSING", "FAILED", "CANCELLED"] },
          },
          orderBy: { createdAt: "desc" },
        });
        if (reusableLabor) {
          const merchantReference = `EF-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
          const refreshed = await tx.paymentIntent.update({
            where: { id: reusableLabor.id },
            data: {
              merchantReference,
              provider: providerKey,
              amount: resolvedAmount,
              paymentType: resolvedPaymentType,
              state: "PENDING",
              failedAt: null,
              cancelledAt: null,
              paidAt: null,
              refundedAt: null,
              gatewayTransactionId: null,
              returnUrl: returnUrl || reusableLabor.returnUrl || null,
              cancelUrl: cancelUrl || reusableLabor.cancelUrl || null,
              gatewayPayload:
                intentMetadata && typeof intentMetadata === "object"
                  ? intentMetadata
                  : reusableLabor.gatewayPayload ?? undefined,
              escrowStatus: "NOT_APPLICABLE",
              providerPayoutStatus: "NONE",
            },
          });
          console.log("[createPaymentIntent] LABOR reuse same-stage intent", {
            jobId,
            intentId: refreshed.id,
            paymentType: resolvedPaymentType,
            amount: Number(refreshed.amount),
            merchantReference: refreshed.merchantReference,
            provider: providerKey,
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
          paymentType: resolvedPaymentType,
          userId: String(userId),
          jobId: jobId || null,
          materialOrderId: materialOrderId || null,
          amount: resolvedAmount,
          currency: paymentCurrency(),
          state: "PENDING",
          escrowStatus: "NOT_APPLICABLE",
          providerPayoutStatus: kindNorm === "LABOR" ? "NONE" : "NOT_APPLICABLE",
          idempotencyKey: idempotencyKey || null,
          returnUrl: returnUrl || null,
          cancelUrl: cancelUrl || null,
          gatewayPayload: intentMetadata && typeof intentMetadata === "object" ? intentMetadata : undefined,
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
    // Unique per settle attempt — reusing a cancelled DELIVERY_FEE intent must not
    // hit the prior sandbox-return-{intentId} webhook event (would skip settling).
    const settleEventId = `sandbox-return-${intent.id}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const webhookOut = await webhookService.processWebhookResult("PAYFAST", {
      valid: true,
      merchantReference: intent.merchantReference,
      gatewayTransactionId: `sandbox-return-${Date.now()}`,
      state: "PAID",
      amount: Number(intent.amount),
      externalEventId: settleEventId,
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
        paymentType: intent.paymentType || null,
        amount: Number(intent.amount),
        kind: intent.kind,
        jobId: intent.jobId || null,
        provider: intent.provider,
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
    externalEventId: `admin-force-${intent.id}-${Date.now()}-${randomUUID().slice(0, 8)}`,
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
  cancelDeliveryFeeIntentsForMaterialOrder,
};
