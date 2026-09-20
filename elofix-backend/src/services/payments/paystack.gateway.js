const crypto = require("crypto");
const AppError = require("../../utils/AppError");
const { frontendBaseUrl, isPaystackConfigured, assertPaystackCredentials } = require("./paymentConfig");
const { paystackRequest, readSecret, redactDeep, sanitizePaystackFailure } = require("./paystack.client");
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
  numericPaystackSubaccountIdOrNull,
  mapPaystackChargeEventState,
  sanitizePaystackWebhookRaw,
  extractPaystackSplitEvidence,
  safePaystackSubaccountCode,
} = require("./paystack.payload");
const {
  fetchSouthAfricanBanks,
  resolvePaystackBankCode,
  assertBankCodeNotBlindBranchCode,
} = require("./paystack.banks");
const paystackRecipient = require("./paystack.recipient");
const {
  assertAllowedExportUrl,
  downloadPaystackExportCsv,
  safeExportUrlForLog,
  transactionsFromExportCsv,
} = require("./paystack.settlementExport");

function isConfigured(env = process.env) {
  return isPaystackConfigured(env);
}

const SUBACCOUNT_ID_CACHE_TTL_MS = 15 * 60 * 1000;
const subaccountNumericIdCache = new Map();

function resetPaystackSubaccountIdCacheForTests() {
  subaccountNumericIdCache.clear();
}

function samePaystackSubaccountCode(a, b) {
  const left = safePaystackSubaccountCode(a);
  const right = safePaystackSubaccountCode(b);
  if (!left || !right) return false;
  return left.toUpperCase() === right.toUpperCase();
}

/**
 * Resolve a trusted EloFix ACCT_ code to Paystack's numeric subaccount id.
 * Numeric id is only for GET /settlement filtering. Never persist it as recipient identity.
 * Fail closed on mismatch. Do not cache failures.
 * @param {string} subaccountCode
 * @returns {Promise<number|null>}
 */
async function resolvePaystackSubaccountId(subaccountCode) {
  const code = safePaystackSubaccountCode(subaccountCode);
  if (!code) return null;
  const cacheKey = code.toUpperCase();
  const cached = subaccountNumericIdCache.get(cacheKey);
  if (cached && cached.id != null && cached.expiresAt > Date.now()) {
    return cached.id;
  }
  const { json } = await paystackRequest("GET", `/subaccount/${encodeURIComponent(code)}`);
  const data = json?.data && typeof json.data === "object" && !Array.isArray(json.data) ? json.data : {};
  const returnedCode = safePaystackSubaccountCode(data.subaccount_code || data.subaccount);
  if (!returnedCode || !samePaystackSubaccountCode(returnedCode, code)) {
    return null;
  }
  const id = numericPaystackSubaccountIdOrNull(data.id);
  if (id == null) return null;
  subaccountNumericIdCache.set(cacheKey, {
    id,
    expiresAt: Date.now() + SUBACCOUNT_ID_CACHE_TTL_MS,
  });
  return id;
}

async function resolveListSettlementsSubaccountFilter(subaccount) {
  const raw = subaccount == null ? "" : String(subaccount).trim();
  if (!raw || raw.toLowerCase() === "none") {
    const err = new Error("Paystack list settlements requires a recipient subaccount scope");
    err.code = "PAYSTACK_SETTLEMENT_SCOPE_REQUIRED";
    throw err;
  }
  const numeric = numericPaystackSubaccountIdOrNull(raw);
  if (numeric != null) return numeric;
  try {
    const resolved = await resolvePaystackSubaccountId(raw);
    if (resolved != null) return resolved;
  } catch (err) {
    const wrapped = new Error(err?.message || "Paystack subaccount id lookup failed");
    wrapped.code = "PAYSTACK_SUBACCOUNT_ID_UNRESOLVED";
    wrapped.cause = err;
    throw wrapped;
  }
  const err = new Error("Paystack list settlements could not resolve recipient subaccount id");
  err.code = "PAYSTACK_SUBACCOUNT_ID_UNRESOLVED";
  throw err;
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

function resolveSafeBankCode(data, bankCode) {
  const explicit = String(bankCode || "").trim();
  if (explicit) return explicit;
  const fromData = String(data?.paystackBankCode || data?.bank_code || "").trim();
  return fromData || null;
}

function destinationResult(data, bankCode) {
  const code = safePaystackSubaccountCode(data?.subaccount_code || data?.subaccount);
  const verified = Boolean(data?.is_verified);
  const active = data?.active !== false;
  const resolvedBank = resolveSafeBankCode(data, bankCode);
  if (!code) {
    return {
      supported: false,
      requiresManualAction: true,
      status: "INVALID_RECIPIENT",
      message: "Paystack destination did not return a valid subaccount",
      data: {
        is_verified: verified,
        active,
        domain: data?.domain || null,
        paystackBankCode: resolvedBank,
        bank_code: resolvedBank,
      },
    };
  }
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
      paystackBankCode: resolvedBank,
      bank_code: resolvedBank,
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
  let payload;
  try {
    const subaccountCode = await paystackRecipient.lookupMarketplaceSubaccount(intent);
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
    return {
      supported: mapped.supported !== false,
      status: mapped.status,
      recipientId: mapped.recipientId || code,
      data: mapped.data || null,
      message: mapped.message,
    };
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

function paystackSplitEvidenceCode(intent) {
  const payload =
    intent?.gatewayPayload && typeof intent.gatewayPayload === "object" && !Array.isArray(intent.gatewayPayload)
      ? intent.gatewayPayload
      : {};
  return safePaystackSubaccountCode(payload.subaccount || payload.subaccount_code);
}

function isPaystackIntent(intent) {
  return String(intent?.provider || "").trim().toUpperCase() === "PAYSTACK";
}

async function createSupplierSettlement(intent, destination) {
  if (!isPaystackIntent(intent)) {
    return { supported: false, alreadySplitAtCharge: false, message: "not_paystack_intent" };
  }
  const destCode = destination?.recipientId != null ? String(destination.recipientId).trim() : "";
  if (destCode && !isPaystackSubaccountCode(destCode)) {
    return {
      supported: false,
      alreadySplitAtCharge: true,
      requiresManualAction: true,
      message: "invalid_paystack_recipient",
    };
  }
  const evidenceCode = paystackSplitEvidenceCode(intent);
  if (evidenceCode && destCode && evidenceCode.toUpperCase() !== destCode.toUpperCase()) {
    return {
      supported: false,
      alreadySplitAtCharge: true,
      requiresManualAction: true,
      message: "subaccount_mismatch",
    };
  }
  return alreadySplitSettlementResult(intent);
}

async function getSettlementStatus(settlementId) {
  return {
    supported: true,
    alreadySplitAtCharge: true,
    status: "PROCESSING",
    settlementId: settlementId || null,
    message: "paystack_split_at_charge_no_transfer",
  };
}

async function listSettlements({ from, to, subaccount, page = 1, perPage = 50 } = {}) {
  const filterId = await resolveListSettlementsSubaccountFilter(subaccount);
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("perPage", String(perPage));
  if (from) params.set("from", String(from));
  if (to) params.set("to", String(to));
  params.set("subaccount", String(filterId));
  const { json } = await paystackRequest("GET", `/settlement?${params.toString()}`);
  const data = Array.isArray(json?.data) ? json.data : [];
  return {
    settlements: data.map(sanitizeListedSettlement).filter(Boolean),
    meta: json?.meta && typeof json.meta === "object" ? json.meta : null,
    subaccountId: filterId,
  };
}

/**
 * Keep Settlement API financial fields as integer subunits.
 * Never pass through bank account numbers or other secrets.
 */
function sanitizeListedSettlement(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  if (row.id == null || row.id === "") return null;
  const { settlementFinancialFields } = require("./paystack.settlementAmountMatch");
  const fields = settlementFinancialFields(row);
  const sub = safePaystackSubaccountCode(row.subaccount_code || row.subaccount);
  const sanitized = {
    id: row.id,
    status: row.status != null ? String(row.status) : null,
    currency: row.currency != null ? String(row.currency).toUpperCase() : null,
    total_amount: fields.totalAmount,
    effective_amount: fields.effectiveAmount,
    total_fees: fields.totalFees,
    total_processed: fields.totalProcessed,
    settlement_date: row.settlement_date || row.paid_at || null,
  };
  if (sub) {
    sanitized.subaccount = sub;
    sanitized.subaccount_code = sub;
  }
  return sanitized;
}

async function getSettlementTransactions(settlementId, { page = 1, perPage = 100, maxPages = 10 } = {}) {
  const id = String(settlementId || "").trim();
  if (!id) return { transactions: [], meta: null };
  const startPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(perPage) || 100));
  const pageCap = Math.min(20, Math.max(1, Number(maxPages) || 10));
  const transactions = [];
  let lastMeta = null;
  for (let current = startPage; current < startPage + pageCap; current += 1) {
    const params = new URLSearchParams();
    params.set("page", String(current));
    params.set("perPage", String(pageSize));
    const { json } = await paystackRequest(
      "GET",
      `/settlement/${encodeURIComponent(id)}/transactions?${params.toString()}`
    );
    const data = Array.isArray(json?.data) ? json.data : [];
    lastMeta = json?.meta && typeof json.meta === "object" ? json.meta : null;
    if (data.length) transactions.push(...data);
    const pageCount = Number(lastMeta?.pageCount || lastMeta?.page_count || 1);
    if (!data.length || current >= pageCount) break;
  }
  return { transactions, meta: lastMeta };
}

/**
 * Documented Paystack fallback: GET /transaction/export?settlement={id}
 * Used only when GET /settlement/:id/transactions returns zero rows.
 * Never exposes the signed export URL to clients.
 */
async function getSettlementTransactionsViaExport(settlementId) {
  const id = String(settlementId || "").trim();
  const numericId = numericPaystackSubaccountIdOrNull(id);
  if (numericId == null) {
    const err = new Error("Paystack transaction export requires a numeric settlement id");
    err.code = "PAYSTACK_EXPORT_SETTLEMENT_ID";
    throw err;
  }
  const params = new URLSearchParams();
  params.set("settlement", String(numericId));
  const { json } = await paystackRequest("GET", `/transaction/export?${params.toString()}`);
  const path = json?.data?.path || json?.data?.url || json?.data?.file || null;
  if (!path) {
    const err = new Error("Paystack transaction export did not return a download path");
    err.code = "PAYSTACK_EXPORT_PATH_MISSING";
    throw err;
  }
  const allowed = assertAllowedExportUrl(path);
  let csv;
  try {
    csv = await downloadPaystackExportCsv(allowed);
  } catch (err) {
    console.warn("[paystack-settlement] export download failed", safeExportUrlForLog(allowed), err?.code || err?.message);
    throw err;
  }
  return { transactions: transactionsFromExportCsv(csv) };
}

/**
 * Primary: GET /settlement/:id/transactions
 * Fallback only when that list is empty: GET /transaction/export?settlement=:id
 */
async function getAuthoritativeSettlementTransactions(settlementId, opts = {}) {
  const primary = await module.exports.getSettlementTransactions(settlementId, opts);
  const primaryList = Array.isArray(primary?.transactions) ? primary.transactions : [];
  if (primaryList.length > 0) {
    return {
      transactions: primaryList,
      source: "settlement_api",
      primaryCount: primaryList.length,
      fallbackUsed: false,
      fallbackAttempted: false,
      fallbackTransactionCount: 0,
      error: null,
    };
  }
  try {
    const exported = await module.exports.getSettlementTransactionsViaExport(settlementId);
    const list = Array.isArray(exported?.transactions) ? exported.transactions : [];
    return {
      transactions: list,
      source: "transaction_export",
      primaryCount: 0,
      fallbackUsed: list.length > 0,
      fallbackAttempted: true,
      fallbackTransactionCount: list.length,
      error: null,
    };
  } catch (err) {
    return {
      transactions: [],
      source: "transaction_export",
      primaryCount: 0,
      fallbackUsed: false,
      fallbackAttempted: true,
      fallbackTransactionCount: 0,
      error: sanitizePaystackFailure(err, "transaction_export_failed"),
    };
  }
}

/**
 * Compatibility parser for settlement.* payloads if they ever arrive.
 *
 * Paystack's current documented supported webhook event list does not include
 * settlement.* events. EloFix does not rely on this webhook for payout finality.
 * Authoritative payout status comes from Settlement API polling/reconciliation
 * (cron, admin reconcile, provider earnings refresh). Keep this parser only so
 * an unexpected settlement.* payload can still be scoped and applied without
 * replacing polling.
 */
async function verifySettlementWebhook(payload) {
  const body = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const event = String(body.event || "").trim().toLowerCase();
  if (event.startsWith("transfer.")) {
    return { valid: false, ignored: true, event };
  }
  if (!event.startsWith("settlement.")) {
    return { valid: false, ignored: true, event };
  }
  const data = body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : {};
  const settlementId = data.id != null ? String(data.id) : data.settlement_id != null ? String(data.settlement_id) : null;
  if (!settlementId) {
    return { valid: false, event };
  }
  return {
    valid: true,
    settlementId,
    status: data.status || null,
    gatewayReference: data.settlement_date || data.paid_at || null,
    event,
    externalEventId: `paystack:${event}:${settlementId}`,
    subaccount: safePaystackSubaccountCode(data.subaccount || data.subaccount_code),
  };
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
  listSettlements,
  getSettlementTransactions,
  getSettlementTransactionsViaExport,
  getAuthoritativeSettlementTransactions,
  resolvePaystackSubaccountId,
  resetPaystackSubaccountIdCacheForTests,
  assertPaystackCredentials,
};
