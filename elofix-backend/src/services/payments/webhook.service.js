const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../../config/prisma");
const escrowSettlement = require("./escrowSettlement.service");
const paymentService = require("../payment.service");
const { getGateway } = require("./gatewayRegistry");

function toPrismaDecimal(v) {
  return new Prisma.Decimal(String(Number(v).toFixed(2)));
}

/**
 * Apply verified webhook result to PaymentIntent + business settlement.
 */
async function processWebhookResult(providerKey, verifyResult) {
  if (!verifyResult.valid || !verifyResult.merchantReference) {
    return { httpStatus: 400, message: "Invalid webhook" };
  }

  const externalEventId = String(verifyResult.externalEventId || `${verifyResult.merchantReference}-${verifyResult.state}`);

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
        if (existingEv?.processedAt) {
          return { duplicate: true, processed: true };
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
          return { processed: true, noIntent: true };
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
          if (intent.state === "PAID") {
            await tx.paymentWebhookEvent.updateMany({
              where: { provider: providerKey, externalEventId },
              data: { processedAt: new Date() },
            });
            const postSettleJobStore =
              intent.kind === "JOB_STORE_ORDER" && !intent.materialOrderId;
            return { duplicate: true, processed: true, intentId: intent.id, postSettleJobStore };
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
          let postSettleProviderRepayment = false;
          if (fresh.kind === "LABOR") {
            const laborResult = await escrowSettlement.settleLaborFromIntent(tx, fresh, verifyResult.raw);
            settledAudit = laborResult.settledAudit || null;
            laborSettleExtra = laborResult;
          } else if (fresh.kind === "MATERIAL_ORDER") {
            await escrowSettlement.settleMaterialOrderFromIntent(tx, fresh);
          } else if (fresh.kind === "JOB_STORE_ORDER" && fresh.materialOrderId) {
            await escrowSettlement.settleMaterialOrderFromIntent(tx, fresh);
          } else if (fresh.kind === "PROVIDER_REFUND_REPAYMENT") {
            postSettleProviderRepayment = true;
          }

          await tx.paymentWebhookEvent.updateMany({
            where: { provider: providerKey, externalEventId },
            data: { processedAt: new Date(), paymentIntentId: intent.id },
          });
          const postSettleJobStore =
            fresh.kind === "JOB_STORE_ORDER" && !fresh.materialOrderId;
          const postSettleDeliveryFee = fresh.kind === "DELIVERY_FEE";
          return {
            processed: true,
            intentId: intent.id,
            state: "PAID",
            postSettleJobStore,
            postSettleDeliveryFee,
            postSettleProviderRepayment,
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
          await tx.paymentWebhookEvent.updateMany({
            where: { provider: providerKey, externalEventId },
            data: { processedAt: new Date() },
          });
          return { processed: true, intentId: intent.id, state: "FAILED" };
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
          await tx.paymentWebhookEvent.updateMany({
            where: { provider: providerKey, externalEventId },
            data: { processedAt: new Date() },
          });
          return { processed: true, intentId: intent.id, state: "CANCELLED" };
        }

        await tx.paymentWebhookEvent.updateMany({
          where: { provider: providerKey, externalEventId },
          data: { processedAt: new Date() },
        });
        return { processed: true, ignored: true };
      },
      {
        maxWait: 5000,
        timeout: 25000,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    if (result?.postSettleJobStore && result?.intentId) {
      try {
        const intent = await prisma.paymentIntent.findUnique({
          where: { id: result.intentId },
        });
        if (intent) {
          await escrowSettlement.settleJobStoreOrderFromIntent(intent);
        }
      } catch (postErr) {
        console.error("[processWebhookResult] job store post-settle failed", postErr);
        return {
          httpStatus: 500,
          message: postErr?.message || "Job store settlement failed",
          result,
        };
      }
    }
    if (result?.postSettleDeliveryFee && result?.intentId) {
      try {
        const intent = await prisma.paymentIntent.findUnique({
          where: { id: result.intentId },
        });
        if (intent) {
          await escrowSettlement.settleDeliveryFeeFromIntent(intent);
        }
      } catch (postErr) {
        console.error("[processWebhookResult] delivery fee post-settle failed", postErr);
        return {
          httpStatus: 500,
          message: postErr?.message || "Delivery fee settlement failed",
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
    if (result?.postSettleProviderRepayment && result?.intentId) {
      try {
        const intent = await prisma.paymentIntent.findUnique({
          where: { id: result.intentId },
        });
        if (intent) {
          const refundRecovery = require("../refundRecovery.service");
          await refundRecovery.markGatewayRepaymentPaidFromIntent(intent);
        }
      } catch (postErr) {
        console.error("[processWebhookResult] provider refund repayment post-settle failed", postErr);
      }
    }
    return { httpStatus: 200, result };
  } catch (e) {
    const msg = e?.message || "Webhook processing failed";
    return { httpStatus: 500, message: msg };
  }
}

async function handlePayfastWebhook(data, clientIp) {
  const gw = getGateway("PAYFAST");
  const verifyResult = await gw.verifyWebhook(data, clientIp);
  if (!verifyResult.valid) {
    console.warn("[webhook payfast] rejected ITN", {
      clientIp,
      merchantReference: data.m_payment_id,
      paymentStatus: data.payment_status,
    });
  }
  return processWebhookResult("PAYFAST", verifyResult);
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
  processWebhookResult,
  handlePayfastWebhook,
  handlePayflexWebhook,
  handlePayjustnowWebhook,
};
