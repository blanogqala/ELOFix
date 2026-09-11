const { toCents } = require("./money.util");

const ELOFIX_GROSS_COMMISSION_PERCENT = 7;
const PAYSTACK_API_BASE = "https://api.paystack.co";
const MARKETPLACE_SPLIT_KINDS = new Set(["LABOR", "MATERIAL_ORDER", "JOB_STORE_ORDER", "DELIVERY_FEE"]);
const REPAYMENT_KIND = "PROVIDER_REFUND_REPAYMENT";
const NO_SPLIT_KINDS = new Set([REPAYMENT_KIND]);
const PAYSTACK_CHARGE_SETTLEMENT_EVENTS = new Set(["charge.success", "charge.failed"]);

function isPaystackSubaccountCode(code) {
  return /^ACCT_/i.test(String(code || "").trim());
}

function isMarketplaceSplitKind(kind) {
  return MARKETPLACE_SPLIT_KINDS.has(String(kind || "").trim().toUpperCase());
}

function isRepaymentKind(kind) {
  return String(kind || "").trim().toUpperCase() === REPAYMENT_KIND;
}

function isNoSplitKind(kind) {
  return NO_SPLIT_KINDS.has(String(kind || "").trim().toUpperCase());
}

function buildCreateSubaccountPayload({
  businessName,
  bankCode,
  accountNumber,
  percentageCharge = ELOFIX_GROSS_COMMISSION_PERCENT,
} = {}) {
  return {
    business_name: String(businessName || "").trim(),
    settlement_bank: String(bankCode || "").trim(),
    account_number: String(accountNumber || "").trim(),
    percentage_charge: Number(percentageCharge),
  };
}

function buildUpdateSubaccountPayload({
  businessName,
  bankCode,
  accountNumber,
  percentageCharge = ELOFIX_GROSS_COMMISSION_PERCENT,
  active,
} = {}) {
  const payload = {
    percentage_charge: Number(percentageCharge),
  };
  if (businessName != null && String(businessName).trim()) {
    payload.business_name = String(businessName).trim();
  }
  if (bankCode != null && String(bankCode).trim()) {
    payload.settlement_bank = String(bankCode).trim();
  }
  if (accountNumber != null && String(accountNumber).trim()) {
    payload.account_number = String(accountNumber).trim();
  }
  if (typeof active === "boolean") {
    payload.active = active;
  }
  return payload;
}

function assertInitializeSplitPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("initialize payload required");
  }
  if (!payload.email) throw new Error("email is required");
  if (!Number.isInteger(payload.amount) || payload.amount <= 0) {
    throw new Error("amount must be a positive integer (cents)");
  }
  if (payload.currency !== "ZAR") throw new Error("currency must be ZAR");
  if (!payload.reference) throw new Error("reference is required");
  if (!payload.subaccount) throw new Error("subaccount is required");
  if (payload.bearer !== "subaccount") throw new Error('bearer must be "subaccount"');
  if (Object.prototype.hasOwnProperty.call(payload, "transaction_charge")) {
    throw new Error("transaction_charge must not be sent");
  }
  if (Object.prototype.hasOwnProperty.call(payload, "percentage_charge")) {
    throw new Error("percentage_charge must not be sent on initialize");
  }
  return true;
}

function assertInitializeRepaymentPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("initialize payload required");
  }
  if (!payload.email) throw new Error("email is required");
  if (!Number.isInteger(payload.amount) || payload.amount <= 0) {
    throw new Error("amount must be a positive integer (cents)");
  }
  if (payload.currency !== "ZAR") throw new Error("currency must be ZAR");
  if (!payload.reference) throw new Error("reference is required");
  if (Object.prototype.hasOwnProperty.call(payload, "subaccount")) {
    throw new Error("PROVIDER_REFUND_REPAYMENT must not send subaccount");
  }
  if (Object.prototype.hasOwnProperty.call(payload, "bearer")) {
    throw new Error("PROVIDER_REFUND_REPAYMENT must not send bearer");
  }
  if (Object.prototype.hasOwnProperty.call(payload, "percentage_charge")) {
    throw new Error("PROVIDER_REFUND_REPAYMENT must not send percentage_charge");
  }
  if (Object.prototype.hasOwnProperty.call(payload, "transaction_charge")) {
    throw new Error("transaction_charge must not be sent");
  }
  return true;
}

function buildBaseInitializePayload(intent, customer) {
  const amount = toCents(intent?.amount);
  const currency = String(intent?.currency || "ZAR").trim().toUpperCase() || "ZAR";
  const reference = String(intent?.merchantReference || "").trim();
  const email = String(customer?.email || "").trim();
  const kind = String(intent?.kind || "").trim().toUpperCase();
  const payload = {
    email,
    amount,
    currency,
    reference,
    metadata: {
      intentId: intent?.id || null,
      kind: kind || null,
      jobId: intent?.jobId || null,
      materialOrderId: intent?.materialOrderId || null,
    },
  };
  const callbackUrl = String(intent?.returnUrl || "").trim();
  if (callbackUrl) payload.callback_url = callbackUrl;
  return payload;
}

/**
 * Build Paystack initialize body. Marketplace split uses subaccount + bearer=subaccount.
 * PROVIDER_REFUND_REPAYMENT is the only kind that must go 100% to EloFix (no split).
 */
function buildCheckoutInitializePayload(intent, customer, { subaccountCode } = {}) {
  const kind = String(intent?.kind || "").trim().toUpperCase();
  const payload = buildBaseInitializePayload(intent, customer);
  if (!payload.email) {
    const err = new Error("Customer email is required for Paystack checkout");
    err.code = "PAYSTACK_EMAIL_REQUIRED";
    throw err;
  }
  if (!payload.reference) {
    const err = new Error("PaymentIntent merchantReference is required");
    err.code = "PAYSTACK_REFERENCE_REQUIRED";
    throw err;
  }
  if (!Number.isInteger(payload.amount) || payload.amount <= 0) {
    const err = new Error("Paystack amount must be a positive integer in cents");
    err.code = "PAYSTACK_AMOUNT_INVALID";
    throw err;
  }
  if (payload.currency !== "ZAR") {
    const err = new Error("Paystack currency must be ZAR");
    err.code = "PAYSTACK_CURRENCY_INVALID";
    throw err;
  }

  if (isNoSplitKind(kind)) {
    assertInitializeRepaymentPayload(payload);
    return payload;
  }

  if (isMarketplaceSplitKind(kind)) {
    if (!isPaystackSubaccountCode(subaccountCode)) {
      const err = new Error("Paystack recipient is not configured");
      err.code = "PAYSTACK_RECIPIENT_REQUIRED";
      throw err;
    }
    payload.subaccount = String(subaccountCode).trim();
    payload.bearer = "subaccount";
    assertInitializeSplitPayload(payload);
    return payload;
  }

  const err = new Error("Unsupported Paystack payment kind");
  err.code = "PAYSTACK_KIND_UNSUPPORTED";
  throw err;
}

function buildCreateRefundPayload({ transaction, amountMajor = null, currency = "ZAR" } = {}) {
  const payload = {
    transaction: String(transaction || "").trim(),
    currency: String(currency || "ZAR").trim().toUpperCase(),
  };
  if (amountMajor != null && amountMajor !== "") {
    payload.amount = toCents(amountMajor);
  }
  return payload;
}

/**
 * Map Paystack refund API status into the EloFix gateway.refund contract.
 * pending must NOT be treated as final money movement (ok: false).
 */
function mapPaystackRefundResult(json, httpOk) {
  const data = json && typeof json === "object" ? json.data || json : {};
  const rawStatus = String(data.status || json?.status || "").trim().toLowerCase();
  const externalRefundId =
    data.id != null ? String(data.id) : data.refund_reference ? String(data.refund_reference) : null;

  if (rawStatus === "processed" || rawStatus === "success" || rawStatus === "completed") {
    return {
      supported: true,
      ok: true,
      status: "COMPLETED",
      requiresManualAction: false,
      externalRefundId,
      message: null,
      data: { status: data.status || rawStatus },
    };
  }

  if (rawStatus === "pending" || rawStatus === "processing" || rawStatus === "queued") {
    return {
      supported: true,
      ok: false,
      status: "PENDING",
      requiresManualAction: true,
      externalRefundId,
      message: "paystack_refund_pending",
      data: { status: data.status || rawStatus },
    };
  }

  const failed = !httpOk || rawStatus === "failed" || json?.status === false;
  return {
    supported: true,
    ok: false,
    status: "FAILED",
    requiresManualAction: false,
    externalRefundId,
    message: json?.message || (failed ? "paystack_refund_failed" : "paystack_refund_unknown"),
    data: { status: data.status || rawStatus },
  };
}

function alreadySplitSettlementResult(intent) {
  return {
    supported: true,
    alreadySplitAtCharge: true,
    status: "COMPLETE",
    settlementId: intent?.gatewayTransactionId || intent?.merchantReference || null,
    message: "paystack_split_at_charge_no_transfer",
  };
}

/**
 * Only charge.success / charge.failed may settle a PaymentIntent.
 * Unrelated Paystack events (refund.*, transfer.*, invoice.*) must not map to PAID.
 */
function mapPaystackChargeEventState(event) {
  const e = String(event || "").trim().toLowerCase();
  if (e === "charge.success") return "PAID";
  if (e === "charge.failed") return "FAILED";
  return null;
}

function isPaystackChargeSettlementEvent(event) {
  return PAYSTACK_CHARGE_SETTLEMENT_EVENTS.has(String(event || "").trim().toLowerCase());
}

function fourDigitLast4(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return last4.length === 4 ? last4 : null;
}

/**
 * Minimized webhook object for later PaymentIntent.gatewayPayload persistence.
 * Never include authorization objects, customer PII, bins, tokens, or bank accounts.
 */
function sanitizePaystackWebhookRaw(body) {
  const data = body && typeof body.data === "object" && body.data && !Array.isArray(body.data) ? body.data : {};
  const auth =
    data.authorization && typeof data.authorization === "object" && !Array.isArray(data.authorization)
      ? data.authorization
      : {};
  const last4 = fourDigitLast4(auth.last4 || data.last4 || data.card_last4);
  const brand = String(auth.brand || auth.card_type || data.card_brand || "").trim() || null;
  const feesSplitSrc =
    data.fees_split && typeof data.fees_split === "object" && !Array.isArray(data.fees_split)
      ? data.fees_split
      : null;
  const raw = {
    event: body?.event != null ? String(body.event) : null,
    reference: data.reference || null,
    id: data.id != null ? data.id : null,
    status: data.status || null,
    amount: data.amount != null ? data.amount : null,
    currency: data.currency || null,
    channel: data.channel || null,
  };
  if (last4) raw.card_last4 = last4;
  if (brand) raw.card_brand = brand;
  const subaccount = data.subaccount || data.subaccount_code || null;
  if (subaccount) raw.subaccount = subaccount;
  if (data.fees != null) raw.fees = data.fees;
  if (feesSplitSrc) {
    raw.fees_split = {
      paystack: feesSplitSrc.paystack ?? null,
      integration: feesSplitSrc.integration ?? null,
      subaccount: feesSplitSrc.subaccount ?? null,
    };
  }
  return raw;
}

module.exports = {
  ELOFIX_GROSS_COMMISSION_PERCENT,
  PAYSTACK_API_BASE,
  MARKETPLACE_SPLIT_KINDS,
  REPAYMENT_KIND,
  PAYSTACK_CHARGE_SETTLEMENT_EVENTS,
  isPaystackSubaccountCode,
  isMarketplaceSplitKind,
  isRepaymentKind,
  isNoSplitKind,
  buildCreateSubaccountPayload,
  buildUpdateSubaccountPayload,
  buildBaseInitializePayload,
  buildCheckoutInitializePayload,
  buildCreateRefundPayload,
  assertInitializeSplitPayload,
  assertInitializeRepaymentPayload,
  mapPaystackRefundResult,
  alreadySplitSettlementResult,
  mapPaystackChargeEventState,
  isPaystackChargeSettlementEvent,
  sanitizePaystackWebhookRaw,
  toCents,
};
