const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../../config/prisma");
const escrowSettlement = require("./escrowSettlement.service");
const { getGateway } = require("./gatewayRegistry");

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

async function handlePayfastWebhook(data, clientIp) {
  const sourceIp = String(clientIp || "").replace(/^::ffff:/i, "") || null;
  const merchantReference = data && data.m_payment_id ? String(data.m_payment_id) : null;
  console.log("[payfast-itn] webhook received", { merchantReference, sourceIp });

  const gw = getGateway("PAYFAST");
  const verifyResult = await gw.verifyWebhook(data, clientIp);
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

module.exports = {
  POST_SETTLEMENT_PENDING,
  processWebhookResult,
  handlePayfastWebhook,
  handlePayflexWebhook,
  handlePayjustnowWebhook,
};
