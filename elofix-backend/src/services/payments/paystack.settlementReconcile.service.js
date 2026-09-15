const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../../config/prisma");
const { emitDomainUpdate } = require("../../utils/realtimeEmitter");
const { computeExpectedBankSettlement, fromCents, toCents } = require("./money.util");
const {
  mapPaystackSettlementApiStatus,
  recipientTypeFromIntent,
  resolvePayoutStaffNotifyBranchId,
  processorFeeFromPaystackEvidence,
  majorOrNull,
} = require("./payoutTransparency.util");
const {
  safePaystackSubaccountCode,
  isMarketplaceSplitKind,
  isPaystackRecipientUsableInCurrentMode,
} = require("./paystack.payload");

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

function minimizedSettlementMetadata(row, transactionRefs) {
  return {
    id: row?.id != null ? String(row.id) : null,
    status: row?.status != null ? String(row.status) : null,
    currency: row?.currency != null ? String(row.currency) : null,
    total_amount: row?.total_amount != null ? Number(row.total_amount) : null,
    effective_amount: row?.effective_amount != null ? Number(row.effective_amount) : null,
    total_fees: row?.total_fees != null ? Number(row.total_fees) : null,
    settlement_date: row?.settlement_date || row?.paid_at || null,
    transaction_references: Array.isArray(transactionRefs) ? transactionRefs.slice(0, 200) : [],
  };
}

function feeFromSettlementTransaction(txn) {
  const evidence = {
    bearer: txn?.fees_split ? "subaccount" : txn?.bearer,
    fees_split: txn?.fees_split,
  };
  if (txn?.bearer) evidence.bearer = String(txn.bearer).trim().toLowerCase();
  return processorFeeFromPaystackEvidence(evidence);
}

function normalizeAcct(value) {
  return safePaystackSubaccountCode(value);
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

async function listSettlementsForSubaccount(paystack, { subaccount, from, to, maxPages = 3 } = {}) {
  const code = normalizeAcct(subaccount);
  if (!code) return [];
  const rows = [];
  let page = 1;
  while (page <= maxPages) {
    const { settlements, meta } = await paystack.listSettlements({
      from,
      to,
      page,
      perPage: 50,
      subaccount: code,
    });
    if (!settlements || settlements.length === 0) break;
    rows.push(...settlements);
    const pageCount = Number(meta?.pageCount || meta?.page_count || 1);
    if (page >= pageCount) break;
    page += 1;
  }
  return rows;
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
  if (!mapped) return { skipped: true, reason: "unknown_status", externalId };

  const paystack = require("./paystack.gateway");
  const { transactions } = await paystack.getSettlementTransactions(externalId);
  const refs = [];
  const txnByRef = new Map();
  for (const txn of transactions || []) {
    const ref = String(txn?.reference || txn?.transaction?.reference || "").trim();
    if (!ref) continue;
    refs.push(ref);
    txnByRef.set(ref, txn);
  }
  if (refs.length === 0) {
    return { skipped: true, reason: "no_transactions", externalId };
  }

  const candidates = await prisma.paymentIntent.findMany({
    where: { provider: "PAYSTACK", merchantReference: { in: refs } },
  });
  if (candidates.length === 0) {
    return { skipped: true, reason: "no_matching_intents", externalId };
  }

  const intents = [];
  for (const intent of candidates) {
    if (String(intent.provider || "").toUpperCase() !== "PAYSTACK") continue;
    if (!isMarketplaceSplitKind(intent.kind)) continue;
    const intended = await resolveIntendedPaystackSubaccount(intent);
    if (!intended) continue;
    if (!sameAcct(intended, trustedSubaccount)) {
      return {
        skipped: true,
        reason: "mixed_or_mismatched_recipient_subaccount",
        externalId,
      };
    }
    intents.push(intent);
  }
  if (intents.length === 0) {
    return { skipped: true, reason: "no_matching_intents_for_subaccount", externalId };
  }

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
      metadata: minimizedSettlementMetadata(row, refs),
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
      let fee = intent.processorFeeAmount;
      if (fee == null && txn) {
        fee = feeFromSettlementTransaction(txn);
      }
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

  const subaccounts = await listKnownRecipientPaystackSubaccounts();
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

async function notifyChargeTimeProcessing(intentId) {
  const intent = await prisma.paymentIntent.findUnique({ where: { id: String(intentId) } });
  if (!intent) return;
  if (String(intent.payoutSettlementStatus) !== "PROCESSING") return;
  await notifyPayoutTransition({
    intent,
    fromStatus: "PENDING",
    toStatus: "PROCESSING",
    settlementId: intent.id,
    notify: true,
  });
}

module.exports = {
  applyPaystackSettlementRow,
  reconcilePaystackSettlementById,
  reconcileRecentPaystackSettlements,
  notifyChargeTimeProcessing,
  notifyPayoutTransition,
  listKnownRecipientPaystackSubaccounts,
  resolveTrustedSubaccountScope,
};
