const { randomUUID } = require("crypto");
const { toCents } = require("../../src/services/payments/money.util");

const ELOFIX_GROSS_COMMISSION_PERCENT = 7;
const PAYSTACK_API_BASE = "https://api.paystack.co";

function uniqueD15Reference(prefix = "D15") {
  const token = randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
  return `${prefix}-${Date.now()}-${token}`;
}

/**
 * Paystack percentage_charge = percentage the MAIN account receives.
 * EloFix gross commission is 7%.
 */
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

/**
 * One-recipient split. bearer=subaccount so Paystack fees are not taken from EloFix 7%.
 * Do not send transaction_charge — it can override the percentage split.
 */
function buildInitializeSplitPayload({
  email,
  amountMajor,
  currency = "ZAR",
  reference,
  subaccountCode,
  metadata = {},
} = {}) {
  const amount = toCents(amountMajor);
  return {
    email: String(email || "").trim(),
    amount,
    currency: String(currency || "ZAR").trim().toUpperCase(),
    reference: String(reference || uniqueD15Reference()),
    subaccount: String(subaccountCode || "").trim(),
    bearer: "subaccount",
    metadata,
  };
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
  return true;
}

module.exports = {
  ELOFIX_GROSS_COMMISSION_PERCENT,
  PAYSTACK_API_BASE,
  uniqueD15Reference,
  buildCreateSubaccountPayload,
  buildInitializeSplitPayload,
  buildCreateRefundPayload,
  assertInitializeSplitPayload,
  toCents,
};
