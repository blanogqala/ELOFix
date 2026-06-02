const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../../config/prisma");
const escrowSettlement = require("./escrowSettlement.service");
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
              escrowStatus: intent.kind === "LABOR" ? "HELD" : intent.escrowStatus,
            },
          });

          const fresh = await tx.paymentIntent.findUnique({ where: { id: intent.id } });

          if (fresh.kind === "LABOR") {
            await escrowSettlement.settleLaborFromIntent(tx, fresh, verifyResult.raw);
          } else if (fresh.kind === "MATERIAL_ORDER") {
            await escrowSettlement.settleMaterialOrderFromIntent(tx, fresh);
          } else if (fresh.kind === "JOB_STORE_ORDER" && fresh.materialOrderId) {
            await escrowSettlement.settleMaterialOrderFromIntent(tx, fresh);
          }

          await tx.paymentWebhookEvent.updateMany({
            where: { provider: providerKey, externalEventId },
            data: { processedAt: new Date(), paymentIntentId: intent.id },
          });
          const postSettleJobStore =
            fresh.kind === "JOB_STORE_ORDER" && !fresh.materialOrderId;
          return { processed: true, intentId: intent.id, state: "PAID", postSettleJobStore };
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
    return { httpStatus: 200, result };
  } catch (e) {
    const msg = e?.message || "Webhook processing failed";
    return { httpStatus: 500, message: msg };
  }
}

async function handlePayfastWebhook(data, clientIp) {
  const gw = getGateway("PAYFAST");
  const verifyResult = await gw.verifyWebhook(data, clientIp);
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
