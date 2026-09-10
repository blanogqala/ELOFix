const crypto = require("crypto");
const { paymentBaseUrl, frontendBaseUrl } = require("./paymentConfig");
const { isIpv4InCidrs, normalizeIpv4 } = require("../../utils/ipv4Cidr.util");
const {
  payfastUrlEncode,
  parsePayfastFormPairs,
  buildPayfastParamString,
} = require("../../utils/payfastEncode.util");

/** Official PayFast ITN source ranges (developer docs). Match whole CIDRs, not a partial host list. */
const PAYFAST_IP_CIDRS = [
  "197.97.145.144/28",
  "41.74.179.192/27",
  "102.216.36.0/28",
  "102.216.36.128/28",
  "144.126.193.139/32",
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

function buildParamString(data, passphrase, orderedKeys) {
  const entries = [];
  for (const key of orderedKeys) {
    entries.push({ key, value: data[key] });
  }
  return buildPayfastParamString(entries, passphrase, {
    trimValues: true,
    skipEmpty: true,
    stopAtSignature: false,
  });
}

function md5Hex(paramString) {
  return crypto.createHash("md5").update(paramString, "utf8").digest("hex");
}

function signaturesMatch(received, expected) {
  const left = String(received || "").toLowerCase();
  const right = String(expected || "").toLowerCase();
  if (!left || left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
  } catch {
    return false;
  }
}

/** Checkout form signature — field order per PayFast custom integration docs (not alphabetical). */
function buildSignature(data, passphrase) {
  const paramString = buildParamString(data, passphrase, CHECKOUT_FIELD_ORDER);
  return md5Hex(paramString);
}

const ITN_PF_PARAM_OPTIONS = {
  trimValues: true,
  skipEmpty: false,
  stopAtSignature: true,
};

/** Posted ITN fields in arrival order. No signature. No passphrase. */
function buildItnPfParamString(entries) {
  const withoutSecrets = (entries || []).filter(
    (entry) => entry && entry.key && entry.key !== "passphrase"
  );
  return buildPayfastParamString(withoutSecrets, "", ITN_PF_PARAM_OPTIONS);
}

function buildItnPfParamStringFromRaw(rawBody) {
  return buildItnPfParamString(parsePayfastFormPairs(rawBody));
}

function buildItnPfParamStringFromData(data) {
  const orderedKeys = Object.keys(data || {}).filter(
    (k) => k !== "signature" && k !== "passphrase"
  );
  return buildItnPfParamString(orderedKeys.map((key) => ({ key, value: data[key] })));
}

function appendItnPassphrase(pfParamString, passphrase) {
  const pass = passphrase == null ? "" : String(passphrase).trim();
  if (!pass) return pfParamString;
  return `${pfParamString}&passphrase=${payfastUrlEncode(pass)}`;
}

/** ITN/webhook signature — object-key order fallback when raw POST bytes are unavailable. */
function buildItnSignature(data, passphrase) {
  const orderedKeys = Object.keys(data || {}).filter((k) => k !== "signature");
  const paramString = buildParamString(data || {}, passphrase, orderedKeys);
  return md5Hex(paramString);
}

function buildItnSignatureFromRaw(rawBody, passphrase) {
  return md5Hex(appendItnPassphrase(buildItnPfParamStringFromRaw(rawBody), passphrase));
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

function verifySignature(data, passphrase, rawBody) {
  const received = String(data?.signature || "");
  const expected =
    rawBody != null && String(rawBody).length > 0
      ? buildItnSignatureFromRaw(rawBody, passphrase || "")
      : buildItnSignature(data, passphrase || "");
  return signaturesMatch(received, expected);
}

function isPayfastIp(ip) {
  const { payfastSkipIpCheckAllowed } = require("./paymentConfig");
  if (payfastSkipIpCheckAllowed()) return true;
  const clean = normalizeIpv4(ip);
  if (!clean) return false;
  return isIpv4InCidrs(clean, PAYFAST_IP_CIDRS);
}

async function validateItnServerSide(data, rawBody) {
  const body =
    rawBody != null && String(rawBody).length > 0
      ? buildItnPfParamStringFromRaw(rawBody)
      : buildItnPfParamStringFromData(data);
  const res = await fetch(validateUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  return text.trim() === "VALID";
}

/**
 * @param {Record<string, string>} data
 * @param {string} [clientIp]
 */
function emptyVerifyDiagnostics(data, extra = {}) {
  return {
    valid: false,
    merchantReference: data?.m_payment_id || null,
    signatureValid: false,
    ipValid: false,
    serverValid: null,
    ...extra,
  };
}

async function verifyWebhook(data, clientIp, rawBody) {
  const passphrase = process.env.PAYFAST_PASSPHRASE || "";
  const payload = data && typeof data === "object" ? data : {};
  const signatureValid = verifySignature(payload, passphrase, rawBody);
  const ipValid = isPayfastIp(clientIp);

  if (!signatureValid || !ipValid) {
    return emptyVerifyDiagnostics(payload, {
      failure: !signatureValid ? "BAD_SIGNATURE" : "BAD_SOURCE_IP",
      signatureValid,
      ipValid,
      serverValid: null,
    });
  }

  let serverValid = false;
  try {
    serverValid = await validateItnServerSide(payload, rawBody);
  } catch {
    serverValid = false;
  }
  if (!serverValid) {
    return emptyVerifyDiagnostics(payload, {
      failure: "PAYFAST_SERVER_VALIDATION_FAILURE",
      signatureValid: true,
      ipValid: true,
      serverValid: false,
    });
  }

  const status = String(payload.payment_status || "").toUpperCase();
  let state = "PROCESSING";
  if (status === "COMPLETE") state = "PAID";
  else if (status === "FAILED") state = "FAILED";
  else if (status === "CANCELLED") state = "CANCELLED";

  return {
    valid: true,
    failure: null,
    signatureValid: true,
    ipValid: true,
    serverValid: true,
    merchantReference: payload.m_payment_id,
    gatewayTransactionId: payload.pf_payment_id,
    state,
    amount: Number(payload.amount_gross || payload.amount || 0),
    externalEventId: `${payload.pf_payment_id || payload.m_payment_id}-${status}`,
    raw: payload,
  };
}

async function refund() {
  return {
    supported: false,
    ok: false,
    status: "MANUAL_REQUIRED",
    requiresManualAction: true,
    message: "PayFast refunds are processed via merchant dashboard",
  };
}

function supportsMarketplaceSettlement() {
  return false;
}

async function createBranchPayoutDestination(profile) {
  return createPayoutDestination(profile);
}

async function createPayoutDestination() {
  return {
    supported: false,
    requiresManualAction: true,
    message: "PayFast marketplace payout destinations are not supported",
  };
}

async function updatePayoutDestination() {
  return createPayoutDestination();
}

async function deactivatePayoutDestination() {
  return { supported: false, message: "PayFast payout deactivation is not supported" };
}

async function getPayoutDestinationStatus() {
  return { supported: false };
}

async function createProviderSettlement() {
  return {
    supported: false,
    requiresManualAction: true,
    message: "PayFast marketplace provider settlement is not supported",
  };
}

async function createSupplierSettlement() {
  return {
    supported: false,
    requiresManualAction: true,
    message: "PayFast marketplace branch settlement is not supported",
  };
}

async function getSettlementStatus() {
  return { supported: false };
}

async function verifySettlementWebhook() {
  return { valid: false };
}

module.exports = {
  name: "PAYFAST",
  PAYFAST_IP_CIDRS,
  isConfigured,
  createCheckout,
  verifyWebhook,
  isPayfastIp,
  refund,
  buildSignature,
  buildItnSignature,
  buildItnSignatureFromRaw,
  buildItnPfParamStringFromRaw,
  validateItnServerSide,
  payfastUrlEncode,
  supportsMarketplaceSettlement,
  createPayoutDestination,
  updatePayoutDestination,
  deactivatePayoutDestination,
  getPayoutDestinationStatus,
  createBranchPayoutDestination,
  createProviderSettlement,
  createSupplierSettlement,
  getSettlementStatus,
  verifySettlementWebhook,
};
