const crypto = require("crypto");
const { paymentBaseUrl, frontendBaseUrl } = require("./paymentConfig");

const PAYFAST_IPS = [
  "197.97.145.144",
  "197.97.145.145",
  "197.97.145.146",
  "197.97.145.147",
  "197.97.145.148",
  "41.74.179.192",
  "41.74.179.193",
  "41.74.179.194",
  "41.74.179.195",
  "41.74.179.196",
  "41.74.179.197",
  "41.74.179.198",
  "41.74.179.199",
  "41.74.179.200",
  "41.74.179.201",
  "41.74.179.202",
  "41.74.179.203",
  "41.74.179.204",
  "41.74.179.205",
];

function isSandbox() {
  return String(process.env.PAYFAST_MODE || "sandbox").toLowerCase() !== "live";
}

function processUrl() {
  return isSandbox()
    ? "https://sandbox.payfast.co.za/eng/process"
    : "https://www.payfast.co.za/eng/process";
}

function validateUrl() {
  return isSandbox()
    ? "https://sandbox.payfast.co.za/eng/query/validate"
    : "https://www.payfast.co.za/eng/query/validate";
}

/** PayFast checkout signature field order (NOT alphabetical — see PayFast custom integration docs). */
const CHECKOUT_FIELD_ORDER = [
  "merchant_id",
  "merchant_key",
  "return_url",
  "cancel_url",
  "notify_url",
  "name_first",
  "name_last",
  "email_address",
  "cell_number",
  "m_payment_id",
  "amount",
  "item_name",
  "item_description",
  "custom_int1",
  "custom_int2",
  "custom_int3",
  "custom_int4",
  "custom_int5",
  "custom_str1",
  "custom_str2",
  "custom_str3",
  "custom_str4",
  "custom_str5",
  "email_confirmation",
  "confirmation_address",
  "payment_method",
  "subscription_type",
  "billing_date",
  "recurring_amount",
  "frequency",
  "cycles",
];

function encodeValue(val) {
  return encodeURIComponent(String(val).trim()).replace(/%20/g, "+");
}

function buildParamString(data, passphrase, orderedKeys) {
  const parts = [];
  for (const key of orderedKeys) {
    if (key === "signature") continue;
    const val = data[key];
    if (val === "" || val == null || String(val).trim() === "") continue;
    parts.push(`${key}=${encodeValue(val)}`);
  }
  let paramString = parts.join("&");
  if (passphrase) {
    paramString += `&passphrase=${encodeValue(passphrase)}`;
  }
  return paramString;
}

/** Checkout form signature — field order per PayFast custom integration docs (not alphabetical). */
function buildSignature(data, passphrase) {
  const paramString = buildParamString(data, passphrase, CHECKOUT_FIELD_ORDER);
  return crypto.createHash("md5").update(paramString).digest("hex");
}

/** ITN/webhook signature — preserve posted field order (PayFast notification format). */
function buildItnSignature(data, passphrase) {
  const orderedKeys = Object.keys(data).filter((k) => k !== "signature");
  const paramString = buildParamString(data, passphrase, orderedKeys);
  return crypto.createHash("md5").update(paramString).digest("hex");
}

function isConfigured() {
  return Boolean(
    process.env.PAYFAST_MERCHANT_ID &&
      process.env.PAYFAST_MERCHANT_KEY &&
      (isSandbox() || process.env.PAYFAST_PASSPHRASE)
  );
}

/**
 * @param {object} intent
 * @param {object} customer
 */
function createCheckout(intent, customer) {
  const merchantId = process.env.PAYFAST_MERCHANT_ID;
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
  const passphrase = process.env.PAYFAST_PASSPHRASE || "";
  const notifyUrl =
    process.env.PAYFAST_NOTIFY_URL || `${paymentBaseUrl()}/api/payments/webhooks/payfast`;
  const returnUrl =
    intent.returnUrl ||
    process.env.PAYFAST_RETURN_URL ||
    `${frontendBaseUrl()}/payments/return?intentId=${intent.id}`;
  const cancelUrl =
    intent.cancelUrl ||
    process.env.PAYFAST_CANCEL_URL ||
    `${frontendBaseUrl()}/payments/cancel?intentId=${intent.id}`;

  const amount = Number(intent.amount).toFixed(2);
  const fields = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: returnUrl,
    cancel_url: cancelUrl,
    notify_url: notifyUrl,
    name_first: (customer?.name || "Customer").split(" ")[0] || "Customer",
    name_last: (customer?.name || "User").split(" ").slice(1).join(" ") || "User",
    email_address: customer?.email || "customer@elofix.local",
    m_payment_id: intent.merchantReference,
    amount,
    item_name: `EloFix ${intent.kind}`,
    custom_str1: intent.id,
    custom_str2: intent.kind,
  };
  // PayFast custom_int* must be numeric; our IDs are UUID/text, so keep them in string slots.
  if (intent.jobId) fields.custom_str3 = String(intent.jobId);
  if (intent.materialOrderId) fields.custom_str4 = String(intent.materialOrderId);

  fields.signature = buildSignature(fields, passphrase);

  return {
    type: "redirect",
    url: processUrl(),
    formFields: fields,
    method: "POST",
  };
}

function verifySignature(data, passphrase) {
  const received = String(data.signature || "");
  const expected = buildItnSignature(data, passphrase || "");
  return received === expected;
}

function isPayfastIp(ip) {
  if (process.env.PAYFAST_SKIP_IP_CHECK === "true") return true;
  const clean = String(ip || "").replace("::ffff:", "");
  return PAYFAST_IPS.includes(clean);
}

async function validateItnServerSide(data) {
  const body = new URLSearchParams();
  Object.entries(data).forEach(([k, v]) => {
    if (k !== "signature" && v != null) body.append(k, String(v));
  });
  const res = await fetch(validateUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  return text.trim() === "VALID";
}

/**
 * @param {Record<string, string>} data
 * @param {string} [clientIp]
 */
async function verifyWebhook(data, clientIp) {
  const passphrase = process.env.PAYFAST_PASSPHRASE || "";
  if (!verifySignature(data, passphrase)) {
    return { valid: false };
  }
  if (!isPayfastIp(clientIp)) {
    return { valid: false };
  }
  let serverValid = true;
  try {
    serverValid = await validateItnServerSide(data);
  } catch {
    serverValid = false;
  }
  if (!serverValid) {
    return { valid: false };
  }

  const status = String(data.payment_status || "").toUpperCase();
  let state = "PROCESSING";
  if (status === "COMPLETE") state = "PAID";
  else if (status === "FAILED") state = "FAILED";
  else if (status === "CANCELLED") state = "CANCELLED";

  return {
    valid: true,
    merchantReference: data.m_payment_id,
    gatewayTransactionId: data.pf_payment_id,
    state,
    amount: Number(data.amount_gross || data.amount || 0),
    externalEventId: `${data.pf_payment_id || data.m_payment_id}-${status}`,
    raw: data,
  };
}

async function refund() {
  return { supported: false, message: "PayFast refunds are processed via merchant dashboard" };
}

module.exports = {
  name: "PAYFAST",
  isConfigured,
  createCheckout,
  verifyWebhook,
  refund,
  buildSignature,
  buildItnSignature,
};
