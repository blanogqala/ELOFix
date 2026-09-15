const prisma = require("../config/prisma");
const { toPublicPayoutBreakdown, majorOrNull } = require("./payments/payoutTransparency.util");

async function listPayoutReconciliationsForJob(jobId) {
  const jid = String(jobId || "").trim();
  if (!jid) return [];
  const intents = await prisma.paymentIntent.findMany({
    where: { jobId: jid },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
    include: {
      payoutSettlement: {
        select: {
          id: true,
          externalSettlementId: true,
          status: true,
          settledAt: true,
          settlementDate: true,
          gatewayReference: true,
          gateway: true,
        },
      },
    },
  });

  return intents.map((intent) => {
    const extras = {
      payoutSettlementId: intent.payoutSettlement?.id || intent.payoutSettlementId || null,
      externalSettlementId: intent.payoutSettlement?.externalSettlementId || null,
      payoutSettledAt:
        intent.payoutSettlement?.settledAt instanceof Date
          ? intent.payoutSettlement.settledAt.toISOString()
          : intent.payoutSettlement?.settlementDate instanceof Date
            ? intent.payoutSettlement.settlementDate.toISOString()
            : null,
      gatewayReference: intent.payoutSettlement?.gatewayReference || intent.merchantReference,
      payoutSettlementStatus: intent.payoutSettlementStatus,
    };
    const breakdown = toPublicPayoutBreakdown(intent, extras);
    return {
      paymentIntentId: intent.id,
      merchantReference: intent.merchantReference,
      kind: intent.kind,
      paymentType: intent.paymentType || null,
      recipientUserId: intent.recipientUserId || null,
      ...breakdown,
      processorFeeAmount: majorOrNull(intent.processorFeeAmount),
      expectedBankSettlementAmount: majorOrNull(intent.expectedBankSettlementAmount),
    };
  });
}

module.exports = {
  listPayoutReconciliationsForJob,
};
