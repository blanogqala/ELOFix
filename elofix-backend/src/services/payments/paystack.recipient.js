const { isPaystackSubaccountCode, isMarketplaceSplitKind, isRepaymentKind } = require("./paystack.payload");

function extractSubaccount(profile) {
  if (!profile || profile.isActive === false) return null;
  const provider = String(profile.gatewayProvider || "").trim().toUpperCase();
  if (provider && provider !== "PAYSTACK") return null;
  const code = String(profile.gatewayRecipientId || "").trim();
  if (!isPaystackSubaccountCode(code)) return null;
  return code;
}

function checkoutMetaFromIntent(intent) {
  const p =
    intent?.gatewayPayload && typeof intent.gatewayPayload === "object" && !Array.isArray(intent.gatewayPayload)
      ? intent.gatewayPayload
      : {};
  return p;
}

function recipientRequiredError(message) {
  const err = new Error(message);
  err.code = "PAYSTACK_RECIPIENT_REQUIRED";
  return err;
}

function profileSelect() {
  return {
    gatewayRecipientId: true,
    gatewayProvider: true,
    isActive: true,
  };
}

async function lookupProviderSubaccountByUserId(prisma, userId) {
  if (!userId) return null;
  const provider = await prisma.provider.findUnique({
    where: { userId: String(userId) },
    select: { id: true },
  });
  if (!provider) return null;
  const profile = await prisma.providerWithdrawalProfile.findUnique({
    where: { providerId: provider.id },
    select: profileSelect(),
  });
  return extractSubaccount(profile);
}

async function lookupBranchSubaccount(prisma, branchId) {
  if (!branchId) return null;
  const profile = await prisma.branchWithdrawalProfile.findUnique({
    where: { branchId: String(branchId) },
    select: profileSelect(),
  });
  return extractSubaccount(profile);
}

/**
 * Courier vs store delivery follows settleDeliveryFeeFromIntent:
 * gatewayPayload.deliveryRequestId → courier; else materialOrderId + STORE_DELIVERY → branch.
 */
async function lookupDeliverySubaccount(intent, prisma) {
  const meta = checkoutMetaFromIntent(intent);
  const deliveryRequestId = String(meta.deliveryRequestId || "").trim();

  if (deliveryRequestId) {
    const dr = await prisma.deliveryRequest.findUnique({
      where: { id: deliveryRequestId },
      select: { courierId: true },
    });
    if (!dr?.courierId) {
      throw recipientRequiredError("Paystack courier recipient cannot be resolved");
    }
    const code = await lookupProviderSubaccountByUserId(prisma, dr.courierId);
    if (!code) {
      throw recipientRequiredError("Paystack courier recipient is not configured");
    }
    return code;
  }

  if (intent?.materialOrderId) {
    const order = await prisma.materialOrder.findUnique({
      where: { id: String(intent.materialOrderId) },
      select: { branchId: true, payload: true },
    });
    if (!order) {
      throw recipientRequiredError("Paystack delivery recipient cannot be resolved");
    }
    const payload = order.payload && typeof order.payload === "object" ? order.payload : {};
    const deliveryType = String(payload.deliveryType || "").toUpperCase();
    if (deliveryType === "STORE_DELIVERY") {
      const code = await lookupBranchSubaccount(prisma, order.branchId);
      if (!code) {
        throw recipientRequiredError("Paystack store-delivery recipient is not configured");
      }
      return code;
    }
    throw recipientRequiredError("Paystack delivery recipient cannot be resolved");
  }

  throw recipientRequiredError("Paystack delivery recipient cannot be resolved");
}

/**
 * Match a job store-order batch by orderId only. Never pick the first of many.
 */
function matchJobStoreOrderByOrderId(storeOrders, orderIdHint) {
  const oid = String(orderIdHint || "").trim();
  if (!oid) return { match: null, reason: "missing_order_id" };
  const matches = (Array.isArray(storeOrders) ? storeOrders : []).filter(
    (o) => o && typeof o === "object" && String(o.orderId || "") === oid
  );
  if (matches.length === 1) return { match: matches[0], reason: null };
  if (matches.length > 1) return { match: null, reason: "ambiguous_order_id" };
  return { match: null, reason: "order_not_found" };
}

function branchIdFromStoreOrder(order) {
  const branchId = String(order?.branchId || "").trim();
  if (branchId) return branchId;
  const storeId = String(order?.storeId || "").trim();
  return storeId || null;
}

async function lookupJobStoreSubaccount(intent, prisma) {
  if (intent?.materialOrderId) {
    const order = await prisma.materialOrder.findUnique({
      where: { id: String(intent.materialOrderId) },
      select: { branchId: true },
    });
    if (!order?.branchId) {
      throw recipientRequiredError("Paystack job-store recipient cannot be resolved");
    }
    const code = await lookupBranchSubaccount(prisma, order.branchId);
    if (!code) {
      throw recipientRequiredError("Paystack job-store recipient is not configured");
    }
    return code;
  }

  const meta = checkoutMetaFromIntent(intent);
  const orderIdHint = String(meta.orderId || "").trim();
  if (!orderIdHint) {
    throw recipientRequiredError("Paystack job-store recipient cannot be resolved");
  }

  const existingMo = await prisma.materialOrder.findUnique({
    where: { id: orderIdHint },
    select: { branchId: true },
  });
  if (existingMo?.branchId) {
    const code = await lookupBranchSubaccount(prisma, existingMo.branchId);
    if (!code) {
      throw recipientRequiredError("Paystack job-store recipient is not configured");
    }
    return code;
  }

  const jobId = intent?.jobId ? String(intent.jobId) : "";
  if (!jobId) {
    throw recipientRequiredError("Paystack job-store recipient cannot be resolved");
  }
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { meta: true },
  });
  const storeOrders = Array.isArray(job?.meta?.storeOrders) ? job.meta.storeOrders : [];
  const { match, reason } = matchJobStoreOrderByOrderId(storeOrders, orderIdHint);
  if (!match) {
    throw recipientRequiredError(
      reason === "ambiguous_order_id"
        ? "Paystack job-store recipient cannot be resolved"
        : "Paystack job-store recipient cannot be resolved"
    );
  }
  const branchId = branchIdFromStoreOrder(match);
  if (!branchId) {
    throw recipientRequiredError("Paystack job-store recipient cannot be resolved");
  }
  const code = await lookupBranchSubaccount(prisma, branchId);
  if (!code) {
    throw recipientRequiredError("Paystack job-store recipient is not configured");
  }
  return code;
}

/**
 * Look up the Paystack subaccount already stored on provider/branch withdrawal profiles.
 * Reuses gatewayRecipientId. Does not create a parallel recipient model.
 */
async function lookupMarketplaceSubaccount(intent, prismaClient) {
  const kind = String(intent?.kind || "").trim().toUpperCase();
  if (isRepaymentKind(kind)) {
    return null;
  }
  const prisma = prismaClient || require("../../config/prisma");

  if (kind === "LABOR") {
    if (!intent?.jobId) return null;
    const job = await prisma.job.findUnique({
      where: { id: String(intent.jobId) },
      select: { providerId: true },
    });
    if (!job?.providerId) return null;
    return lookupProviderSubaccountByUserId(prisma, job.providerId);
  }

  if (kind === "MATERIAL_ORDER") {
    if (!intent?.materialOrderId) return null;
    const order = await prisma.materialOrder.findUnique({
      where: { id: String(intent.materialOrderId) },
      select: { branchId: true },
    });
    if (!order?.branchId) return null;
    return lookupBranchSubaccount(prisma, order.branchId);
  }

  if (kind === "JOB_STORE_ORDER") {
    return lookupJobStoreSubaccount(intent, prisma);
  }

  if (kind === "DELIVERY_FEE") {
    return lookupDeliverySubaccount(intent, prisma);
  }

  if (!isMarketplaceSplitKind(kind)) {
    return null;
  }
  return null;
}

module.exports = {
  extractSubaccount,
  checkoutMetaFromIntent,
  matchJobStoreOrderByOrderId,
  branchIdFromStoreOrder,
  lookupMarketplaceSubaccount,
  lookupDeliverySubaccount,
  lookupJobStoreSubaccount,
};
