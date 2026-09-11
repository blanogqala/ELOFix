const { isPaystackSubaccountCode, isMarketplaceSplitKind, isNoSplitKind } = require("./paystack.payload");

function extractSubaccount(profile) {
  if (!profile || profile.isActive === false) return null;
  const provider = String(profile.gatewayProvider || "").trim().toUpperCase();
  if (provider && provider !== "PAYSTACK") return null;
  const code = String(profile.gatewayRecipientId || "").trim();
  if (!isPaystackSubaccountCode(code)) return null;
  return code;
}

/**
 * Look up the Paystack subaccount already stored on provider/branch withdrawal profiles.
 * Reuses gatewayRecipientId. Does not create a parallel recipient model.
 */
async function lookupMarketplaceSubaccount(intent, prismaClient) {
  const kind = String(intent?.kind || "").trim().toUpperCase();
  if (isNoSplitKind(kind) || !isMarketplaceSplitKind(kind)) {
    return null;
  }
  const prisma = prismaClient || require("../../config/prisma");

  if (kind === "LABOR" && intent.jobId) {
    const job = await prisma.job.findUnique({
      where: { id: String(intent.jobId) },
      select: { providerId: true },
    });
    if (!job?.providerId) return null;
    const provider = await prisma.provider.findUnique({
      where: { userId: String(job.providerId) },
      select: { id: true },
    });
    if (!provider) return null;
    const profile = await prisma.providerWithdrawalProfile.findUnique({
      where: { providerId: provider.id },
      select: {
        gatewayRecipientId: true,
        gatewayProvider: true,
        isActive: true,
      },
    });
    return extractSubaccount(profile);
  }

  if ((kind === "MATERIAL_ORDER" || kind === "JOB_STORE_ORDER") && intent.materialOrderId) {
    const order = await prisma.materialOrder.findUnique({
      where: { id: String(intent.materialOrderId) },
      select: { branchId: true },
    });
    if (!order?.branchId) return null;
    const profile = await prisma.branchWithdrawalProfile.findUnique({
      where: { branchId: String(order.branchId) },
      select: {
        gatewayRecipientId: true,
        gatewayProvider: true,
        isActive: true,
      },
    });
    return extractSubaccount(profile);
  }

  return null;
}

module.exports = {
  extractSubaccount,
  lookupMarketplaceSubaccount,
};
