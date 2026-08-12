const crypto = require("crypto");
const { frontendBaseUrl } = require("./paymentConfig");

function isSandbox() {
  return String(process.env.PAYJUSTNOW_MODE || "sandbox").toLowerCase() !== "live";
}

function apiBase() {
  return isSandbox() ? "https://sandbox.payjustnow.com" : "https://api.payjustnow.com";
}

function isConfigured() {
  return Boolean(process.env.PAYJUSTNOW_MERCHANT_KEY);
}

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.PAYJUSTNOW_MERCHANT_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * @param {object} intent
 * @param {object} customer
 */
async function createCheckout(intent, customer) {
  const successUrl =
    intent.returnUrl ||
    `${frontendBaseUrl()}/payments/return?intentId=${intent.id}`;
  const errorUrl =
    intent.cancelUrl ||
    `${frontendBaseUrl()}/payments/cancel?intentId=${intent.id}`;

  const payload = {
    merchant_reference: intent.merchantReference,
    amount: Math.round(Number(intent.amount) * 100),
    currency: intent.currency || "ZAR",
    customer: {
      email: customer?.email,
      first_name: (customer?.name || "Customer").split(" ")[0],
      last_name: (customer?.name || "User").split(" ").slice(1).join(" ") || "User",
      phone: customer?.phone || "",
    },
    order: {
      reference: intent.merchantReference,
      description: `EloFix ${intent.kind}`,
      metadata: {
        intentId: intent.id,
        jobId: intent.jobId,
        materialOrderId: intent.materialOrderId,
      },
    },
    return_urls: {
      success: successUrl,
      error: errorUrl,
      cancel: errorUrl,
    },
  };

  const res = await fetch(`${apiBase()}/api/v1/merchant/checkout`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error || "PayJustNow checkout failed");
  }
  const url = json.redirect_url || json.checkout_url || json.url;
  if (!url) {
    throw new Error("PayJustNow did not return checkout URL");
  }
  return { type: "redirect", url, method: "GET" };
}

function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = String(process.env.PAYJUSTNOW_WEBHOOK_SECRET || "").trim();
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
  const status = String(body.status || body.payment_status || "").toLowerCase();
  let state = "PROCESSING";
  if (["paid", "complete", "completed", "success"].includes(status)) state = "PAID";
  else if (["failed", "declined"].includes(status)) state = "FAILED";
  else if (["cancelled", "canceled"].includes(status)) state = "CANCELLED";

  return {
    valid: true,
    merchantReference: body.merchant_reference || body.merchantReference,
    gatewayTransactionId: body.transaction_id || body.id || body.token,
    state,
    amount: body.amount != null ? Number(body.amount) / (body.amount > 1000 ? 100 : 1) : undefined,
    externalEventId: String(body.event_id || body.id || `${body.merchant_reference}-${status}`),
    raw: body,
  };
}

/**
 * @param {string} gatewayTransactionId
 * @param {number} amountZar - Amount in ZAR (major units). Converted to cents for the API.
 */
async function refund(gatewayTransactionId, amountZar) {
  const amountCents = Math.round(Number(amountZar) * 100);
  const res = await fetch(`${apiBase()}/api/v1/merchant/refund`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      transaction_id: gatewayTransactionId,
      amount: amountCents,
    }),
  });
  const json = await res.json().catch(() => ({}));
  return {
    supported: true,
    ok: res.ok,
    status: res.ok ? "COMPLETED" : "FAILED",
    externalRefundId: json?.refund_id || json?.id || null,
    message: res.ok ? null : json?.message || `HTTP ${res.status}`,
    requiresManualAction: false,
    data: json,
  };
}

module.exports = {
  name: "PAYJUSTNOW",
  isConfigured,
  createCheckout,
  verifyWebhook,
  refund,
  supportsMarketplaceSettlement: () => false,
  createPayoutDestination: async () => ({
    supported: false,
    requiresManualAction: true,
    message: "PayJustNow marketplace payout destinations are not supported",
  }),
  updatePayoutDestination: async () => ({
    supported: false,
    requiresManualAction: true,
    message: "PayJustNow marketplace payout destinations are not supported",
  }),
  deactivatePayoutDestination: async () => ({
    supported: false,
    message: "PayJustNow payout deactivation is not supported",
  }),
  getPayoutDestinationStatus: async () => ({ supported: false }),
  createBranchPayoutDestination: async (profile) =>
    module.exports.createPayoutDestination(profile),
  createProviderSettlement: async () => ({
    supported: false,
    requiresManualAction: true,
    message: "PayJustNow marketplace provider settlement is not supported",
  }),
  createSupplierSettlement: async () => ({
    supported: false,
    requiresManualAction: true,
    message: "PayJustNow marketplace branch settlement is not supported",
  }),
  getSettlementStatus: async () => ({ supported: false }),
  verifySettlementWebhook: async () => ({ valid: false }),
};
