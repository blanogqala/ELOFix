const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../../config/prisma");
const escrowSettlement = require("./escrowSettlement.service");
const { getGateway, GATEWAYS } = require("./gatewayRegistry");
const { toCents } = require("./money.util");
const {
  ELOFIX_GROSS_COMMISSION_PERCENT,
  isMarketplaceSplitKind,
  isRepaymentKind,
  isPaystackChargeSettlementEvent,
  isPaystackRefundEvent,
  sanitizePaystackWebhookRaw,
  sanitizePaystackRefundRaw,
  safePaystackSubaccountCode,
} = require("./paystack.payload");

const POST_SETTLEMENT_PENDING = "post_settlement_pending";

function toPrismaDecimal(v) {
  return new Prisma.Decimal(String(Number(v).toFixed(2)));
}

function isEventFullyProcessed(ev) {
  if (!ev?.processedAt) return false;
  return String(ev.processingError || "") !== POST_SETTLEMENT_PENDING;
}

function postSettlementFlags(intent) {
  const kind = String(intent?.kind || "");
  const postSettleJobStore = kind === "JOB_STORE_ORDER" && !intent.materialOrderId;
  const postSettleDeliveryFee = kind === "DELIVERY_FEE";
  const postSettleProviderRepayment = kind === "PROVIDER_REFUND_REPAYMENT";
  return {
    postSettleJobStore,
    postSettleDeliveryFee,
    postSettleProviderRepayment,
    needsPostSettlement: postSettleJobStore || postSettleDeliveryFee || postSettleProviderRepayment,
  };
}

async function markEventFullyProcessed(db, providerKey, externalEventId, paymentIntentId) {
  await db.paymentWebhookEvent.updateMany({
    where: { provider: providerKey, externalEventId },
    data: {
      processedAt: new Date(),
      processingError: null,
      ...(paymentIntentId ? { paymentIntentId } : {}),
    },
  });
}

async function markEventPostSettlementPending(db, providerKey, externalEventId, paymentIntentId) {
  await db.paymentWebhookEvent.updateMany({
    where: { provider: providerKey, externalEventId },
    data: {
      processedAt: null,
      processingError: POST_SETTLEMENT_PENDING,
      paymentIntentId,
    },
  });
}

async function runCriticalPostSettlement(flags, intentId) {
  const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) {
    throw new Error("Payment intent missing after webhook commit");
  }
  if (flags.postSettleJobStore) {
    await escrowSettlement.settleJobStoreOrderFromIntent(intent);
  }
  if (flags.postSettleDeliveryFee) {
    await escrowSettlement.settleDeliveryFeeFromIntent(intent);
  }
  if (flags.postSettleProviderRepayment) {
    const refundRecovery = require("../refundRecovery.service");
    await refundRecovery.markGatewayRepaymentPaidFromIntent(intent);
  }
}

/**
 * Apply verified webhook result to PaymentIntent + business settlement.
 * processedAt is set only after required financial post-settlement completes.
 */
async function processWebhookResult(providerKey, verifyResult) {
  if (!verifyResult.valid || !verifyResult.merchantReference) {
    return { httpStatus: 400, message: "Invalid webhook" };
  }

  const externalEventId = String(
    verifyResult.externalEventId || `${verifyResult.merchantReference}-${verifyResult.state}`
  );

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const existingEv = await tx.paymentWebhookEvent.findUnique({
          where: {
            provider_externalEventId: {
              provider: providerKey,
              externalEventId,
            },
          },
        });
        if (isEventFullyProcessed(existingEv)) {
          return { duplicate: true, processed: true, fullyProcessed: true };
        }

        const intent = await tx.paymentIntent.findUnique({
          where: { merchantReference: String(verifyResult.merchantReference) },
        });
        if (!intent) {
          if (!existingEv) {
            await tx.paymentWebhookEvent.create({
              data: {
                id: randomUUID(),
                provider: providerKey,
                externalEventId,
                signatureValid: true,
                rawPayload: verifyResult.raw || {},
                processingError: "intent_not_found",
              },
            });
          }
          return { processed: true, noIntent: true, fullyProcessed: true };
        }

        if (!existingEv) {
          await tx.paymentWebhookEvent.create({
            data: {
              id: randomUUID(),
              provider: providerKey,
              externalEventId,
              paymentIntentId: intent.id,
              signatureValid: true,
              rawPayload: verifyResult.raw || {},
            },
          });
        }

        if (verifyResult.amount != null) {
          const expected = toPrismaDecimal(intent.amount);
          const got = toPrismaDecimal(verifyResult.amount);
          if (expected.sub(got).abs().gt(0.02)) {
            throw new Error("Amount mismatch");
          }
        }

        const gwTxId = verifyResult.gatewayTransactionId
          ? String(verifyResult.gatewayTransactionId)
          : intent.gatewayTransactionId;

        if (verifyResult.state === "PAID") {
          const flags = postSettlementFlags(intent);

          if (intent.state === "PAID") {
            if (flags.needsPostSettlement) {
              await markEventPostSettlementPending(tx, providerKey, externalEventId, intent.id);
              return {
                duplicate: true,
                processed: false,
                resumePostSettlement: true,
                intentId: intent.id,
                ...flags,
              };
            }
            await markEventFullyProcessed(tx, providerKey, externalEventId, intent.id);
            return { duplicate: true, processed: true, fullyProcessed: true, intentId: intent.id };
          }

          const prevPayload =
            intent.gatewayPayload &&
            typeof intent.gatewayPayload === "object" &&
            !Array.isArray(intent.gatewayPayload)
              ? intent.gatewayPayload
              : {};
          const mergedPayload = {
            ...prevPayload,
            ...(verifyResult.raw && typeof verifyResult.raw === "object" ? verifyResult.raw : {}),
          };

          await tx.paymentIntent.update({
            where: { id: intent.id },
            data: {
              state: "PAID",
              paidAt: new Date(),
              gatewayTransactionId: gwTxId,
              gatewayPayload: mergedPayload,
              escrowStatus: "NOT_APPLICABLE",
            },
          });

          const fresh = await tx.paymentIntent.findUnique({ where: { id: intent.id } });

          let settledAudit = null;
          let laborSettleExtra = null;
          if (fresh.kind === "LABOR") {
            const laborResult = await escrowSettlement.settleLaborFromIntent(tx, fresh, verifyResult.raw);
            settledAudit = laborResult.settledAudit || null;
            laborSettleExtra = laborResult;
          } else if (fresh.kind === "MATERIAL_ORDER") {
            await escrowSettlement.settleMaterialOrderFromIntent(tx, fresh);
          } else if (fresh.kind === "JOB_STORE_ORDER" && fresh.materialOrderId) {
            await escrowSettlement.settleMaterialOrderFromIntent(tx, fresh);
          }

          const paidFlags = postSettlementFlags(fresh);
          if (paidFlags.needsPostSettlement) {
            await markEventPostSettlementPending(tx, providerKey, externalEventId, intent.id);
          } else {
            await markEventFullyProcessed(tx, providerKey, externalEventId, intent.id);
          }

          return {
            processed: !paidFlags.needsPostSettlement,
            fullyProcessed: !paidFlags.needsPostSettlement,
            intentId: intent.id,
            state: "PAID",
            ...paidFlags,
            settledAudit,
            notifyDepositPaid: Boolean(laborSettleExtra?.notifyDepositPaid),
            laborJobId: fresh.jobId || null,
            obligationPaidCustomerId: laborSettleExtra?.obligationPaidCustomerId || null,
          };
        }

        if (verifyResult.state === "FAILED") {
          await tx.paymentIntent.update({
            where: { id: intent.id },
            data: {
              state: "FAILED",
              failedAt: new Date(),
              gatewayTransactionId: gwTxId,
              gatewayPayload: verifyResult.raw || {},
            },
          });
          await markEventFullyProcessed(tx, providerKey, externalEventId, intent.id);
          return { processed: true, fullyProcessed: true, intentId: intent.id, state: "FAILED" };
        }

        if (verifyResult.state === "CANCELLED") {
          await tx.paymentIntent.update({
            where: { id: intent.id },
            data: {
              state: "CANCELLED",
              cancelledAt: new Date(),
              gatewayTransactionId: gwTxId,
              gatewayPayload: verifyResult.raw || {},
            },
          });
          await markEventFullyProcessed(tx, providerKey, externalEventId, intent.id);
          return { processed: true, fullyProcessed: true, intentId: intent.id, state: "CANCELLED" };
        }

        await markEventFullyProcessed(tx, providerKey, externalEventId, intent.id);
        return { processed: true, fullyProcessed: true, ignored: true };
      },
      {
        maxWait: 5000,
        timeout: 25000,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    if (result?.needsPostSettlement && result?.intentId && !result?.fullyProcessed) {
      try {
        await runCriticalPostSettlement(result, result.intentId);
        await markEventFullyProcessed(prisma, providerKey, externalEventId, result.intentId);
        result.processed = true;
        result.fullyProcessed = true;
        result.resumePostSettlement = Boolean(result.resumePostSettlement);
      } catch (postErr) {
        console.error("[processWebhookResult] critical post-settlement failed", postErr);
        return {
          httpStatus: 500,
          message: postErr?.message || "Post-settlement failed",
          result,
        };
      }
    }

    if (result?.settledAudit) {
      const { logAudit } = require("../auditLog.service");
      const { AUDIT_ACTIONS, ENTITY_TYPES } = require("../../constants/auditActions");
      const sa = result.settledAudit;
      await logAudit(AUDIT_ACTIONS.PAYMENT_ESCROW_SETTLED, {
        userId: sa.userId,
        entityType: ENTITY_TYPES.PAYMENT,
        entityId: sa.intentId,
        newValue: { jobId: sa.jobId, amount: sa.amount, kind: "LABOR", paymentType: sa.paymentType },
      });
    }
    if (result?.notifyDepositPaid && result?.laborJobId) {
      try {
        const job = await prisma.job.findUnique({
          where: { id: String(result.laborJobId) },
          select: { customerId: true, providerId: true, title: true },
        });
        if (job?.customerId) {
          const notificationEvents = require("../notificationEvents.service");
          await notificationEvents.notifyDepositPaymentSuccess(
            job.customerId,
            job.providerId,
            result.laborJobId,
            job.title
          );
        }
      } catch (notifyErr) {
        console.error("[processWebhookResult] deposit notify failed", notifyErr);
      }
    }
    if (result?.obligationPaidCustomerId) {
      try {
        const obligationService = require("../customerPaymentObligation.service");
        await obligationService.afterObligationPaid(result.obligationPaidCustomerId);
      } catch (clearErr) {
        console.error("[processWebhookResult] obligation restriction clear failed", clearErr);
      }
    }
    return { httpStatus: 200, result };
  } catch (e) {
    const msg = e?.message || "Webhook processing failed";
    const amountMismatch = /amount mismatch/i.test(msg);
    return {
      httpStatus: 500,
      message: msg,
      amountValid: amountMismatch ? false : null,
      failure: amountMismatch ? "AMOUNT_MISMATCH" : "INTERNAL_SETTLEMENT_FAILURE",
    };
  }
}

function passFail(value) {
  if (value == null) return "SKIPPED";
  return value ? "PASS" : "FAIL";
}

function logPayfastItn(fields) {
  console.log("[payfast-itn]", {
    merchantReference: fields.merchantReference || null,
    sourceIp: fields.sourceIp || null,
    signature: passFail(fields.signatureValid),
    payfastIp: passFail(fields.ipValid),
    serverValidation: passFail(fields.serverValid),
    amount: passFail(fields.amountValid),
    outcome: fields.outcome,
    state: fields.state || null,
    httpStatus: fields.httpStatus,
  });
}

async function handlePayfastWebhook(data, clientIp, rawBody) {
  const sourceIp = String(clientIp || "").replace(/^::ffff:/i, "") || null;
  const merchantReference = data && data.m_payment_id ? String(data.m_payment_id) : null;
  console.log("[payfast-itn] webhook received", { merchantReference, sourceIp });

  const gw = getGateway("PAYFAST");
  const verifyResult = await gw.verifyWebhook(data, clientIp, rawBody);
  const out = await processWebhookResult("PAYFAST", verifyResult);

  let amountValid = null;
  if (verifyResult.valid) {
    if (out.failure === "AMOUNT_MISMATCH" || out.amountValid === false) amountValid = false;
    else if (out.httpStatus && out.httpStatus >= 400) amountValid = null;
    else amountValid = true;
  }

  let outcome = "OK";
  if (!verifyResult.valid) outcome = verifyResult.failure || "INVALID";
  else if (out.failure) outcome = out.failure;
  else if (out.httpStatus && out.httpStatus >= 400) outcome = "INTERNAL_SETTLEMENT_FAILURE";
  else if (out.result?.duplicate) outcome = "DUPLICATE";
  else if (out.result?.state) outcome = String(out.result.state);
  else outcome = "OK";

  logPayfastItn({
    merchantReference: verifyResult.merchantReference || merchantReference,
    sourceIp,
    signatureValid: verifyResult.signatureValid,
    ipValid: verifyResult.ipValid,
    serverValid: verifyResult.serverValid,
    amountValid,
    outcome,
    state: out.result?.state || (verifyResult.valid ? verifyResult.state : null),
    httpStatus: out.httpStatus != null ? out.httpStatus : 200,
  });

  return out;
}

async function handlePayflexWebhook(rawBuffer, signatureHeader) {
  const gw = getGateway("PAYFLEX");
  const verifyResult = gw.verifyWebhook(rawBuffer, signatureHeader);
  return processWebhookResult("PAYFLEX", verifyResult);
}

async function handlePayjustnowWebhook(rawBuffer, signatureHeader) {
  const gw = getGateway("PAYJUSTNOW");
  const verifyResult = gw.verifyWebhook(rawBuffer, signatureHeader);
  return processWebhookResult("PAYJUSTNOW", verifyResult);
}

function paystackAdapter() {
  return GATEWAYS.PAYSTACK;
}

async function reconcilePaystackSplit(intent, verified) {
  const kind = String(intent?.kind || "");
  const verifiedCode = safePaystackSubaccountCode(
    verified?.subaccount || verified?.raw?.subaccount
  );
  const bearer = verified?.raw?.bearer != null ? String(verified.raw.bearer).trim().toLowerCase() : null;
  const pct =
    verified?.raw?.percentage_charge != null ? Number(verified.raw.percentage_charge) : null;

  if (isRepaymentKind(kind)) {
    if (verifiedCode || bearer === "subaccount" || (pct != null && Number.isFinite(pct))) {
      console.error("[paystack-webhook] repayment split contradiction", {
        merchantReference: intent.merchantReference,
        hasSubaccount: Boolean(verifiedCode),
      });
      return { ok: false, reason: "repayment_has_marketplace_split" };
    }
    return { ok: true };
  }

  if (!isMarketplaceSplitKind(kind)) return { ok: true };

  if (pct != null && Number.isFinite(pct) && pct !== ELOFIX_GROSS_COMMISSION_PERCENT) {
    console.error("[paystack-webhook] percentage_charge contradiction", {
      merchantReference: intent.merchantReference,
      percentage_charge: pct,
    });
    return { ok: false, reason: "percentage_charge_mismatch" };
  }
  if (bearer && bearer !== "subaccount") {
    console.error("[paystack-webhook] bearer contradiction", {
      merchantReference: intent.merchantReference,
      bearer,
    });
    return { ok: false, reason: "bearer_mismatch" };
  }
  if (!verifiedCode) return { ok: true };

  try {
    const paystackRecipient = require("./paystack.recipient");
    const expected = await paystackRecipient.lookupMarketplaceSubaccount(intent);
    if (expected && String(expected).toUpperCase() !== String(verifiedCode).toUpperCase()) {
      console.error("[paystack-webhook] subaccount contradiction", {
        merchantReference: intent.merchantReference,
      });
      return { ok: false, reason: "subaccount_mismatch" };
    }
  } catch (err) {
    if (err.code !== "PAYSTACK_RECIPIENT_REQUIRED") {
      throw err;
    }
  }
  return { ok: true };
}

async function recordPaystackWebhookEvent(externalEventId, rawPayload, paymentIntentId) {
  const existing = await prisma.paymentWebhookEvent.findUnique({
    where: {
      provider_externalEventId: {
        provider: "PAYSTACK",
        externalEventId,
      },
    },
  });
  if (isEventFullyProcessed(existing)) {
    return { existing, duplicate: true };
  }
  if (!existing) {
    await prisma.paymentWebhookEvent.create({
      data: {
        id: randomUUID(),
        provider: "PAYSTACK",
        externalEventId,
        paymentIntentId: paymentIntentId || null,
        signatureValid: true,
        rawPayload: rawPayload || {},
      },
    });
  }
  return { existing, duplicate: false };
}

async function findPaystackRefundIntent(sanitized, refundId) {
  const reference = String(sanitized.transaction_reference || "").trim();
  if (reference) {
    const byRef = await prisma.paymentIntent.findUnique({
      where: { merchantReference: reference },
    });
    if (byRef) return byRef;
  }
  if (refundId) {
    const byPending = await prisma.paymentIntent.findFirst({
      where: {
        provider: "PAYSTACK",
        gatewayPayload: {
          path: ["pendingRefund", "externalRefundId"],
          equals: String(refundId),
        },
      },
    });
    if (byPending) return byPending;
  }
  return null;
}

function isTerminalPaystackRefundEvent(event) {
  const e = String(event || "").trim().toLowerCase();
  return e === "refund.processed" || e === "refund.failed";
}

async function handlePaystackRefundEvent(body, event) {
  const refundService = require("./refund.service");
  const sanitized = sanitizePaystackRefundRaw(body);
  const webhookRefundId = refundService.webhookRefundIdFromSanitized(sanitized);
  const intent = await findPaystackRefundIntent(sanitized, webhookRefundId);

  if (!intent) {
    if (!webhookRefundId) {
      return { httpStatus: 200, result: { ignored: true, noIntent: true, refund: true } };
    }
    const orphanEventId = refundService.refundWebhookEventId(webhookRefundId, event);
    const recorded = await recordPaystackWebhookEvent(orphanEventId, sanitized, null);
    if (recorded.duplicate) {
      return { httpStatus: 200, result: { duplicate: true, refund: true, noIntent: true } };
    }
    await markEventFullyProcessed(prisma, "PAYSTACK", orphanEventId, null);
    return { httpStatus: 200, result: { processed: true, noIntent: true, refund: true } };
  }

  const resolved = refundService.resolveEffectiveRefundId(intent, webhookRefundId);
  if (resolved.mismatch) {
    console.error("[paystack-webhook] refund id contradicts stored pending id", {
      merchantReference: intent.merchantReference,
    });
    return { httpStatus: 400, message: "Refund identity mismatch" };
  }

  const effectiveRefundId = resolved.effectiveRefundId;
  if (!effectiveRefundId) {
    if (isTerminalPaystackRefundEvent(event)) {
      console.error("[paystack-webhook] terminal refund missing effectiveRefundId", {
        merchantReference: intent.merchantReference,
        event,
      });
      return { httpStatus: 400, message: "Refund identity missing" };
    }
    return { httpStatus: 200, result: { ignored: true, refund: true, reason: "missing_refund_id" } };
  }

  const externalEventId = refundService.refundWebhookEventId(effectiveRefundId, event);
  const recorded = await recordPaystackWebhookEvent(externalEventId, sanitized, intent.id);
  if (recorded.duplicate) {
    return { httpStatus: 200, result: { duplicate: true, refund: true } };
  }

  const pending = refundService.readPendingRefund(intent);
  if (
    resolved.alreadyFinalized ||
    refundService.isRefundAlreadyFinalized(intent, {
      externalRefundId: effectiveRefundId,
      idempotencyKey: pending?.idempotencyKey || null,
    })
  ) {
    await markEventFullyProcessed(prisma, "PAYSTACK", externalEventId, intent.id);
    return { httpStatus: 200, result: { processed: true, refund: true, duplicate: true, alreadyFinalized: true } };
  }

  const gw = paystackAdapter();
  let mapped = {
    supported: true,
    ok: false,
    pending: true,
    status: "PENDING",
    externalRefundId: effectiveRefundId,
  };
  if (
    event === "refund.processed" ||
    event === "refund.failed" ||
    event.includes("needs-attention") ||
    event.includes("needs_attention")
  ) {
    if (typeof gw.verifyRefund === "function") {
      const verified = await gw.verifyRefund(effectiveRefundId);
      if (verified.status === "VERIFY_FAILED" || String(verified.message || "") === "paystack_refund_verify_failed") {
        return { httpStatus: 500, message: verified.message || "Paystack refund verify failed" };
      }
      mapped = verified;
      if (mapped.externalRefundId == null) mapped.externalRefundId = effectiveRefundId;
    }
  } else if (event === "refund.processing") {
    mapped.status = "PENDING";
    mapped.pending = true;
    mapped.externalRefundId = effectiveRefundId;
  }

  const requestedAmount = pending?.requestedAmount != null ? Number(pending.requestedAmount) : null;

  if (event === "refund.processed" || mapped.ok || mapped.status === "COMPLETED") {
    if (!mapped.ok && mapped.status !== "COMPLETED") {
      return { httpStatus: 400, message: "Refund not processed on Paystack" };
    }
    const verifiedCurrency = String(mapped.currency || "").trim().toUpperCase();
    if (!verifiedCurrency || verifiedCurrency !== "ZAR") {
      console.error("[paystack-webhook] refund currency mismatch", {
        merchantReference: intent.merchantReference,
      });
      return { httpStatus: 400, message: "Currency mismatch" };
    }
    if (requestedAmount == null || mapped.amountCents == null) {
      console.error("[paystack-webhook] refund amount missing from server verify", {
        merchantReference: intent.merchantReference,
      });
      return { httpStatus: 400, message: "Refund amount mismatch" };
    }
    if (Math.round(Number(mapped.amountCents)) !== toCents(requestedAmount)) {
      console.error("[paystack-webhook] refund amount mismatch", {
        merchantReference: intent.merchantReference,
      });
      return { httpStatus: 400, message: "Refund amount mismatch" };
    }
    await refundService.finalizeCustomerGatewayRefund(intent, {
      amount: requestedAmount,
      externalRefundId: mapped.externalRefundId || effectiveRefundId,
      idempotencyKey: pending?.idempotencyKey || refundFinalizationIdempotency(effectiveRefundId),
      finalizeCustomerArtifacts: true,
    });
    await markEventFullyProcessed(prisma, "PAYSTACK", externalEventId, intent.id);
    return { httpStatus: 200, result: { processed: true, refund: true, state: "PROCESSED" } };
  }

  if (mapped.status === "FAILED" || event === "refund.failed") {
    await refundService.updatePendingRefundStatus(intent, "FAILED");
    if (intent.jobId) {
      const { mutateJobMetaInTransaction } = require("../jobMeta.service");
      await prisma.$transaction(async (tx) => {
        await mutateJobMetaInTransaction(tx, intent.jobId, (m) => {
          const refund = m.refund && typeof m.refund === "object" ? m.refund : {};
          return {
            ...m,
            refund: {
              ...refund,
              customerRefundStatus: "REFUND_FAILED",
              status: "gateway_failed",
            },
          };
        });
      });
    }
    await markEventFullyProcessed(prisma, "PAYSTACK", externalEventId, intent.id);
    return { httpStatus: 200, result: { processed: true, refund: true, state: "FAILED" } };
  }

  if (mapped.status === "NEEDS_ATTENTION" || event.includes("needs-attention") || event.includes("needs_attention")) {
    await refundService.updatePendingRefundStatus(intent, "NEEDS_ATTENTION", { actionRequired: true });
    if (intent.jobId) {
      const { mutateJobMetaInTransaction } = require("../jobMeta.service");
      await prisma.$transaction(async (tx) => {
        await mutateJobMetaInTransaction(tx, intent.jobId, (m) => {
          const refund = m.refund && typeof m.refund === "object" ? m.refund : {};
          return {
            ...m,
            refund: {
              ...refund,
              customerRefundStatus: "REFUND_PROCESSING",
              status: "needs_attention",
              actionRequired: true,
              actionRequiredReason: "paystack_refund_needs_attention",
            },
          };
        });
      });
    }
    await markEventFullyProcessed(prisma, "PAYSTACK", externalEventId, intent.id);
    return { httpStatus: 200, result: { processed: true, refund: true, state: "NEEDS_ATTENTION" } };
  }

  await refundService.updatePendingRefundStatus(intent, mapped.status || "PENDING");
  await markEventFullyProcessed(prisma, "PAYSTACK", externalEventId, intent.id);
  return { httpStatus: 200, result: { processed: true, refund: true, state: mapped.status || "PENDING" } };
}

function refundFinalizationIdempotency(effectiveRefundId) {
  return `paystack-refund:${String(effectiveRefundId)}`;
}

async function handlePaystackChargeEvent(body, event) {
  const gw = paystackAdapter();
  const data = body.data && typeof body.data === "object" ? body.data : {};
  const reference = String(data.reference || "").trim();
  if (!reference) {
    return { httpStatus: 400, message: "Invalid webhook" };
  }

  let verified;
  try {
    verified = await gw.verifyTransaction(reference);
  } catch (err) {
    return { httpStatus: 500, message: err.message || "Paystack verify failed" };
  }

  const intent = await prisma.paymentIntent.findUnique({
    where: { merchantReference: reference },
  });

  if (event === "charge.success") {
    if (verified.state !== "PAID") {
      return { httpStatus: 400, message: "Paystack verification not success" };
    }
    if (intent) {
      if (String(verified.merchantReference || "") !== String(intent.merchantReference)) {
        return { httpStatus: 400, message: "Reference mismatch" };
      }
      const expectedCents = toCents(intent.amount);
      const gotCents =
        verified.amountCents != null ? Math.round(Number(verified.amountCents)) : toCents(verified.amount);
      if (expectedCents !== gotCents) {
        return {
          httpStatus: 500,
          message: "Amount mismatch",
          failure: "AMOUNT_MISMATCH",
          amountValid: false,
        };
      }
      const expectedCur = String(intent.currency || "ZAR").trim().toUpperCase() || "ZAR";
      const gotCur = String(verified.currency || "ZAR").trim().toUpperCase() || "ZAR";
      if (expectedCur !== gotCur) {
        return { httpStatus: 400, message: "Currency mismatch" };
      }
      const split = await reconcilePaystackSplit(intent, verified);
      if (!split.ok) {
        return { httpStatus: 400, message: "Split reconciliation failed" };
      }
    }
  }

  const webhookRaw = sanitizePaystackWebhookRaw(body);
  const raw = {
    ...webhookRaw,
    ...(verified.raw && typeof verified.raw === "object" ? verified.raw : {}),
    event,
    verifySource: "paystack_transaction_verify",
  };

  let state = verified.state;
  if (event === "charge.success") {
    state = "PAID";
  } else if (event === "charge.failed") {
    const verifyPaid = verified.state === "PAID";
    const intentPaid = intent?.state === "PAID";
    if (verifyPaid || intentPaid) {
      const diagnostic = {
        event,
        merchantReference: reference,
        verifyState: verified.state,
        intentState: intent?.state || null,
        reason: intentPaid
          ? "charge_failed_ignored_paid_intent"
          : "charge_failed_contradicts_verify",
      };
      console.error("[paystack-webhook] charge.failed ignored; server verify is authoritative", diagnostic);
      await recordPaystackWebhookEvent(
        `paystack-charge-ignored:${reference}:${event}:${body.id || verified.gatewayTransactionId || "tx"}`,
        { ...sanitizePaystackWebhookRaw(body), diagnostic },
        intent?.id || null
      );
      return {
        httpStatus: 200,
        result: { ignored: true, refund: false, diagnostic },
      };
    }
    if (verified.state !== "FAILED") {
      const diagnostic = {
        event,
        merchantReference: reference,
        verifyState: verified.state,
        reason: "charge_failed_verify_not_failed",
      };
      console.error("[paystack-webhook] charge.failed ignored; verify is not failed", diagnostic);
      return { httpStatus: 200, result: { ignored: true, diagnostic } };
    }
    state = "FAILED";
  }

  return processWebhookResult("PAYSTACK", {
    valid: true,
    merchantReference: verified.merchantReference || reference,
    gatewayTransactionId: verified.gatewayTransactionId,
    state,
    amount: verified.amount,
    currency: verified.currency,
    externalEventId: String(body.id || `${reference}-${event}-${verified.gatewayTransactionId || "tx"}`),
    raw,
  });
}

async function handlePaystackWebhook(rawBuffer, signatureHeader) {
  if (!Buffer.isBuffer(rawBuffer)) {
    return { httpStatus: 400, message: "Expected raw body" };
  }
  const gw = paystackAdapter();
  if (typeof gw.isConfigured === "function" && !gw.isConfigured()) {
    return { httpStatus: 503, message: "PAYSTACK is not configured" };
  }
  if (!gw.verifyWebhookSignature(rawBuffer, signatureHeader)) {
    return { httpStatus: 400, message: "Invalid webhook" };
  }

  let body;
  try {
    body = JSON.parse(rawBuffer.toString("utf8"));
  } catch {
    return { httpStatus: 400, message: "Invalid webhook" };
  }

  const event = String(body.event || "").trim().toLowerCase();
  if (isPaystackRefundEvent(event)) {
    return handlePaystackRefundEvent(body, event);
  }
  if (!isPaystackChargeSettlementEvent(event)) {
    return { httpStatus: 200, message: "ignored", result: { ignored: true, event } };
  }
  return handlePaystackChargeEvent(body, event);
}

module.exports = {
  POST_SETTLEMENT_PENDING,
  processWebhookResult,
  handlePayfastWebhook,
  handlePayflexWebhook,
  handlePayjustnowWebhook,
  handlePaystackWebhook,
  reconcilePaystackSplit,
};
