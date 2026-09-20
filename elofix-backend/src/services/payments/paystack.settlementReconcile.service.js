const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../../config/prisma");
const { emitDomainUpdate } = require("../../utils/realtimeEmitter");
const { computeExpectedBankSettlement, fromCents, toCents } = require("./money.util");
const {
  mapPaystackSettlementApiStatus,
  recipientTypeFromIntent,
  resolvePayoutStaffNotifyBranchId,
  resolveAuthoritativeProcessorFee,
  shouldRepairFalseChargeTimeProcessing,
  majorOrNull,
} = require("./payoutTransparency.util");
const {
  safePaystackSubaccountCode,
  isMarketplaceSplitKind,
  isPaystackRecipientUsableInCurrentMode,
} = require("./paystack.payload");
const { sanitizePaystackFailure } = require("./paystack.client");
const {
  settlementFinancialFields,
  settlementMatchAmountSubunits,
  recipientNetCents,
  paidAtNotAfterSettlement,
  decideAmountFallback,
  sortSettlementsOldestFirst,
} = require("./paystack.settlementAmountMatch");

function toDecimal(value) {
  return new Prisma.Decimal(String(Number(Number(value || 0).toFixed(2))));
}

function isoDate(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatZar(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return `R${n.toFixed(2)}`;
}

function payoutNotifyAmount(intent) {
  const expected = majorOrNull(intent.expectedBankSettlementAmount);
  if (expected != null) return expected;
  return majorOrNull(intent.recipientAmount) ?? 0;
}

function minimizedSettlementMetadata(row, transactionRefs, matchingStrategy) {
  const fields = settlementFinancialFields(row);
  return {
    id: row?.id != null ? String(row.id) : null,
    status: row?.status != null ? String(row.status) : null,
    currency: row?.currency != null ? String(row.currency) : null,
    total_amount: fields.totalAmount,
    effective_amount: fields.effectiveAmount,
    total_fees: fields.totalFees,
    total_processed: fields.totalProcessed,
    settlement_date: row?.settlement_date || row?.paid_at || null,
    matching_strategy: matchingStrategy || null,
    transaction_references: Array.isArray(transactionRefs) ? transactionRefs.slice(0, 200) : [],
  };
}

const PROVIDER_PAYOUT_REFRESH_THROTTLE_MS = 60 * 1000;
const providerSubaccountRefreshAt = new Map();

function resetProviderPayoutRefreshThrottleForTests() {
  providerSubaccountRefreshAt.clear();
}

function throttleKey(providerUserId, subaccount) {
  return `${String(providerUserId)}:${String(subaccount || "").trim().toUpperCase()}`;
}

function isRefreshThrottled(key, now = Date.now()) {
  const last = providerSubaccountRefreshAt.get(key);
  return last != null && now - last < PROVIDER_PAYOUT_REFRESH_THROTTLE_MS;
}

function markRefreshAttempt(key, now = Date.now()) {
  providerSubaccountRefreshAt.set(key, now);
}

function normalizeAcct(value) {
  return safePaystackSubaccountCode(value);
}

function logPaystackSettlement(event, fields = {}) {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${value}`);
  console.info(`[paystack-settlement] ${event}${parts.length ? ` ${parts.join(" ")}` : ""}`);
}

function summarizeSettlementStatuses(rows) {
  const counts = {};
  for (const row of rows || []) {
    const status = String(row?.status || "unknown").trim().toLowerCase() || "unknown";
    counts[status] = (counts[status] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([status, n]) => `${status}:${n}`)
    .join(",") || "none";
}

function sameAcct(a, b) {
  const left = normalizeAcct(a);
  const right = normalizeAcct(b);
  if (!left || !right) return false;
  return left.toUpperCase() === right.toUpperCase();
}

function isMainAccountScope(value) {
  if (value == null) return false;
  const raw = String(value).trim().toLowerCase();
  return raw === "none";
}

function resolveTrustedSubaccountScope(row, opts = {}) {
  const requested = opts.scopedSubaccount != null ? opts.scopedSubaccount : opts.subaccount;
  if (isMainAccountScope(requested)) {
    return { ok: false, reason: "main_account_settlement_ignored" };
  }
  const scoped = normalizeAcct(requested);
  if (!scoped) {
    return { ok: false, reason: "missing_recipient_subaccount_scope" };
  }
  const rowCode = normalizeAcct(row?.subaccount || row?.subaccount_code);
  if (rowCode && !sameAcct(rowCode, scoped)) {
    return { ok: false, reason: "settlement_subaccount_mismatch" };
  }
  return { ok: true, code: scoped };
}

async function resolveIntendedPaystackSubaccount(intent) {
  if (String(intent?.provider || "").trim().toUpperCase() !== "PAYSTACK") return null;
  if (!isMarketplaceSplitKind(intent?.kind)) return null;

  const evidence = normalizeAcct(intent.gatewayPayload);
  if (evidence) return evidence;

  try {
    const paystackRecipient = require("./paystack.recipient");
    return normalizeAcct(await paystackRecipient.lookupMarketplaceSubaccount(intent, prisma));
  } catch {
    return null;
  }
}

async function listKnownRecipientPaystackSubaccounts() {
  const [providers, branches] = await Promise.all([
    prisma.providerWithdrawalProfile.findMany({
      where: { isActive: true, gatewayProvider: "PAYSTACK" },
      select: {
        gatewayRecipientId: true,
        gatewayProvider: true,
        isActive: true,
        gatewayProfilePayload: true,
      },
      take: 500,
    }),
    prisma.branchWithdrawalProfile.findMany({
      where: { isActive: true, gatewayProvider: "PAYSTACK" },
      select: {
        gatewayRecipientId: true,
        gatewayProvider: true,
        isActive: true,
        gatewayProfilePayload: true,
      },
      take: 500,
    }),
  ]);

  const codes = new Map();
  for (const profile of [...providers, ...branches]) {
    if (!isPaystackRecipientUsableInCurrentMode(profile)) continue;
    const code = normalizeAcct(profile.gatewayRecipientId);
    if (!code) continue;
    codes.set(code.toUpperCase(), code);
  }
  return [...codes.values()];
}

async function listUnresolvedHistoricalPaystackSubaccounts() {
  const rows = await prisma.paymentIntent.findMany({
    where: {
      provider: "PAYSTACK",
      state: "PAID",
      payoutSettlementId: null,
      payoutSettlementStatus: { in: ["PENDING", "PROCESSING", "FAILED"] },
    },
    select: { kind: true, gatewayPayload: true },
    take: 2000,
  });
  const codes = new Map();
  for (const intent of rows) {
    if (!isMarketplaceSplitKind(intent.kind)) continue;
    const code = normalizeAcct(intent.gatewayPayload);
    if (!code) continue;
    codes.set(code.toUpperCase(), code);
  }
  return [...codes.values()];
}

async function listRecipientPaystackSubaccountsForReconcile() {
  const [known, historical] = await Promise.all([
    listKnownRecipientPaystackSubaccounts(),
    listUnresolvedHistoricalPaystackSubaccounts(),
  ]);
  const codes = new Map();
  for (const code of [...known, ...historical]) {
    const normalized = normalizeAcct(code);
    if (!normalized) continue;
    codes.set(normalized.toUpperCase(), normalized);
  }
  return [...codes.values()];
}

async function listSettlementsForSubaccountDetailed(paystack, { subaccount, from, to, maxPages = 3 } = {}) {
  const empty = {
    rows: [],
    numericId: null,
    pagesChecked: 0,
    from: from || null,
    to: to || null,
    acct: normalizeAcct(subaccount),
    error: null,
    skipReason: null,
  };
  if (isMainAccountScope(subaccount)) {
    return { ...empty, skipReason: "subaccount_mismatch" };
  }
  const code = normalizeAcct(subaccount);
  if (!code) {
    return { ...empty, skipReason: "subaccount_mismatch" };
  }
  empty.acct = code;
  let numericId = null;
  try {
    if (typeof paystack.resolvePaystackSubaccountId === "function") {
      numericId = await paystack.resolvePaystackSubaccountId(code);
    }
  } catch (err) {
    const error = sanitizePaystackFailure(err, "subaccount_fetch_failed");
    console.warn(
      "[paystack-settlement-reconcile] subaccount id lookup failed; skipping scoped list",
      error.message
    );
    return { ...empty, error, skipReason: "API_error" };
  }
  if (numericId == null) {
    console.warn("[paystack-settlement-reconcile] subaccount id unresolved; skipping scoped list");
    return { ...empty, skipReason: "subaccount_mismatch" };
  }
  logPaystackSettlement("recipient resolved", { acct: code, subaccountId: numericId });

  const rows = [];
  let page = 1;
  let pagesChecked = 0;
  const pageCap = Math.max(1, Number(maxPages) || 3);
  while (page <= pageCap) {
    let settlements = [];
    let meta = null;
    try {
      const listed = await paystack.listSettlements({
        from,
        to,
        page,
        perPage: 50,
        subaccount: numericId,
      });
      settlements = listed?.settlements;
      meta = listed?.meta;
    } catch (err) {
      const error = sanitizePaystackFailure(err, "settlement_list_failed");
      console.warn("[paystack-settlement-reconcile] scoped settlement list failed", error.message);
      return {
        rows,
        numericId,
        pagesChecked,
        from: from || null,
        to: to || null,
        acct: code,
        error,
        skipReason: "API_error",
      };
    }
    pagesChecked = page;
    if (!settlements || settlements.length === 0) break;
    rows.push(...settlements);
    const pageCount = Number(meta?.pageCount || meta?.page_count || 1);
    if (page >= pageCount) break;
    page += 1;
  }
  logPaystackSettlement("list complete", {
    acct: code,
    subaccountId: numericId,
    rows: rows.length,
    statuses: summarizeSettlementStatuses(rows),
    pagesChecked,
  });
  const chronological = sortSettlementsOldestFirst(rows);
  return {
    rows: chronological,
    numericId,
    pagesChecked,
    from: from || null,
    to: to || null,
    acct: code,
    error: null,
    skipReason: chronological.length === 0 ? "no_settlements_returned" : null,
  };
}

async function listSettlementsForSubaccount(paystack, { subaccount, from, to, maxPages = 3 } = {}) {
  const listed = await listSettlementsForSubaccountDetailed(paystack, { subaccount, from, to, maxPages });
  return listed.rows;
}

async function notifyPayoutTransition({ intent, fromStatus, toStatus, settlementId, notify }) {
  if (!notify) return;
  if (!fromStatus || fromStatus === toStatus) return;
  const notable =
    (fromStatus === "PENDING" && toStatus === "PROCESSING") ||
    (fromStatus === "PROCESSING" && ["SETTLED", "FAILED", "REVERSED"].includes(toStatus)) ||
    (fromStatus === "PENDING" && ["SETTLED", "FAILED", "REVERSED"].includes(toStatus)) ||
    (fromStatus === "SETTLED" && toStatus === "REVERSED");
  if (!notable) return;
  const notificationEvents = require("../notificationEvents.service");
  const notificationService = require("../notification.service");
  const amountLabel = formatZar(payoutNotifyAmount(intent)) || "payout";
  const dedupeKey = `payout:${settlementId || intent.id}:${fromStatus}:${toStatus}`;

  let title = "Payout update";
  let message = `Your ${amountLabel} payout status was updated.`;
  if (toStatus === "PROCESSING") {
    title = "Payout processing";
    message = `Your ${amountLabel} payout is being processed by Paystack.`;
  } else if (toStatus === "SETTLED") {
    title = "Payout settled by Paystack";
    message = `Paystack has completed your ${amountLabel} settlement. Your bank may take additional time to reflect the funds.`;
  } else if (toStatus === "FAILED") {
    title = "Payout could not be completed";
    message = "Your payout could not be completed. EloFix is checking the settlement.";
  } else if (toStatus === "REVERSED") {
    title = "Payout reversed";
    message = "A Paystack payout was reversed. EloFix is checking the settlement.";
  }

  let branchIdForRealtime = intent.branchId ? String(intent.branchId) : null;
  const recipientType = recipientTypeFromIntent(intent);
  if (recipientType === "SUPPLIER_BRANCH") {
    const materialOrder = intent.materialOrderId
      ? await prisma.materialOrder.findUnique({
          where: { id: intent.materialOrderId },
          select: { supplierId: true, branchId: true },
        })
      : null;
    const supplierId = materialOrder?.supplierId;
    if (supplierId) {
      await notificationService.notifySupplierOrgOwnerMaterialEvent(String(supplierId), {
        type: "payout_status",
        title,
        message,
        materialOrderId: intent.materialOrderId || undefined,
        jobId: intent.jobId || undefined,
        dedupeKey,
      });
    }
    const branchId = resolvePayoutStaffNotifyBranchId(intent, materialOrder);
    if (branchId) {
      branchIdForRealtime = branchId;
      const branchStaffNotificationService = require("../branchStaffNotification.service");
      await branchStaffNotificationService.createForBranchUsers(branchId, {
        category: "SYSTEM",
        type: "payout_status",
        title,
        message,
        materialOrderId: intent.materialOrderId || undefined,
        dedupeKey,
      });
    }
  } else if (intent.recipientUserId) {
    await notificationEvents.notifyUser(intent.recipientUserId, {
      type: "payout_status",
      title,
      message,
      jobId: intent.jobId || undefined,
      materialOrderId: intent.materialOrderId || undefined,
      dedupeKey,
    });
  }

  const userIds = [];
  if (intent.recipientUserId) userIds.push(String(intent.recipientUserId));
  emitDomainUpdate({
    domain: "earnings",
    action: "payout-status-changed",
    entityId: settlementId || intent.id,
    jobId: intent.jobId || undefined,
    orderId: intent.materialOrderId || undefined,
    userIds,
    branchIds: branchIdForRealtime ? [branchIdForRealtime] : [],
    adminRoom: true,
    metadata: { payoutSettlementStatus: toStatus },
  });
  emitDomainUpdate({
    domain: "supplier",
    action: "payout-status-changed",
    entityId: settlementId || intent.id,
    orderId: intent.materialOrderId || undefined,
    branchIds: branchIdForRealtime ? [branchIdForRealtime] : [],
    adminRoom: true,
  });
}

async function applyPaystackSettlementRow(row, opts = {}) {
  const source = opts.source || "reconcile_job";
  const notify = opts.notify !== false;
  const scope = resolveTrustedSubaccountScope(row, opts);
  if (!scope.ok) {
    return { skipped: true, reason: scope.reason, externalId: row?.id != null ? String(row.id) : null };
  }
  const trustedSubaccount = scope.code;

  const externalId = row?.id != null ? String(row.id) : "";
  if (!externalId) return { skipped: true, reason: "missing_id" };

  const mapped = mapPaystackSettlementApiStatus(row.status);
  if (!mapped) {
    if (String(row?.status || "").trim().toLowerCase() === "paid") {
      console.warn(
        "[paystack-settlement-reconcile] Settlement API status 'paid' is not a documented settlement success state",
        { externalId }
      );
    }
    logPaystackSettlement("intent not linked", {
      settlementId: externalId,
      reason: "unknown_settlement_status",
    });
    return { skipped: true, reason: "unknown_status", externalId };
  }

  const paystack = require("./paystack.gateway");
  const fetched =
    typeof paystack.getAuthoritativeSettlementTransactions === "function"
      ? await paystack.getAuthoritativeSettlementTransactions(externalId)
      : await paystack.getSettlementTransactions(externalId);
  const transactions = Array.isArray(fetched?.transactions) ? fetched.transactions : [];
  const txnSource = fetched?.source || "settlement_api";
  const refs = [];
  const txnByRef = new Map();
  for (const txn of transactions) {
    const ref = String(txn?.reference || txn?.transaction?.reference || "").trim();
    if (!ref) continue;
    refs.push(ref);
    txnByRef.set(ref, txn);
  }
  if (refs.length === 0) {
    logPaystackSettlement("settlement scanned", {
      settlementId: externalId,
      status: row.status,
      transactions: 0,
      matched: 0,
      source: txnSource,
      fallbackAttempted: Boolean(fetched?.fallbackAttempted),
    });
    if (fetched?.error) {
      logPaystackSettlement("intent not linked", {
        settlementId: externalId,
        reason: "API_error",
      });
      return {
        skipped: true,
        reason: "no_transactions",
        matchingStrategy: "none",
        externalId,
        apiError: fetched.error,
      };
    }
    return applySettlementAmountFallback(row, {
      source,
      notify,
      trustedSubaccount,
      mapped,
      externalId,
      txnSource,
    });
  }

  const candidates = await prisma.paymentIntent.findMany({
    where: { provider: "PAYSTACK", merchantReference: { in: refs } },
  });
  logPaystackSettlement("settlement scanned", {
    settlementId: externalId,
    status: row.status,
    transactions: refs.length,
    matched: candidates.length,
    source: txnSource,
  });
  if (candidates.length === 0) {
    logPaystackSettlement("intent not linked", {
      reference: refs[0],
      reason: "reference_not_found",
    });
    return { skipped: true, reason: "no_matching_intents", externalId };
  }

  const intents = [];
  for (const intent of candidates) {
    if (String(intent.provider || "").toUpperCase() !== "PAYSTACK") continue;
    if (!isMarketplaceSplitKind(intent.kind)) continue;
    const intended = await resolveIntendedPaystackSubaccount(intent);
    if (!intended) continue;
    if (!sameAcct(intended, trustedSubaccount)) {
      logPaystackSettlement("intent not linked", {
        reference: intent.merchantReference,
        reason: "subaccount_mismatch",
      });
      return {
        skipped: true,
        reason: "mixed_or_mismatched_recipient_subaccount",
        externalId,
      };
    }
    intents.push(intent);
  }
  if (intents.length === 0) {
    logPaystackSettlement("intent not linked", {
      reference: candidates[0]?.merchantReference,
      reason: "subaccount_mismatch",
    });
    return { skipped: true, reason: "no_matching_intents_for_subaccount", externalId };
  }

  return finalizeLinkedPaystackSettlement({
    row,
    intents,
    txnByRef,
    trustedSubaccount,
    mapped,
    source,
    notify,
    externalId,
    transactionRefs: refs,
    matchingStrategy: "reference",
  });
}

async function collectAmountFallbackCandidates({
  trustedSubaccount,
  currency,
  settlementDate,
  existingSettlementId,
} = {}) {
  const or = [
    {
      payoutSettlementId: null,
      payoutSettlementStatus: { in: ["PENDING", "PROCESSING", "FAILED"] },
    },
  ];
  if (existingSettlementId) {
    or.push({ payoutSettlementId: existingSettlementId });
  }
  const rows = await prisma.paymentIntent.findMany({
    where: {
      provider: "PAYSTACK",
      state: "PAID",
      OR: or,
    },
  });

  const scoped = [];
  for (const intent of rows) {
    if (!isMarketplaceSplitKind(intent.kind)) continue;
    const historical = normalizeAcct(intent.gatewayPayload);
    if (!historical || !sameAcct(historical, trustedSubaccount)) continue;
    scoped.push(intent);
  }

  const expectedCurrency = String(currency || "").trim().toUpperCase();
  const currencyMismatch = [];
  const currencyOk = [];
  for (const intent of scoped) {
    const intentCurrency = String(intent.currency || "").trim().toUpperCase();
    if (!expectedCurrency || !intentCurrency || intentCurrency !== expectedCurrency) {
      currencyMismatch.push(intent);
      continue;
    }
    currencyOk.push(intent);
  }

  const missingPaidAt = [];
  const afterSettlement = [];
  const before = [];
  for (const intent of currencyOk) {
    if (!intent.paidAt) {
      missingPaidAt.push(intent);
      continue;
    }
    if (!paidAtNotAfterSettlement(intent.paidAt, settlementDate)) {
      afterSettlement.push(intent);
      continue;
    }
    before.push(intent);
  }

  const missingNet = [];
  const eligible = [];
  for (const intent of before) {
    const net = recipientNetCents(intent);
    if (net == null) {
      missingNet.push(intent);
      continue;
    }
    eligible.push({ intent, netCents: net, paidAt: intent.paidAt });
  }

  eligible.sort((a, b) => {
    const ta = new Date(a.paidAt).getTime();
    const tb = new Date(b.paidAt).getTime();
    if (ta !== tb) return ta - tb;
    return String(a.intent.id).localeCompare(String(b.intent.id));
  });

  return {
    scoped,
    currencyMismatch,
    missingPaidAt,
    afterSettlement,
    missingNet,
    eligible,
  };
}

async function applySettlementAmountFallback(
  row,
  { source, notify, trustedSubaccount, mapped, externalId, txnSource } = {}
) {
  const targetCents = settlementMatchAmountSubunits(row);
  const settlementDate = row?.settlement_date || row?.paid_at || null;
  const currency = String(row?.currency || "").trim().toUpperCase();
  const existing = await prisma.gatewayPayoutSettlement.findUnique({
    where: {
      gateway_externalSettlementId: { gateway: "PAYSTACK", externalSettlementId: String(externalId) },
    },
  });
  const existingCode = normalizeAcct(existing?.subaccountCode);
  if (existingCode && !sameAcct(existingCode, trustedSubaccount)) {
    return { skipped: true, reason: "existing_settlement_subaccount_mismatch", externalId, matchingStrategy: "none" };
  }

  const collected =
    targetCents != null && settlementDate && currency
      ? await collectAmountFallbackCandidates({
          trustedSubaccount,
          currency,
          settlementDate,
          existingSettlementId: existing?.id || null,
        })
      : {
          scoped: [],
          currencyMismatch: [],
          missingPaidAt: [],
          afterSettlement: [],
          missingNet: [],
          eligible: [],
        };

  const decision = decideAmountFallback({
    collected,
    targetCents,
    hasSettlementDate: Boolean(settlementDate),
    hasCurrency: Boolean(currency),
  });

  if (!decision.matched) {
    logPaystackSettlement("intent not linked", {
      settlementId: externalId,
      reason: decision.skipReason,
      source: txnSource || "settlement_amount",
    });
    return {
      skipped: true,
      reason: decision.skipReason,
      matchingStrategy: "none",
      externalId,
    };
  }

  logPaystackSettlement("settlement amount matched", {
    settlementId: externalId,
    strategy: decision.matchingStrategy,
    matched: decision.intents.length,
    amount: targetCents,
  });

  return finalizeLinkedPaystackSettlement({
    row,
    intents: decision.intents,
    txnByRef: new Map(),
    trustedSubaccount,
    mapped,
    source,
    notify,
    externalId,
    transactionRefs: decision.intents.map((intent) => intent.merchantReference),
    matchingStrategy: decision.matchingStrategy,
  });
}

async function finalizeLinkedPaystackSettlement({
  row,
  intents,
  txnByRef,
  trustedSubaccount,
  mapped,
  source,
  notify,
  externalId,
  transactionRefs,
  matchingStrategy,
}) {
  const first = intents[0];
  const settlementDate = isoDate(row.settlement_date || row.paid_at);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.gatewayPayoutSettlement.findUnique({
      where: {
        gateway_externalSettlementId: { gateway: "PAYSTACK", externalSettlementId: externalId },
      },
    });

    const existingCode = normalizeAcct(existing?.subaccountCode);
    if (existingCode && !sameAcct(existingCode, trustedSubaccount)) {
      return { skipped: true, reason: "existing_settlement_subaccount_mismatch", externalId };
    }

    const fromStatus = existing?.status || null;
    let settlement = existing;
    const statusTimestamps = {};
    if (mapped === "PROCESSING" && !existing?.processingAt) statusTimestamps.processingAt = now;
    if (mapped === "SETTLED") statusTimestamps.settledAt = existing?.settledAt || settlementDate || now;
    if (mapped === "FAILED") statusTimestamps.failedAt = existing?.failedAt || now;
    if (mapped === "REVERSED") statusTimestamps.reversedAt = existing?.reversedAt || now;

    const data = {
      recipientType: recipientTypeFromIntent(first),
      recipientUserId: first.recipientUserId || null,
      supplierId: null,
      branchId: first.branchId || null,
      subaccountCode: trustedSubaccount,
      status: mapped,
      currency: String(row.currency || first.currency || "ZAR").toUpperCase(),
      gatewayReference: row.settlement_date ? String(row.settlement_date) : existing?.gatewayReference || null,
      settlementDate: settlementDate,
      failureReason: mapped === "FAILED" ? String(row.reason || row.message || "Paystack settlement failed") : null,
      metadata: minimizedSettlementMetadata(row, transactionRefs, matchingStrategy),
      ...statusTimestamps,
    };

    if (first.materialOrderId) {
      const order = await tx.materialOrder.findUnique({
        where: { id: first.materialOrderId },
        select: { supplierId: true, branchId: true },
      });
      if (order) {
        data.supplierId = order.supplierId;
        data.branchId = order.branchId;
      }
    }

    if (!settlement) {
      settlement = await tx.gatewayPayoutSettlement.create({
        data: {
          id: randomUUID(),
          gateway: "PAYSTACK",
          externalSettlementId: externalId,
          ...data,
        },
      });
    } else {
      // Refresh status, metadata, fees, and persist request-scoped subaccountCode.
      settlement = await tx.gatewayPayoutSettlement.update({
        where: { id: settlement.id },
        data,
      });
    }

    const changed = fromStatus !== mapped;
    if (changed) {
      await tx.gatewayPayoutSettlementEvent.create({
        data: {
          id: randomUUID(),
          settlementId: settlement.id,
          fromStatus,
          toStatus: mapped,
          source: String(source || "reconcile_job"),
          notificationDedupeKey: `payout:${settlement.id}:${fromStatus || "NONE"}:${mapped}`,
        },
      });
    }

    let grossCents = 0;
    let feeCentsKnown = 0;
    let feeKnownCount = 0;
    const linked = [];

    for (const intent of intents) {
      const txn = txnByRef.get(intent.merchantReference);
      const fee = resolveAuthoritativeProcessorFee({
        intent,
        evidence: intent.gatewayPayload,
        settlementTxn: txn,
      });
      const net = computeExpectedBankSettlement(intent.recipientAmount, fee);
      await tx.gatewayPayoutSettlementItem.upsert({
        where: {
          settlementId_paymentIntentId: {
            settlementId: settlement.id,
            paymentIntentId: intent.id,
          },
        },
        create: {
          id: randomUUID(),
          settlementId: settlement.id,
          paymentIntentId: intent.id,
          customerAmount: toDecimal(intent.amount),
          commissionAmount: toDecimal(intent.commissionAmount),
          recipientGrossShare: toDecimal(intent.recipientAmount),
          gatewayFeeAmount: net.processorFeeAmount,
          expectedBankAmount: net.expectedBankSettlementAmount,
        },
        update: {
          customerAmount: toDecimal(intent.amount),
          commissionAmount: toDecimal(intent.commissionAmount),
          recipientGrossShare: toDecimal(intent.recipientAmount),
          gatewayFeeAmount: net.processorFeeAmount,
          expectedBankAmount: net.expectedBankSettlementAmount,
        },
      });

      const prevPayout = String(intent.payoutSettlementStatus || "NOT_APPLICABLE");
      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: {
          payoutSettlementId: settlement.id,
          payoutSettlementStatus: mapped,
          processorFeeAmount: net.processorFeeAmount,
          expectedBankSettlementAmount: net.expectedBankSettlementAmount,
          ...(intent.kind === "MATERIAL_ORDER" || intent.kind === "JOB_STORE_ORDER"
            ? {
                branchSettlementStatus: mapped,
                branchSettlementId: externalId,
              }
            : {}),
        },
      });

      if (intent.materialOrderId && (mapped === "SETTLED" || mapped === "FAILED" || mapped === "REVERSED" || mapped === "PROCESSING")) {
        await tx.materialOrder.update({
          where: { id: intent.materialOrderId },
          data: {
            settlementStatus: mapped,
            gatewaySettlementId: externalId,
            ...(mapped === "SETTLED" ? { settledAt: settlementDate || now } : {}),
            ...(mapped === "FAILED" ? { settlementFailureReason: data.failureReason } : { settlementFailureReason: null }),
          },
        });
      }

      grossCents += toCents(intent.recipientAmount);
      if (net.processorFeeAmount != null) {
        feeCentsKnown += toCents(net.processorFeeAmount);
        feeKnownCount += 1;
      }
      linked.push({
        intent,
        fromStatus: prevPayout,
        toStatus: mapped,
        expected: net.expectedBankSettlementAmount,
        fee: net.processorFeeAmount,
      });
    }

    const allFeesKnown = feeKnownCount === intents.length;
    await tx.gatewayPayoutSettlement.update({
      where: { id: settlement.id },
      data: {
        grossRecipientShare: toDecimal(fromCents(grossCents)),
        gatewayFeeAmount: allFeesKnown ? toDecimal(fromCents(feeCentsKnown)) : null,
        expectedBankAmount: allFeesKnown
          ? toDecimal(fromCents(grossCents - feeCentsKnown))
          : null,
      },
    });

    return { settlement, fromStatus, mapped, changed, linked };
  });

  if (result.skipped) {
    return { skipped: true, reason: result.reason, externalId };
  }

  if (notify) {
    const seen = new Set();
    for (const rowLink of result.linked) {
      const key = `${rowLink.intent.id}:${rowLink.fromStatus}:${rowLink.toStatus}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fresh = {
        ...rowLink.intent,
        payoutSettlementStatus: rowLink.toStatus,
        expectedBankSettlementAmount: rowLink.expected,
        processorFeeAmount: rowLink.fee,
      };
      await notifyPayoutTransition({
        intent: fresh,
        fromStatus: rowLink.fromStatus,
        toStatus: rowLink.toStatus,
        settlementId: result.settlement.id,
        notify: true,
      });
    }
  }

  return {
    skipped: false,
    externalId,
    settlementId: result.settlement.id,
    status: result.mapped,
    linked: result.linked.length,
    changed: result.changed,
    matchingStrategy: matchingStrategy || "reference",
  };
}

async function reconcilePaystackSettlementById(externalSettlementId, opts = {}) {
  const id = String(externalSettlementId || "").trim();
  if (!id) return { skipped: true, reason: "missing_id" };
  const scoped = normalizeAcct(opts.scopedSubaccount || opts.subaccount);
  if (!scoped) {
    return { skipped: true, reason: "missing_recipient_subaccount_scope" };
  }
  const paystack = require("./paystack.gateway");
  const settlements = await listSettlementsForSubaccount(paystack, {
    subaccount: scoped,
    maxPages: 5,
  });
  const row = settlements.find((s) => String(s?.id) === id);
  if (!row) {
    return { skipped: true, reason: "settlement_not_in_subaccount_scope", externalId: id };
  }
  return applyPaystackSettlementRow(row, {
    source: opts.source || "settlement_webhook",
    notify: opts.notify !== false,
    scopedSubaccount: scoped,
  });
}

async function reconcileRecentPaystackSettlements(opts = {}) {
  const paystack = require("./paystack.gateway");
  if (typeof paystack.isConfigured === "function" && !paystack.isConfigured()) {
    return { skipped: true, reason: "not_configured", settlements: 0, linked: 0 };
  }
  const to = opts.to || new Date().toISOString().slice(0, 10);
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - (opts.lookbackDays != null ? Number(opts.lookbackDays) : 14));
  const from = opts.from || fromDate.toISOString().slice(0, 10);

  const subaccounts = await listRecipientPaystackSubaccountsForReconcile();
  let linked = 0;
  let scanned = 0;
  let changed = 0;
  for (const scopedSubaccount of subaccounts) {
    const settlements = await listSettlementsForSubaccount(paystack, {
      subaccount: scopedSubaccount,
      from,
      to,
      maxPages: 3,
    });
    for (const row of settlements) {
      scanned += 1;
      try {
        const applied = await applyPaystackSettlementRow(row, {
          source: opts.source || "reconcile_job",
          notify: opts.notify !== false,
          scopedSubaccount,
        });
        if (!applied.skipped) {
          linked += applied.linked || 0;
          if (applied.changed) changed += 1;
        }
      } catch (err) {
        console.error("[paystack-settlement-reconcile] row failed", row?.id, err?.message || err);
      }
    }
  }
  return {
    skipped: false,
    settlements: scanned,
    linked,
    changed,
    from,
    to,
    subaccounts: subaccounts.length,
  };
}

async function reconcilePaystackSubaccountSettlements({ subaccount, from, to, source, notify } = {}) {
  if (isMainAccountScope(subaccount)) {
    return { skipped: true, reason: "main_account_settlement_ignored", settlements: 0, linked: 0 };
  }
  const scoped = normalizeAcct(subaccount);
  if (!scoped) {
    return { skipped: true, reason: "missing_recipient_subaccount_scope", settlements: 0, linked: 0 };
  }
  const paystack = require("./paystack.gateway");
  if (typeof paystack.isConfigured === "function" && !paystack.isConfigured()) {
    return { skipped: true, reason: "not_configured", settlements: 0, linked: 0 };
  }
  const toDate = to || new Date().toISOString().slice(0, 10);
  const fromDateObj = new Date();
  fromDateObj.setDate(fromDateObj.getDate() - 14);
  const fromDate = from || fromDateObj.toISOString().slice(0, 10);
  const settlements = await listSettlementsForSubaccount(paystack, {
    subaccount: scoped,
    from: fromDate,
    to: toDate,
    maxPages: 5,
  });
  let linked = 0;
  let changed = 0;
  let scanned = 0;
  for (const row of settlements) {
    scanned += 1;
    try {
      const applied = await applyPaystackSettlementRow(row, {
        source: source || "provider_earnings_refresh",
        notify: notify !== false,
        scopedSubaccount: scoped,
      });
      if (!applied.skipped) {
        linked += applied.linked || 0;
        if (applied.changed) changed += 1;
      }
    } catch (err) {
      console.error("[paystack-settlement-reconcile] subaccount row failed", row?.id, err?.message || err);
    }
  }
  return {
    skipped: false,
    settlements: scanned,
    linked,
    changed,
    from: fromDate,
    to: toDate,
    subaccount: scoped,
  };
}

/**
 * Retired: charge.success only proves customer payment. It is not payout processing.
 */
async function notifyChargeTimeProcessing() {
  return { skipped: true, reason: "retired_charge_time_processing_is_not_payout_processing" };
}

async function repairFalseChargeTimeProcessing(intents) {
  const rows = Array.isArray(intents) ? intents : [];
  const repaired = [];
  for (const intent of rows) {
    if (!shouldRepairFalseChargeTimeProcessing(intent)) continue;
    await prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { payoutSettlementStatus: "PENDING" },
    });
    repaired.push(intent.id);
  }
  return repaired;
}

async function backfillProcessorFeeFromStoredEvidence(intents) {
  const rows = Array.isArray(intents) ? intents : [];
  const updated = [];
  for (const intent of rows) {
    if (String(intent?.provider || "").toUpperCase() !== "PAYSTACK") continue;
    if (String(intent?.state || "").toUpperCase() !== "PAID") continue;
    if (!isMarketplaceSplitKind(intent?.kind)) continue;
    if (intent.processorFeeAmount != null && Number.isFinite(Number(intent.processorFeeAmount))) continue;
    const fee = resolveAuthoritativeProcessorFee({
      intent,
      evidence: intent.gatewayPayload,
    });
    if (fee == null) continue;
    const net = computeExpectedBankSettlement(intent.recipientAmount, fee);
    await prisma.paymentIntent.update({
      where: { id: intent.id },
      data: {
        processorFeeAmount: net.processorFeeAmount,
        expectedBankSettlementAmount: net.expectedBankSettlementAmount,
      },
    });
    updated.push(intent.id);
  }
  return updated;
}

async function backfillProcessorFeeFromVerify(intents) {
  const rows = Array.isArray(intents) ? intents : [];
  const paystack = require("./paystack.gateway");
  if (typeof paystack.isConfigured === "function" && !paystack.isConfigured()) return [];
  const updated = [];
  for (const intent of rows) {
    if (String(intent?.provider || "").toUpperCase() !== "PAYSTACK") continue;
    if (String(intent?.state || "").toUpperCase() !== "PAID") continue;
    if (!isMarketplaceSplitKind(intent?.kind)) continue;
    if (intent.processorFeeAmount != null && Number.isFinite(Number(intent.processorFeeAmount))) continue;
    const fromStored = resolveAuthoritativeProcessorFee({
      intent,
      evidence: intent.gatewayPayload,
    });
    if (fromStored != null) continue;
    const ref = String(intent.merchantReference || "").trim();
    if (!ref) continue;
    try {
      const verified = await paystack.verifyTransaction(ref);
      const fee = resolveAuthoritativeProcessorFee({
        intent,
        evidence: intent.gatewayPayload,
        verifyRaw: verified?.raw,
      });
      if (fee == null) continue;
      const net = computeExpectedBankSettlement(intent.recipientAmount, fee);
      const prevPayload =
        intent.gatewayPayload && typeof intent.gatewayPayload === "object" && !Array.isArray(intent.gatewayPayload)
          ? intent.gatewayPayload
          : {};
      const mergedPayload = {
        ...prevPayload,
        ...(verified?.raw && typeof verified.raw === "object" ? verified.raw : {}),
      };
      await prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          processorFeeAmount: net.processorFeeAmount,
          expectedBankSettlementAmount: net.expectedBankSettlementAmount,
          gatewayPayload: mergedPayload,
        },
      });
      updated.push(intent.id);
    } catch (err) {
      console.warn("[paystack-fee-backfill] verify skipped", ref, err?.message || err);
    }
  }
  return updated;
}

function ymd(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function historicalChargeSubaccount(intent) {
  return normalizeAcct(intent?.gatewayPayload);
}

function isUnresolvedPaystackPayout(intent) {
  const status = String(intent?.payoutSettlementStatus || "").trim().toUpperCase();
  return status === "PENDING" || status === "PROCESSING" || status === "FAILED";
}

/**
 * Targeted Provider earnings refresh. Never runs global reconciliation.
 * Historical ACCT_ on gatewayPayload is authoritative.
 */
async function refreshProviderPaystackPayoutObservability({ providerUserId, intents } = {}) {
  const rows = Array.isArray(intents) ? intents : [];
  const paystackRows = rows.filter(
    (intent) =>
      String(intent?.provider || "").toUpperCase() === "PAYSTACK" &&
      String(intent?.state || "").toUpperCase() === "PAID" &&
      isMarketplaceSplitKind(intent?.kind)
  );
  const repaired = await repairFalseChargeTimeProcessing(paystackRows);
  const feeFromEvidence = await backfillProcessorFeeFromStoredEvidence(paystackRows);

  const unresolved = paystackRows.filter((intent) => {
    if (repaired.includes(intent.id)) return true;
    return isUnresolvedPaystackPayout(intent);
  });
  const missingFee = paystackRows.filter((intent) => {
    if (feeFromEvidence.includes(intent.id)) return false;
    if (intent.processorFeeAmount != null && Number.isFinite(Number(intent.processorFeeAmount))) return false;
    return true;
  });

  const codes = new Map();
  const oldestByCode = new Map();
  for (const intent of unresolved) {
    const code = historicalChargeSubaccount(intent);
    if (!code) continue;
    const key = code.toUpperCase();
    codes.set(key, code);
    const paidDay = ymd(intent.paidAt || intent.createdAt);
    if (!paidDay) continue;
    const prev = oldestByCode.get(key);
    if (!prev || paidDay < prev) oldestByCode.set(key, paidDay);
  }

  const to = new Date().toISOString().slice(0, 10);
  const dueCodes = [];
  for (const [key, code] of codes.entries()) {
    const tKey = throttleKey(providerUserId, key);
    if (isRefreshThrottled(tKey)) continue;
    markRefreshAttempt(tKey);
    dueCodes.push({ code, from: oldestByCode.get(key) || undefined });
  }

  const needsVerify = missingFee.some((intent) => {
    const fromStored = resolveAuthoritativeProcessorFee({
      intent,
      evidence: intent.gatewayPayload,
    });
    return fromStored == null;
  });
  const verifyKey = throttleKey(providerUserId, "VERIFY");
  const verifyDue = needsVerify && !isRefreshThrottled(verifyKey);
  if (verifyDue) markRefreshAttempt(verifyKey);

  let verified = [];
  try {
    for (const item of dueCodes) {
      await reconcilePaystackSubaccountSettlements({
        subaccount: item.code,
        from: item.from,
        to,
        source: "provider_earnings_refresh",
        notify: true,
      });
    }
    if (verifyDue) {
      verified = await backfillProcessorFeeFromVerify(missingFee);
    }
  } catch (err) {
    console.warn("[provider-earnings] paystack refresh unavailable", err?.message || err);
  }

  return {
    repaired: repaired.length,
    feeFromEvidence: feeFromEvidence.length,
    verified: verified.length,
    reconciledSubaccounts: dueCodes.length,
  };
}

module.exports = {
  applyPaystackSettlementRow,
  reconcilePaystackSettlementById,
  reconcileRecentPaystackSettlements,
  reconcilePaystackSubaccountSettlements,
  refreshProviderPaystackPayoutObservability,
  repairFalseChargeTimeProcessing,
  backfillProcessorFeeFromStoredEvidence,
  notifyChargeTimeProcessing,
  notifyPayoutTransition,
  listKnownRecipientPaystackSubaccounts,
  listRecipientPaystackSubaccountsForReconcile,
  collectAmountFallbackCandidates,
  listSettlementsForSubaccountDetailed,
  resolveTrustedSubaccountScope,
  resetProviderPayoutRefreshThrottleForTests,
  PROVIDER_PAYOUT_REFRESH_THROTTLE_MS,
};
