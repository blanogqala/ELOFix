const crypto = require("crypto");
const AppError = require("../../utils/AppError");
const { frontendBaseUrl, isPaystackConfigured, assertPaystackCredentials } = require("./paymentConfig");
const { paystackRequest, readSecret, redactDeep } = require("./paystack.client");
const { fromCents } = require("./money.util");
const {
  ELOFIX_GROSS_COMMISSION_PERCENT,
  buildCheckoutInitializePayload,
  buildCreateSubaccountPayload,
  buildUpdateSubaccountPayload,
  buildCreateRefundPayload,
  mapPaystackRefundResult,
  alreadySplitSettlementResult,
  isPaystackSubaccountCode,
  mapPaystackChargeEventState,
  sanitizePaystackWebhookRaw,
  extractPaystackSplitEvidence,
} = require("./paystack.payload");
const {
  fetchSouthAfricanBanks,
  resolvePaystackBankCode,
  assertBankCodeNotBlindBranchCode,
} = require("./paystack.banks");
const paystackRecipient = require("./paystack.recipient");

function isConfigured(env = process.env) {
  return isPaystackConfigured(env);
}

function checkoutReturnUrl(intent) {
  return (
    intent?.returnUrl ||
    `${frontendBaseUrl()}/payments/return?intentId=${intent?.id || ""}`
  );
}

async function resolveBankCodeForProfile(profile) {
  const stored = String(
    profile?.paystackBankCode ||
      profile?.gatewayProfilePayload?.paystackBankCode ||
      profile?.gatewayProfilePayload?.bank_code ||
      ""
  ).trim();
  const listed = await fetchSouthAfricanBanks(paystackRequest);
  const bankCode = resolvePaystackBankCode(listed.banks, profile?.bankName, stored || null);
  const fromList = Boolean(
    listed.banks.some((b) => String(b.code || "").trim() === String(bankCode || "").trim())
  );
  assertBankCodeNotBlindBranchCode(bankCode, profile?.branchCode, fromList);
  if (!bankCode) {
    const err = new Error("Could not map bankName to a Paystack bank_code");
    err.code = "PAYSTACK_BANK_CODE_UNRESOLVED";
    throw err;
  }
  return bankCode;
}

function destinationResult(data, bankCode) {
  const code = data?.subaccount_code || data?.subaccount || null;
  const verified = Boolean(data?.is_verified);
  const active = data?.active !== false;
  let status = "PENDING";
  if (!active) status = "DEACTIVATED";
  else if (verified) status = "VERIFIED";
  return {
    supported: true,
    recipientId: code,
    status,
    data: {
      subaccount_code: code,
      percentage_charge: data?.percentage_charge ?? ELOFIX_GROSS_COMMISSION_PERCENT,
      active,
      is_verified: verified,
      domain: data?.domain || null,
      paystackBankCode: bankCode || null,
      bank_code: bankCode || null,
    },
  };
}

/**
 * @param {object} intent
 * @param {object} customer
 */
async function createCheckout(intent, customer) {
  if (!isConfigured()) {
    throw new AppError("PAYSTACK is not configured", 503);
  }
  const subaccountCode = await paystackRecipient.lookupMarketplaceSubaccount(intent);
  let payload;
  try {
    payload = buildCheckoutInitializePayload(
      { ...intent, returnUrl: checkoutReturnUrl(intent) },
      customer,
      { subaccountCode }
    );
  } catch (err) {
    if (err.code === "PAYSTACK_RECIPIENT_REQUIRED") {
      throw new AppError("Paystack recipient is not configured", 400, err.code);
    }
    throw new AppError(err.message || "Paystack checkout failed", 400, err.code || "PAYSTACK_CHECKOUT");
  }

  const { json } = await paystackRequest("POST", "/transaction/initialize", payload);
  const data = json?.data || {};
  const url = data.authorization_url || data.checkout_url || data.url;
  if (!url) {
    throw new AppError("Paystack did not return checkout URL", 502, "PAYSTACK_CHECKOUT_URL");
  }
  return {
    type: "redirect",
    url,
    method: "GET",
    providerReference: data.access_code || data.reference || intent.merchantReference,
    status: "initialized",
  };
}

async function verifyTransaction(reference) {
  const ref = String(reference || "").trim();
  if (!ref) {
    throw new AppError("Paystack verification reference is required", 400, "PAYSTACK_REFERENCE_REQUIRED");
  }
  const { json } = await paystackRequest("GET", `/transaction/verify/${encodeURIComponent(ref)}`);
  const data = json?.data || {};
  const status = String(data.status || "").toLowerCase();
  let state = "PROCESSING";
  if (status === "success") state = "PAID";
  else if (status === "failed") state = "FAILED";
  else if (status === "abandoned" || status === "cancelled" || status === "canceled") state = "CANCELLED";
  const amountCents = data.amount != null ? Math.round(Number(data.amount)) : null;
  const splitEvidence = extractPaystackSplitEvidence(data);
  const raw = {
    event: "transaction.verify",
    reference: data.reference || ref,
    id: data.id != null ? data.id : null,
    status: data.status || null,
    amount: amountCents,
    currency: data.currency || "ZAR",
    channel: data.channel || null,
    verifySource: "paystack_transaction_verify",
    ...splitEvidence,
  };
  const last4 = data.authorization && typeof data.authorization === "object" ? data.authorization.last4 : null;
  const brand = data.authorization && typeof data.authorization === "object" ? data.authorization.brand : null;
  if (last4) {
    const digits = String(last4).replace(/\D/g, "").slice(-4);
    if (digits.length === 4) raw.card_last4 = digits;
  }
  if (brand) raw.card_brand = String(brand).trim();
  return {
    valid: true,
    merchantReference: data.reference || ref,
    gatewayTransactionId: data.id != null ? String(data.id) : data.reference || ref,
    state,
    amount: amountCents != null ? fromCents(amountCents) : undefined,
    amountCents: Number.isFinite(amountCents) ? amountCents : undefined,
    currency: String(data.currency || "ZAR").trim().toUpperCase() || "ZAR",
    status: data.status || null,
    subaccount: splitEvidence.subaccount || null,
    raw,
    data: redactDeep({
      status: data.status,
      reference: data.reference,
      amount: data.amount,
      currency: data.currency,
      channel: data.channel,
      subaccount: splitEvidence.subaccount || null,
    }),
  };
}

function verifyWebhookSignature(rawBody, signatureHeader, env = process.env) {
  const secret = readSecret(env);
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const received = String(signatureHeader || "").trim();
  if (!received || expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

/**
 * Parse/verify primitive only. Production settlement uses handlePaystackWebhook
 * which re-verifies the transaction server-side after this signature check.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signatureHeader
 */
function verifyWebhook(rawBody, signatureHeader) {
  if (!verifyWebhookSignature(rawBody, signatureHeader)) {
    return { valid: false };
  }
  let body;
  try {
    body = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody));
  } catch {
    return { valid: false };
  }
  const event = String(body.event || "").toLowerCase();
  const data = body.data && typeof body.data === "object" ? body.data : {};
  const state = mapPaystackChargeEventState(event) || "PROCESSING";
  const raw = sanitizePaystackWebhookRaw(body);

  return {
    valid: true,
    merchantReference: data.reference || null,
    gatewayTransactionId: data.id != null ? String(data.id) : data.reference || null,
    state,
    amount: data.amount != null ? Number(data.amount) / 100 : undefined,
    externalEventId: String(body.id || `${data.reference || "paystack"}-${event || "event"}`),
    raw,
  };
}

/**
 * Refund the original Paystack customer transaction.
 * @param {string} gatewayTransactionIdOrReference
 * @param {number} [amountZar]
 */
async function refund(gatewayTransactionIdOrReference, amountZar) {
  const transaction = String(gatewayTransactionIdOrReference || "").trim();
  if (!transaction) {
    return {
      supported: true,
      ok: false,
      pending: false,
      status: "FAILED",
      requiresManualAction: false,
      message: "missing_gateway_transaction_id",
    };
  }
  const payload = buildCreateRefundPayload({
    transaction,
    amountMajor: amountZar == null || amountZar === "" ? null : amountZar,
    currency: "ZAR",
  });
  try {
    const { json, httpStatus } = await paystackRequest("POST", "/refund", payload);
    return mapPaystackRefundResult(json, httpStatus >= 200 && httpStatus < 300);
  } catch (err) {
    return {
      supported: true,
      ok: false,
      pending: false,
      status: "FAILED",
      requiresManualAction: false,
      message: err.message || "paystack_refund_failed",
      data: err.paystack || null,
    };
  }
}

async function verifyRefund(refundId) {
  const id = String(refundId || "").trim();
  if (!id) {
    return {
      supported: true,
      ok: false,
      pending: false,
      status: "FAILED",
      requiresManualAction: false,
      message: "missing_refund_id",
    };
  }
  try {
    const { json, httpStatus } = await paystackRequest("GET", `/refund/${encodeURIComponent(id)}`);
    return mapPaystackRefundResult(json, httpStatus >= 200 && httpStatus < 300);
  } catch (err) {
    return {
      supported: true,
      ok: false,
      pending: false,
      status: "VERIFY_FAILED",
      requiresManualAction: false,
      message: "paystack_refund_verify_failed",
      data: err.paystack || null,
    };
  }
}

async function createPayoutDestination(profile) {
  try {
    const bankCode = await resolveBankCodeForProfile(profile);
    const payload = buildCreateSubaccountPayload({
      businessName: profile?.accountHolder || profile?.businessName || "EloFix recipient",
      bankCode,
      accountNumber: profile?.accountNumber,
      percentageCharge: ELOFIX_GROSS_COMMISSION_PERCENT,
    });
    const { json } = await paystackRequest("POST", "/subaccount", payload);
    return destinationResult(json?.data || {}, bankCode);
  } catch (err) {
    return {
      supported: false,
      requiresManualAction: true,
      message: err.message || "Paystack subaccount create failed",
      data: err.paystack || { code: err.code || "PAYSTACK_SUBACCOUNT" },
    };
  }
}

async function updatePayoutDestination(recipientId, profile) {
  const code = String(recipientId || "").trim();
  if (!isPaystackSubaccountCode(code)) {
    return { supported: false, requiresManualAction: true, message: "invalid_subaccount_code" };
  }
  try {
    const bankCode = await resolveBankCodeForProfile(profile || {});
    const payload = buildUpdateSubaccountPayload({
      businessName: profile?.accountHolder || profile?.businessName,
      bankCode,
      accountNumber: profile?.accountNumber,
      percentageCharge: ELOFIX_GROSS_COMMISSION_PERCENT,
      active: true,
    });
    const { json } = await paystackRequest("PUT", `/subaccount/${encodeURIComponent(code)}`, payload);
    return destinationResult(json?.data || { subaccount_code: code }, bankCode);
  } catch (err) {
    return {
      supported: false,
      requiresManualAction: true,
      message: err.message || "Paystack subaccount update failed",
      data: err.paystack || { code: err.code || "PAYSTACK_SUBACCOUNT" },
    };
  }
}

async function deactivatePayoutDestination(recipientId) {
  const code = String(recipientId || "").trim();
  if (!code) return { supported: true, message: "no_recipient" };
  if (!isPaystackSubaccountCode(code)) {
    return { supported: false, requiresManualAction: true, message: "invalid_subaccount_code" };
  }
  try {
    await paystackRequest("PUT", `/subaccount/${encodeURIComponent(code)}`, { active: false });
    return { supported: true, status: "DEACTIVATED" };
  } catch (err) {
    return {
      supported: false,
      message: err.message || "Paystack subaccount deactivation failed",
    };
  }
}

async function getPayoutDestinationStatus(recipientId) {
  const code = String(recipientId || "").trim();
  if (!code) return { supported: false, status: null };
  if (!isPaystackSubaccountCode(code)) {
    return { supported: false, requiresManualAction: true, status: null, message: "invalid_subaccount_code" };
  }
  try {
    const { json } = await paystackRequest("GET", `/subaccount/${encodeURIComponent(code)}`);
    const mapped = destinationResult(json?.data || { subaccount_code: code });
    return { supported: true, status: mapped.status, recipientId: mapped.recipientId };
  } catch (err) {
    return { supported: false, status: null, message: err.message };
  }
}

function supportsMarketplaceSettlement() {
  return true;
}

async function createProviderSettlement(intent) {
  return alreadySplitSettlementResult(intent);
}

async function createSupplierSettlement(intent) {
  return alreadySplitSettlementResult(intent);
}

async function getSettlementStatus(settlementId) {
  return {
    supported: true,
    alreadySplitAtCharge: true,
    status: "COMPLETE",
    settlementId: settlementId || null,
    message: "paystack_split_at_charge_no_transfer",
  };
}

async function verifySettlementWebhook() {
  return { valid: false };
}

module.exports = {
  name: "PAYSTACK",
  isConfigured,
  createCheckout,
  verifyTransaction,
  verifyWebhook,
  verifyWebhookSignature,
  refund,
  verifyRefund,
  supportsMarketplaceSettlement,
  createPayoutDestination,
  updatePayoutDestination,
  deactivatePayoutDestination,
  getPayoutDestinationStatus,
  createBranchPayoutDestination: async (profile) => createPayoutDestination(profile),
  createProviderSettlement,
  createSupplierSettlement,
  getSettlementStatus,
  verifySettlementWebhook,
  assertPaystackCredentials,
};
