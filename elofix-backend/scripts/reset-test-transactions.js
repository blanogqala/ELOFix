/**
 * One-off EloFix transactional test-data reset.
 *
 * Removes jobs, material orders, and transactional history belonging to them.
 * Preserves accounts, credentials, roles, profiles, branches, inventory,
 * categories, banking/subaccount configuration, and Paystack webhook/settlement
 * audit evidence.
 *
 * Default is DRY RUN (no deletes):
 *   node scripts/reset-test-transactions.js
 *   node scripts/reset-test-transactions.js --dry-run
 *
 * Destructive execution requires exactly:
 *   node scripts/reset-test-transactions.js --confirm=DELETE-TEST-TRANSACTIONS
 *
 * Do not use prisma migrate reset, db push --force-reset, TRUNCATE, or DROP TABLE.
 */
require("dotenv").config();

const CONFIRM_TOKEN = "DELETE-TEST-TRANSACTIONS";

const ORPHAN_PAYMENT_KINDS = ["LABOR", "MATERIAL_ORDER", "JOB_STORE_ORDER", "PROVIDER_REFUND_REPAYMENT"];

function parseArgs(argv = process.argv) {
  const args = argv.slice(2).filter((a) => a != null && String(a).trim() !== "");
  const hasDryRunFlag = args.includes("--dry-run");
  const confirmArg = args.find((a) => String(a).startsWith("--confirm="));
  const bareConfirm = args.includes("--confirm");
  const confirmValue = confirmArg ? confirmArg.slice("--confirm=".length) : null;

  if (bareConfirm && !confirmArg) {
    return {
      ok: false,
      dryRun: true,
      error:
        "Aborted: destructive confirmation must be exactly --confirm=DELETE-TEST-TRANSACTIONS (equals-sign form).",
    };
  }

  if (confirmArg && confirmValue !== CONFIRM_TOKEN) {
    return {
      ok: false,
      dryRun: true,
      error: `Aborted: confirmation token is incorrect. Destructive run requires --confirm=${CONFIRM_TOKEN}`,
    };
  }

  if (hasDryRunFlag && confirmValue === CONFIRM_TOKEN) {
    return {
      ok: false,
      dryRun: true,
      error: "Aborted: pass either --dry-run or --confirm=DELETE-TEST-TRANSACTIONS, not both.",
    };
  }

  if (confirmValue === CONFIRM_TOKEN) {
    return { ok: true, dryRun: false, error: null };
  }

  return { ok: true, dryRun: true, error: null };
}

function describeDatabaseTarget(databaseUrl) {
  try {
    const normalized = String(databaseUrl || "").replace(/^postgresql:/i, "postgres:");
    const u = new URL(normalized);
    const database = decodeURIComponent((u.pathname || "").replace(/^\//, "").split("/")[0] || "");
    return {
      host: u.hostname || "(unknown)",
      port: u.port || "5432",
      database: database || "(unknown)",
      user: u.username ? decodeURIComponent(u.username) : "(unknown)",
    };
  } catch {
    return {
      host: "(unparseable)",
      port: "",
      database: "(unparseable)",
      user: "(unparseable)",
    };
  }
}

function printTargetWarning(target, dryRun) {
  console.log("============================================================");
  console.log("ELOFIX TRANSACTIONAL RESET");
  console.log("============================================================");
  console.log("WARNING: This script targets PostgreSQL");
  console.log(`  host:     ${target.host}`);
  console.log(`  port:     ${target.port || "(default)"}`);
  console.log(`  database: ${target.database}`);
  console.log(`  user:     ${target.user}`);
  console.log("  (password and full DATABASE_URL are never printed)");
  console.log("");
  if (dryRun) {
    console.log("MODE: DRY RUN — nothing will be deleted.");
    console.log("Destructive execution requires exactly:");
    console.log(`  node scripts/reset-test-transactions.js --confirm=${CONFIRM_TOKEN}`);
  } else {
    console.log("MODE: DESTRUCTIVE — jobs, material orders, and related transactional rows will be deleted.");
    console.log("Accounts, profiles, branches, inventory, categories, and banking config are preserved.");
  }
  console.log("============================================================");
}

function chunk(arr, size = 400) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function deleteManyByIds(delegate, ids) {
  return deleteManyByField(delegate, "id", ids);
}

async function deleteManyByField(delegate, field, ids) {
  if (!ids.length) return 0;
  let total = 0;
  for (const part of chunk(ids)) {
    const res = await delegate.deleteMany({ where: { [field]: { in: part } } });
    total += Number(res.count) || 0;
  }
  return total;
}

function extractDeliveryRequestId(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const raw =
    payload.deliveryRequestId ||
    payload.metadata?.deliveryRequestId ||
    payload.meta?.deliveryRequestId;
  const id = raw != null ? String(raw).trim() : "";
  return id || null;
}

async function countPreserved(db) {
  const [
    users,
    providers,
    suppliers,
    branches,
    branchUsers,
    providerWithdrawalProfiles,
    branchWithdrawalProfiles,
    categories,
  ] = await Promise.all([
    db.user.count(),
    db.provider.count(),
    db.supplier.count(),
    db.branch.count(),
    db.branchUser.count(),
    db.providerWithdrawalProfile.count(),
    db.branchWithdrawalProfile.count(),
    db.category.count(),
  ]);
  return {
    users,
    providers,
    suppliers,
    branches,
    branchUsers,
    providerWithdrawalProfiles,
    branchWithdrawalProfiles,
    categories,
  };
}

async function collectPlan(db) {
  const jobs = await db.job.findMany({ select: { id: true } });
  const jobIds = jobs.map((r) => r.id);

  const orders = await db.materialOrder.findMany({ select: { id: true } });
  const materialOrderIds = orders.map((r) => r.id);

  const disputes = jobIds.length
    ? await db.jobDispute.findMany({ where: { jobId: { in: jobIds } }, select: { id: true } })
    : [];
  const disputeIds = disputes.map((r) => r.id);

  const deliveryRequests = await db.deliveryRequest.findMany({
    where: {
      OR: [
        ...(jobIds.length ? [{ jobId: { in: jobIds } }] : []),
        ...(materialOrderIds.length ? [{ materialOrderId: { in: materialOrderIds } }] : []),
        { AND: [{ jobId: { not: null } }] },
        { AND: [{ materialOrderId: { not: null } }] },
      ],
    },
    select: { id: true },
  });
  const deliveryRequestIds = [...new Set(deliveryRequests.map((r) => r.id))];

  const linkedIntents = await db.paymentIntent.findMany({
    where: {
      OR: [
        { jobId: { not: null } },
        { materialOrderId: { not: null } },
        {
          AND: [{ jobId: null }, { materialOrderId: null }, { kind: { in: ORPHAN_PAYMENT_KINDS } }],
        },
      ],
    },
    select: { id: true, gatewayPayload: true, kind: true, jobId: true, materialOrderId: true },
  });

  const paymentIntentIdSet = new Set(linkedIntents.map((r) => r.id));

  const deliveryFeeCandidates = await db.paymentIntent.findMany({
    where: { kind: "DELIVERY_FEE" },
    select: { id: true, gatewayPayload: true, jobId: true, materialOrderId: true },
  });
  const deliveryRequestIdSet = new Set(deliveryRequestIds);
  for (const intent of deliveryFeeCandidates) {
    if (intent.jobId || intent.materialOrderId) {
      paymentIntentIdSet.add(intent.id);
      continue;
    }
    const drId = extractDeliveryRequestId(intent.gatewayPayload);
    if (drId && deliveryRequestIdSet.has(drId)) paymentIntentIdSet.add(intent.id);
  }

  const repayments = await db.providerRefundRepayment.findMany({
    where: {
      OR: [
        ...(jobIds.length ? [{ jobId: { in: jobIds } }] : []),
        ...(paymentIntentIdSet.size ? [{ paymentIntentId: { in: [...paymentIntentIdSet] } }] : []),
        { jobId: { not: null } },
      ],
    },
    select: { id: true, paymentIntentId: true },
  });
  for (const row of repayments) {
    if (row.paymentIntentId) paymentIntentIdSet.add(row.paymentIntentId);
  }

  const paymentIntentIds = [...paymentIntentIdSet];

  const recoveries = await db.refundRecovery.findMany({
    where: {
      OR: [
        ...(jobIds.length ? [{ jobId: { in: jobIds } }] : []),
        ...(disputeIds.length ? [{ disputeId: { in: disputeIds } }] : []),
        { jobId: { not: null } },
      ],
    },
    select: { id: true },
  });
  const refundRecoveryIds = recoveries.map((r) => r.id);
  const providerRefundRepaymentIds = repayments.map((r) => r.id);

  const notifications = await db.notification.findMany({
    where: {
      OR: [
        ...(jobIds.length ? [{ jobId: { in: jobIds } }] : []),
        ...(materialOrderIds.length ? [{ materialOrderId: { in: materialOrderIds } }] : []),
        { jobId: { not: null } },
        { materialOrderId: { not: null } },
      ],
    },
    select: { id: true },
  });
  const notificationIds = notifications.map((r) => r.id);

  const [
    materialRequestCount,
    commissionLedgerCount,
    paystackChargeCount,
    earningCount,
    providerReviewCount,
    completionEvidenceCount,
    disputeMessageCount,
    disputeRoundCount,
    disputeEvidenceCount,
    disputeLogCount,
    obligationCount,
    trackingCount,
    ratingCount,
    settlementEventCount,
    settlementItemCount,
    invoiceCount,
    conversationCount,
    outboxCount,
    branchStaffNotificationCount,
    legalTxnCount,
    legalAccountCount,
    webhookEventCount,
    paystackWebhookCount,
    gatewaySettlementCount,
    workPostCount,
    inventoryCategoryCount,
  ] = await Promise.all([
    jobIds.length ? db.materialRequest.count({ where: { jobId: { in: jobIds } } }) : Promise.resolve(0),
    db.commissionLedger.count({
      where: {
        OR: [
          ...(jobIds.length ? [{ jobId: { in: jobIds } }] : []),
          ...(paymentIntentIds.length ? [{ paymentIntentId: { in: paymentIntentIds } }] : []),
          { jobId: { not: null } },
        ],
      },
    }),
    jobIds.length ? db.paystackCharge.count({ where: { jobId: { in: jobIds } } }) : Promise.resolve(0),
    jobIds.length ? db.earning.count({ where: { jobId: { in: jobIds } } }) : Promise.resolve(0),
    jobIds.length ? db.providerReview.count({ where: { jobId: { in: jobIds } } }) : Promise.resolve(0),
    jobIds.length ? db.jobCompletionEvidence.count({ where: { jobId: { in: jobIds } } }) : Promise.resolve(0),
    disputeIds.length
      ? db.disputeMessage.count({ where: { disputeId: { in: disputeIds } } })
      : Promise.resolve(0),
    disputeIds.length
      ? db.jobDisputeRound.count({ where: { disputeId: { in: disputeIds } } })
      : Promise.resolve(0),
    disputeIds.length
      ? db.disputeEvidence.count({ where: { disputeId: { in: disputeIds } } })
      : Promise.resolve(0),
    disputeIds.length
      ? db.disputeResolutionLog.count({ where: { disputeId: { in: disputeIds } } })
      : Promise.resolve(0),
    jobIds.length
      ? db.customerPaymentObligation.count({ where: { jobId: { in: jobIds } } })
      : Promise.resolve(0),
    db.trackingSession.count({
      where: {
        OR: [
          ...(materialOrderIds.length ? [{ orderId: { in: materialOrderIds } }] : []),
          ...(deliveryRequestIds.length ? [{ deliveryRequestId: { in: deliveryRequestIds } }] : []),
        ],
      },
    }),
    materialOrderIds.length
      ? db.materialOrderRating.count({ where: { orderId: { in: materialOrderIds } } })
      : Promise.resolve(0),
    db.branchSettlementEvent.count({
      where: {
        OR: [
          ...(materialOrderIds.length ? [{ materialOrderId: { in: materialOrderIds } }] : []),
          ...(paymentIntentIds.length ? [{ paymentIntentId: { in: paymentIntentIds } }] : []),
        ],
      },
    }),
    paymentIntentIds.length
      ? db.gatewayPayoutSettlementItem.count({ where: { paymentIntentId: { in: paymentIntentIds } } })
      : Promise.resolve(0),
    db.invoice.count({
      where: {
        OR: [...(jobIds.length ? [{ jobId: { in: jobIds } }] : []), { jobId: { not: null } }],
      },
    }),
    db.conversation.count({
      where: {
        OR: [...(jobIds.length ? [{ jobId: { in: jobIds } }] : []), { jobId: { not: null } }],
      },
    }),
    notificationIds.length
      ? db.notificationDeliveryOutbox.count({ where: { notificationId: { in: notificationIds } } })
      : Promise.resolve(0),
    materialOrderIds.length
      ? db.branchStaffNotification.count({ where: { materialOrderId: { in: materialOrderIds } } })
      : Promise.resolve(0),
    db.legalAcceptanceEvent.count({
      where: {
        OR: [
          ...(jobIds.length ? [{ jobId: { in: jobIds } }] : []),
          ...(materialOrderIds.length ? [{ materialOrderId: { in: materialOrderIds } }] : []),
          ...(paymentIntentIds.length ? [{ paymentIntentId: { in: paymentIntentIds } }] : []),
          { jobId: { not: null } },
          { materialOrderId: { not: null } },
        ],
      },
    }),
    db.legalAcceptanceEvent.count({
      where: { jobId: null, materialOrderId: null, paymentIntentId: null },
    }),
    db.paymentWebhookEvent.count(),
    db.paystackWebhookEvent.count(),
    db.gatewayPayoutSettlement.count(),
    db.workPost.count(),
    db.branchInventoryCategory.count(),
  ]);

  const extraPreserved = {
    paymentWebhookEvents: webhookEventCount,
    paystackWebhookEvents: paystackWebhookCount,
    gatewayPayoutSettlements: gatewaySettlementCount,
    accountLevelLegalAcceptanceEvents: legalAccountCount,
    workPosts: workPostCount,
    branchInventoryCategories: inventoryCategoryCount,
  };

  return {
    ids: {
      jobIds,
      materialOrderIds,
      paymentIntentIds,
      deliveryRequestIds,
      notificationIds,
      disputeIds,
      refundRecoveryIds,
      providerRefundRepaymentIds,
    },
    counts: {
      jobs: jobIds.length,
      materialOrders: materialOrderIds.length,
      paymentIntents: paymentIntentIds.length,
      materialRequests: materialRequestCount,
      deliveryRequests: deliveryRequestIds.length,
      notifications: notificationIds.length,
      notificationDeliveryOutbox: outboxCount,
      branchStaffNotifications: branchStaffNotificationCount,
      invoices: invoiceCount,
      conversations: conversationCount,
      settlementEvents: settlementEventCount,
      gatewayPayoutSettlementItems: settlementItemCount,
      reviews: providerReviewCount,
      materialOrderRatings: ratingCount,
      disputes: disputeIds.length,
      disputeMessages: disputeMessageCount,
      disputeRounds: disputeRoundCount,
      disputeEvidence: disputeEvidenceCount,
      disputeResolutionLogs: disputeLogCount,
      completionEvidence: completionEvidenceCount,
      customerPaymentObligations: obligationCount,
      trackingSessions: trackingCount,
      commissionLedgers: commissionLedgerCount,
      paystackCharges: paystackChargeCount,
      jobEarnings: earningCount,
      refundRecoveries: refundRecoveryIds.length,
      providerRefundRepayments: providerRefundRepaymentIds.length,
      legalAcceptanceEventsTransactional: legalTxnCount,
    },
    extraPreserved,
  };
}

function printCounts(title, preserved, counts, extraPreserved) {
  console.log("");
  console.log(title);
  console.log("------------------------------------------------------------");
  console.log(`Users preserved: ${preserved.users}`);
  console.log(`Providers preserved: ${preserved.providers}`);
  console.log(`Suppliers preserved: ${preserved.suppliers}`);
  console.log(`Branches preserved: ${preserved.branches}`);
  console.log(`Branch users preserved: ${preserved.branchUsers}`);
  console.log(`ProviderWithdrawalProfile preserved: ${preserved.providerWithdrawalProfiles}`);
  console.log(`BranchWithdrawalProfile preserved: ${preserved.branchWithdrawalProfiles}`);
  console.log(`Categories preserved: ${preserved.categories}`);
  console.log(`Work posts preserved: ${extraPreserved.workPosts}`);
  console.log(`Branch inventory categories preserved: ${extraPreserved.branchInventoryCategories}`);
  console.log(`PaymentWebhookEvent preserved: ${extraPreserved.paymentWebhookEvents}`);
  console.log(`PaystackWebhookEvent preserved: ${extraPreserved.paystackWebhookEvents}`);
  console.log(`GatewayPayoutSettlement batches preserved: ${extraPreserved.gatewayPayoutSettlements}`);
  console.log(
    `Account-level LegalAcceptanceEvent preserved: ${extraPreserved.accountLevelLegalAcceptanceEvents}`
  );
  console.log("");
  console.log(`Jobs to delete: ${counts.jobs}`);
  console.log(`Material orders to delete: ${counts.materialOrders}`);
  console.log(`Payment intents to delete: ${counts.paymentIntents}`);
  console.log(`Material requests: ${counts.materialRequests}`);
  console.log(`Delivery requests (job/order-linked): ${counts.deliveryRequests}`);
  console.log(`Notifications: ${counts.notifications}`);
  console.log(`Notification delivery outbox: ${counts.notificationDeliveryOutbox}`);
  console.log(`Branch staff notifications: ${counts.branchStaffNotifications}`);
  console.log(`Invoices: ${counts.invoices}`);
  console.log(`Conversations: ${counts.conversations}`);
  console.log(`Settlement events: ${counts.settlementEvents}`);
  console.log(`Gateway payout settlement items: ${counts.gatewayPayoutSettlementItems}`);
  console.log(`Reviews: ${counts.reviews}`);
  console.log(`Material-order ratings: ${counts.materialOrderRatings}`);
  console.log(`Disputes: ${counts.disputes}`);
  console.log(`Dispute messages: ${counts.disputeMessages}`);
  console.log(`Dispute rounds: ${counts.disputeRounds}`);
  console.log(`Dispute evidence: ${counts.disputeEvidence}`);
  console.log(`Dispute resolution logs: ${counts.disputeResolutionLogs}`);
  console.log(`Completion evidence: ${counts.completionEvidence}`);
  console.log(`Customer payment obligations: ${counts.customerPaymentObligations}`);
  console.log(`Tracking sessions: ${counts.trackingSessions}`);
  console.log(`Commission ledgers: ${counts.commissionLedgers}`);
  console.log(`Paystack charges: ${counts.paystackCharges}`);
  console.log(`Job-specific earnings: ${counts.jobEarnings}`);
  console.log(`Refund recoveries: ${counts.refundRecoveries}`);
  console.log(`Provider refund repayments: ${counts.providerRefundRepayments}`);
  console.log(`Transactional legal acceptance events: ${counts.legalAcceptanceEventsTransactional}`);
}

function assertPreservedUnchanged(before, after) {
  const mismatches = [];
  for (const key of Object.keys(before)) {
    if (before[key] !== after[key]) {
      mismatches.push(`${key}: before=${before[key]} after=${after[key]}`);
    }
  }
  if (mismatches.length) {
    throw new Error(
      `Preserved table counts changed — aborting verification:\n  ${mismatches.join("\n  ")}`
    );
  }
}

async function executeDeletes(db, plan) {
  const {
    jobIds,
    materialOrderIds,
    paymentIntentIds,
    deliveryRequestIds,
    notificationIds,
    disputeIds,
    refundRecoveryIds,
    providerRefundRepaymentIds,
  } = plan.ids;

  const deleted = {};

  deleted.notificationDeliveryOutbox = await deleteManyByField(
    db.notificationDeliveryOutbox,
    "notificationId",
    notificationIds
  );

  deleted.notifications = await deleteManyByIds(db.notification, notificationIds);

  deleted.branchStaffNotifications = materialOrderIds.length
    ? (await db.branchStaffNotification.deleteMany({
        where: { materialOrderId: { in: materialOrderIds } },
      })).count
    : 0;

  deleted.conversations = (
    await db.conversation.deleteMany({
      where: {
        OR: [...(jobIds.length ? [{ jobId: { in: jobIds } }] : []), { jobId: { not: null } }],
      },
    })
  ).count;

  deleted.invoices = (
    await db.invoice.deleteMany({
      where: {
        OR: [...(jobIds.length ? [{ jobId: { in: jobIds } }] : []), { jobId: { not: null } }],
      },
    })
  ).count;

  deleted.legalAcceptanceEventsTransactional = (
    await db.legalAcceptanceEvent.deleteMany({
      where: {
        OR: [
          ...(jobIds.length ? [{ jobId: { in: jobIds } }] : []),
          ...(materialOrderIds.length ? [{ materialOrderId: { in: materialOrderIds } }] : []),
          ...(paymentIntentIds.length ? [{ paymentIntentId: { in: paymentIntentIds } }] : []),
          { jobId: { not: null } },
          { materialOrderId: { not: null } },
        ],
      },
    })
  ).count;

  deleted.settlementEvents = (
    await db.branchSettlementEvent.deleteMany({
      where: {
        OR: [
          ...(materialOrderIds.length ? [{ materialOrderId: { in: materialOrderIds } }] : []),
          ...(paymentIntentIds.length ? [{ paymentIntentId: { in: paymentIntentIds } }] : []),
        ],
      },
    })
  ).count;

  deleted.gatewayPayoutSettlementItems = paymentIntentIds.length
    ? (await db.gatewayPayoutSettlementItem.deleteMany({
        where: { paymentIntentId: { in: paymentIntentIds } },
      })).count
    : 0;

  deleted.providerRefundRepayments = await deleteManyByIds(
    db.providerRefundRepayment,
    providerRefundRepaymentIds
  );
  deleted.refundRecoveries = await deleteManyByIds(db.refundRecovery, refundRecoveryIds);

  deleted.commissionLedgers = (
    await db.commissionLedger.deleteMany({
      where: {
        OR: [
          ...(jobIds.length ? [{ jobId: { in: jobIds } }] : []),
          ...(paymentIntentIds.length ? [{ paymentIntentId: { in: paymentIntentIds } }] : []),
          { jobId: { not: null } },
        ],
      },
    })
  ).count;

  deleted.jobEarnings = jobIds.length
    ? (await db.earning.deleteMany({ where: { jobId: { in: jobIds } } })).count
    : 0;

  deleted.paystackCharges = jobIds.length
    ? (await db.paystackCharge.deleteMany({ where: { jobId: { in: jobIds } } })).count
    : 0;

  deleted.materialRequests = jobIds.length
    ? (await db.materialRequest.deleteMany({ where: { jobId: { in: jobIds } } })).count
    : 0;

  deleted.reviews = jobIds.length
    ? (await db.providerReview.deleteMany({ where: { jobId: { in: jobIds } } })).count
    : 0;

  deleted.completionEvidence = jobIds.length
    ? (await db.jobCompletionEvidence.deleteMany({ where: { jobId: { in: jobIds } } })).count
    : 0;

  deleted.customerPaymentObligations = jobIds.length
    ? (await db.customerPaymentObligation.deleteMany({ where: { jobId: { in: jobIds } } })).count
    : 0;

  deleted.disputeMessages = disputeIds.length
    ? (await db.disputeMessage.deleteMany({ where: { disputeId: { in: disputeIds } } })).count
    : 0;
  deleted.disputeRounds = disputeIds.length
    ? (await db.jobDisputeRound.deleteMany({ where: { disputeId: { in: disputeIds } } })).count
    : 0;
  deleted.disputeEvidence = disputeIds.length
    ? (await db.disputeEvidence.deleteMany({ where: { disputeId: { in: disputeIds } } })).count
    : 0;
  deleted.disputeResolutionLogs = disputeIds.length
    ? (await db.disputeResolutionLog.deleteMany({ where: { disputeId: { in: disputeIds } } })).count
    : 0;
  deleted.disputes = await deleteManyByIds(db.jobDispute, disputeIds);

  deleted.materialOrderRatings = materialOrderIds.length
    ? (await db.materialOrderRating.deleteMany({ where: { orderId: { in: materialOrderIds } } })).count
    : 0;

  deleted.trackingSessions = (
    await db.trackingSession.deleteMany({
      where: {
        OR: [
          ...(materialOrderIds.length ? [{ orderId: { in: materialOrderIds } }] : []),
          ...(deliveryRequestIds.length ? [{ deliveryRequestId: { in: deliveryRequestIds } }] : []),
        ],
      },
    })
  ).count;

  deleted.deliveryRequests = await deleteManyByIds(db.deliveryRequest, deliveryRequestIds);

  // PaymentIntent.job / .materialOrder are onDelete: SetNull — delete intents explicitly.
  // PaymentWebhookEvent is onDelete: SetNull and is intentionally preserved.
  deleted.paymentIntents = await deleteManyByIds(db.paymentIntent, paymentIntentIds);
  const sweptIntents = await db.paymentIntent.deleteMany({
    where: {
      OR: [
        { jobId: { not: null } },
        { materialOrderId: { not: null } },
        {
          AND: [{ jobId: null }, { materialOrderId: null }, { kind: { in: ORPHAN_PAYMENT_KINDS } }],
        },
      ],
    },
  });
  deleted.paymentIntents += Number(sweptIntents.count) || 0;

  // Wipe all remaining jobs/orders. Related SetNull rows were already deleted above
  // so Job/MaterialOrder delete cannot leave stale PaymentIntent FKs.
  deleted.materialOrders = (await db.materialOrder.deleteMany({})).count;
  deleted.jobs = (await db.job.deleteMany({})).count;

  return deleted;
}

async function verifyCleanup(db, deletedJobIds, deletedOrderIds) {
  const jobCount = await db.job.count();
  const orderCount = await db.materialOrder.count();
  if (jobCount !== 0) {
    throw new Error(`Post-delete verification failed: Job count is ${jobCount}, expected 0`);
  }
  if (orderCount !== 0) {
    throw new Error(`Post-delete verification failed: MaterialOrder count is ${orderCount}, expected 0`);
  }

  const staleIntents = await db.paymentIntent.count({
    where: { OR: [{ jobId: { not: null } }, { materialOrderId: { not: null } }] },
  });
  if (staleIntents !== 0) {
    throw new Error(
      `Post-delete verification failed: ${staleIntents} PaymentIntent row(s) still reference a job or material order`
    );
  }

  const leftoverTransactionalIntents = await db.paymentIntent.count({
    where: { kind: { in: ORPHAN_PAYMENT_KINDS } },
  });
  if (leftoverTransactionalIntents !== 0) {
    throw new Error(
      `Post-delete verification failed: ${leftoverTransactionalIntents} leftover LABOR/MATERIAL_ORDER/JOB_STORE_ORDER/PROVIDER_REFUND_REPAYMENT PaymentIntent row(s)`
    );
  }

  const staleDeliveryWhere = {
    OR: [
      ...(deletedJobIds.length ? [{ jobId: { in: deletedJobIds } }] : []),
      ...(deletedOrderIds.length ? [{ materialOrderId: { in: deletedOrderIds } }] : []),
    ],
  };
  const staleDelivery = staleDeliveryWhere.OR.length
    ? await db.deliveryRequest.count({ where: staleDeliveryWhere })
    : 0;
  if (staleDelivery !== 0) {
    throw new Error(
      `Post-delete verification failed: ${staleDelivery} DeliveryRequest row(s) still refer to deleted job/order IDs`
    );
  }

  const staleNotesWhere = {
    OR: [
      ...(deletedJobIds.length ? [{ jobId: { in: deletedJobIds } }] : []),
      ...(deletedOrderIds.length ? [{ materialOrderId: { in: deletedOrderIds } }] : []),
    ],
  };
  const staleNotes = staleNotesWhere.OR.length
    ? await db.notification.count({ where: staleNotesWhere })
    : 0;
  if (staleNotes !== 0) {
    throw new Error(
      `Post-delete verification failed: ${staleNotes} Notification row(s) still refer to deleted job/order IDs`
    );
  }

  const staleInvoices = deletedJobIds.length
    ? await db.invoice.count({ where: { jobId: { in: deletedJobIds } } })
    : 0;
  if (staleInvoices !== 0) {
    throw new Error(
      `Post-delete verification failed: ${staleInvoices} Invoice row(s) still refer to deleted job IDs`
    );
  }

  const staleConversations = deletedJobIds.length
    ? await db.conversation.count({ where: { jobId: { in: deletedJobIds } } })
    : 0;
  if (staleConversations !== 0) {
    throw new Error(
      `Post-delete verification failed: ${staleConversations} Conversation row(s) still refer to deleted job IDs`
    );
  }
}

async function resyncProviderAggregates(prisma) {
  const { syncProviderAggregateRating } = require("../src/services/providerAggregateRating.service");
  const providers = await prisma.provider.findMany({ select: { id: true } });
  let updated = 0;
  for (const p of providers) {
    await syncProviderAggregateRating(p.id);
    updated += 1;
  }
  return updated;
}

function printDeletedCounts(deleted) {
  console.log("");
  console.log("Actual deleted counts");
  console.log("------------------------------------------------------------");
  const labels = [
    ["jobs", "Jobs"],
    ["materialOrders", "Material orders"],
    ["paymentIntents", "Payment intents"],
    ["materialRequests", "Material requests"],
    ["deliveryRequests", "Delivery requests"],
    ["notifications", "Notifications"],
    ["notificationDeliveryOutbox", "Notification delivery outbox"],
    ["branchStaffNotifications", "Branch staff notifications"],
    ["invoices", "Invoices"],
    ["conversations", "Conversations"],
    ["settlementEvents", "Settlement events"],
    ["gatewayPayoutSettlementItems", "Gateway payout settlement items"],
    ["reviews", "Reviews"],
    ["materialOrderRatings", "Material-order ratings"],
    ["disputes", "Disputes"],
    ["disputeMessages", "Dispute messages"],
    ["disputeRounds", "Dispute rounds"],
    ["disputeEvidence", "Dispute evidence"],
    ["disputeResolutionLogs", "Dispute resolution logs"],
    ["completionEvidence", "Completion evidence"],
    ["customerPaymentObligations", "Customer payment obligations"],
    ["trackingSessions", "Tracking sessions"],
    ["commissionLedgers", "Commission ledgers"],
    ["paystackCharges", "Paystack charges"],
    ["jobEarnings", "Job-specific earnings"],
    ["refundRecoveries", "Refund recoveries"],
    ["providerRefundRepayments", "Provider refund repayments"],
    ["legalAcceptanceEventsTransactional", "Transactional legal acceptance events"],
  ];
  for (const [key, label] of labels) {
    console.log(`${label} deleted: ${deleted[key] ?? 0}`);
  }
}

async function runReset(options = {}) {
  const parsed = options.parsed || parseArgs(options.argv || process.argv);
  if (!parsed.ok) {
    console.error(parsed.error);
    return { ok: false, dryRun: true, error: parsed.error };
  }

  const { resolveDatabaseUrl } = require("../src/config/databaseUrl");
  const databaseUrl = resolveDatabaseUrl();
  const target = describeDatabaseTarget(databaseUrl);
  printTargetWarning(target, parsed.dryRun);

  const prisma = require("../src/config/prisma");
  const preservedBefore = await countPreserved(prisma);
  const plan = await collectPlan(prisma);
  printCounts(
    parsed.dryRun ? "Dry-run counts (WOULD be deleted)" : "Pre-delete counts",
    preservedBefore,
    plan.counts,
    plan.extraPreserved
  );

  if (parsed.dryRun) {
    console.log("");
    console.log("Dry run complete. No rows were deleted.");
    return {
      ok: true,
      dryRun: true,
      target,
      preserved: preservedBefore,
      plan,
      deleted: null,
    };
  }

  const deleted = await prisma.$transaction(
    async (tx) => {
      const result = await executeDeletes(tx, plan);
      const preservedAfterTx = await countPreserved(tx);
      assertPreservedUnchanged(preservedBefore, preservedAfterTx);
      await verifyCleanup(tx, plan.ids.jobIds, plan.ids.materialOrderIds);
      return result;
    },
    { timeout: 180_000, maxWait: 15_000 }
  );

  const preservedAfter = await countPreserved(prisma);
  assertPreservedUnchanged(preservedBefore, preservedAfter);

  printDeletedCounts(deleted);

  const resynced = await resyncProviderAggregates(prisma);
  console.log("");
  console.log(`Provider rating aggregates resynced: ${resynced} provider profile(s)`);
  console.log("(same logic as node scripts/resync-provider-aggregates.js)");
  console.log("");
  console.log("Transactional reset complete.");
  console.log(`Users preserved: ${preservedAfter.users}`);
  console.log(`Providers preserved: ${preservedAfter.providers}`);
  console.log(`Suppliers preserved: ${preservedAfter.suppliers}`);
  console.log(`Branches preserved: ${preservedAfter.branches}`);

  return {
    ok: true,
    dryRun: false,
    target,
    preserved: preservedAfter,
    plan,
    deleted,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("reset-test-transactions: DATABASE_URL is required");
    process.exitCode = 1;
    return;
  }

  const parsed = parseArgs(process.argv);
  try {
    const result = await runReset({ parsed });
    if (!result.ok) process.exitCode = 1;
  } catch (err) {
    console.error("reset-test-transactions failed:", err?.message || err);
    if (err?.stack) console.error(err.stack);
    process.exitCode = 1;
  } finally {
    try {
      const prisma = require("../src/config/prisma");
      await prisma.$disconnect();
    } catch {
      /* ignore */
    }
    try {
      if (globalThis.__elofixPgPool?.end) {
        await globalThis.__elofixPgPool.end();
      }
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  CONFIRM_TOKEN,
  parseArgs,
  describeDatabaseTarget,
  countPreserved,
  collectPlan,
  executeDeletes,
  verifyCleanup,
  runReset,
};

if (require.main === module) {
  main();
}
