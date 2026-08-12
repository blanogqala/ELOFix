const crypto = require("crypto");
const { paymentBaseUrl, frontendBaseUrl } = require("./paymentConfig");

let tokenCache = { token: null, expiresAt: 0 };

function isSandbox() {
  return String(process.env.PAYFLEX_MODE || "sandbox").toLowerCase() !== "live";
}

function apiBase() {
  return isSandbox() ? "https://api.uat.payflex.co.za" : "https://api.payflex.co.za";
}

function isConfigured() {
  return Boolean(process.env.PAYFLEX_CLIENT_ID && process.env.PAYFLEX_CLIENT_SECRET);
}

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.token;
  }
  const clientId = process.env.PAYFLEX_CLIENT_ID;
  const clientSecret = process.env.PAYFLEX_CLIENT_SECRET;
  const res = await fetch(`${apiBase()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error || "Payflex auth failed");
  }
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000,
  };
  return tokenCache.token;
}

/**
 * @param {object} intent
 * @param {object} customer
 */
async function createCheckout(intent, customer) {
  const token = await getAccessToken();
  const returnUrl =
    intent.returnUrl ||
    `${frontendBaseUrl()}/payments/return?intentId=${intent.id}`;
  const cancelUrl =
    intent.cancelUrl ||
    `${frontendBaseUrl()}/payments/cancel?intentId=${intent.id}`;
  const webhookUrl =
    process.env.PAYFLEX_WEBHOOK_URL || `${paymentBaseUrl()}/api/payments/webhooks/payflex`;

  const payload = {
    merchantReference: intent.merchantReference,
    amount: Number(intent.amount),
    currency: intent.currency || "ZAR",
    redirectUrl: returnUrl,
    cancelUrl,
    webhookUrl,
    metadata: {
      intentId: intent.id,
      kind: intent.kind,
      jobId: intent.jobId,
      materialOrderId: intent.materialOrderId,
    },
    customer: {
      email: customer?.email,
      firstName: (customer?.name || "Customer").split(" ")[0],
      lastName: (customer?.name || "User").split(" ").slice(1).join(" ") || "User",
    },
  };

  const res = await fetch(`${apiBase()}/v1/checkout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error || "Payflex checkout failed");
  }
  const url = json.redirectUrl || json.checkoutUrl || json.url;
  if (!url) {
    throw new Error("Payflex did not return checkout URL");
  }
  return { type: "redirect", url, method: "GET" };
}

function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = String(process.env.PAYFLEX_WEBHOOK_SECRET || "").trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = String(signatureHeader || "").replace(/^sha256=/i, "").trim();
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

/**
 * @param {Buffer} rawBody
 * @param {string|undefined} signatureHeader
 */
function verifyWebhook(rawBody, signatureHeader) {
  if (!verifyWebhookSignature(rawBody, signatureHeader)) {
    return { valid: false };
  }
  let body;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { valid: false };
  }
  const status = String(body.status || body.orderStatus || "").toLowerCase();
  let state = "PROCESSING";
  if (["approved", "complete", "completed", "paid"].includes(status)) state = "PAID";
  else if (["declined", "failed"].includes(status)) state = "FAILED";
  else if (["cancelled", "canceled", "abandoned"].includes(status)) state = "CANCELLED";

  return {
    valid: true,
    merchantReference: body.merchantReference || body.reference,
    gatewayTransactionId: body.orderId || body.id,
    state,
    amount: Number(body.amount || 0),
    externalEventId: String(body.eventId || body.id || `${body.merchantReference}-${status}`),
    raw: body,
  };
}

async function refund(gatewayTransactionId, amount) {
  const token = await getAccessToken();
  const res = await fetch(`${apiBase()}/v1/orders/${encodeURIComponent(gatewayTransactionId)}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: Number(amount) }),
  });
  const json = await res.json().catch(() => ({}));
  return {
    supported: true,
    ok: res.ok,
    status: res.ok ? "COMPLETED" : "FAILED",
    externalRefundId: json?.refundId || json?.id || null,
    message: res.ok ? null : json?.message || `HTTP ${res.status}`,
    requiresManualAction: false,
    data: json,
  };
}

module.exports = {
  name: "PAYFLEX",
  isConfigured,
  createCheckout,
  verifyWebhook,
  refund,
  supportsMarketplaceSettlement: () => false,
  createPayoutDestination: async () => ({
    supported: false,
    requiresManualAction: true,
    message: "Payflex marketplace payout destinations are not supported",
  }),
  updatePayoutDestination: async () => ({
    supported: false,
    requiresManualAction: true,
    message: "Payflex marketplace payout destinations are not supported",
  }),
  deactivatePayoutDestination: async () => ({
    supported: false,
    message: "Payflex payout deactivation is not supported",
  }),
  getPayoutDestinationStatus: async () => ({ supported: false }),
  createBranchPayoutDestination: async (profile) =>
    module.exports.createPayoutDestination(profile),
  createProviderSettlement: async () => ({
    supported: false,
    requiresManualAction: true,
    message: "Payflex marketplace provider settlement is not supported",
  }),
  createSupplierSettlement: async () => ({
    supported: false,
    requiresManualAction: true,
    message: "Payflex marketplace branch settlement is not supported",
  }),
  getSettlementStatus: async () => ({ supported: false }),
  verifySettlementWebhook: async () => ({ valid: false }),
};
