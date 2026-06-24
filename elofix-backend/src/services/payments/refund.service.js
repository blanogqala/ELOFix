const prisma = require("../../config/prisma");
const { getGateway } = require("./gatewayRegistry");
const escrowSettlement = require("./escrowSettlement.service");
const { logAudit } = require("../auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES, ACTOR_TYPES } = require("../../constants/auditActions");

/**
 * Request gateway refund when provider supports it (best-effort).
 */
async function requestGatewayRefund(intentId, amount) {
  const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent || intent.state !== "PAID") {
    return { ok: false, reason: "no_paid_intent" };
  }
  const providerKey = intent.provider;
  try {
    const gw = getGateway(providerKey);
    if (!gw.refund) {
      return { ok: false, reason: "refund_not_supported" };
    }
    const result = await gw.refund(intent.gatewayTransactionId, amount ?? Number(intent.amount));
    if (result.supported && result.ok) {
      await prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          state: amount != null && Number(amount) < Number(intent.amount) ? "PARTIALLY_REFUNDED" : "REFUNDED",
          refundedAt: new Date(),
        },
      });
      await logAudit(AUDIT_ACTIONS.PAYMENT_REFUND, {
        entityType: ENTITY_TYPES.PAYMENT,
        entityId: intent.id,
        newValue: {
          amount: amount ?? Number(intent.amount),
          kind: intent.kind,
          jobId: intent.jobId,
          materialOrderId: intent.materialOrderId,
        },
      });
      if (intent.kind === "LABOR" && intent.jobId) {
        await escrowSettlement.markLaborIntentRefunded(intent.jobId);
      }
      if (intent.materialOrderId) {
        await escrowSettlement.markMaterialIntentRefunded(intent.materialOrderId, Boolean(amount));
      }
    }
    return result;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  requestGatewayRefund,
};
