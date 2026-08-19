const { Prisma } = require("@prisma/client");
const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const earningService = require("./earning.service");
const bankCrypto = require("../utils/bankCrypto");
const fraudDetection = require("./fraudDetection.service");
const providerTrustScore = require("./providerTrustScore.service");
const notificationEvents = require("./notificationEvents.service");
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES } = require("../constants/auditActions");
const { idempotencyGate, idempotencyCommit } = require("../utils/idempotencyTransaction");
const { enrichJob, normalizeMeta } = require("./jobMeta.service");
const payoutDestinationService = require("./payoutDestination.service");
const paymentService = require("./payment.service");
const { sumProviderShareTotals } = require("../utils/providerEarningsSummary.util");

function coerceMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new AppError("amount must be a positive number", 400);
  }
  return n;
}

async function requireProviderByUserId(userId) {
  const provider = await prisma.provider.findUnique({
    where: { userId: String(userId) },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!provider) throw new AppError("Provider profile not found", 404);
  return provider;
}

function jobToEarningRow(job, clawbackFromLedger = 0) {
  const meta = normalizeMeta(job.meta);
  const e = enrichJob(job, meta);
  const amount = e.totalPrice != null && !Number.isNaN(Number(e.totalPrice)) ? Number(e.totalPrice) : Number(job.price) || 0;
  const released = Boolean(job.paymentReleased);
  const paidLabor = Boolean(job.laborPaid);
  const summary = e.paymentSummary || null;
  let status = "PENDING";
  if (released || String(job.paymentProgress) === "FULLY_PAID") status = "RELEASED";
  else if (paidLabor || String(job.paymentProgress) === "FIRST_PAID") status = "PENDING";

  const clawbackMeta = Number(e.refundDetails?.clawbackApplied) || 0;
  const clawbackFromReleased = Math.max(clawbackMeta, Number(clawbackFromLedger) || 0);
  const escrowReversed = Number(e.refundDetails?.escrowApplied) || 0;
  const releasedAmount = Number(e.releasedAmount) || 0;
  const netReleasedAfterRefund = Math.max(0, releasedAmount - clawbackFromReleased);

  const paymentLabel =
    String(job.paymentProgress) === "FULLY_PAID"
      ? "Fully Paid"
      : String(job.paymentProgress) === "FIRST_PAID"
        ? "50% Paid"
        : paidLabor
          ? "Paid"
          : "Unpaid";

  return {
    id: job.id,
    title: job.title,
    category: job.category,
    amount,
    totalPrice: e.totalPrice,
    commissionAmount: e.commissionAmount,
    providerAmount: e.providerAmount,
    releasedAmount: e.releasedAmount,
    remainingAmount: e.remainingAmount,
    status,
    workflowStatus: e.status,
    laborPaid: paidLabor,
    paymentReleased: released,
    paymentProgress: job.paymentProgress || "NONE",
    paymentLabel,
    legacyEscrowV2: Boolean(job.legacyEscrowV2),
    customerPaidTotal: summary ? summary.totalPaidByCustomer : e.customerPaidTotal,
    customerRemaining: summary ? summary.totalRemainingByCustomer : null,
    providerShareRecorded: summary ? summary.providerShareRecorded : Number(e.providerAmount) || 0,
    providerShareRemaining: summary ? summary.providerShareRemaining : Number(e.remainingAmount) || 0,
    paymentSummary: summary,
    refundAmount: e.refundAmount,
    refundStatus: e.refundStatus,
    refundDetails: e.refundDetails,
    providerRefundDebt: e.providerRefundDebt,
    clawbackFromReleased,
    escrowReversed,
    netReleasedAfterRefund,
    completionPaymentDue: e.completionPaymentDue || null,
    completionPayment: e.completionPayment || null,
    createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : String(job.createdAt),
    customerName: job.customer?.name,
    courierFlow: Boolean(meta.courierFlow),
  };
}

async function getJobClawbackMap(providerId, jobIds) {
  if (!jobIds.length) return {};
  const rows = await prisma.earning.groupBy({
    by: ["jobId"],
    where: {
      providerId,
      type: "debit",
      status: "clawback",
      jobId: { in: jobIds },
    },
    _sum: { amount: true },
  });
  return Object.fromEntries(
    rows.filter((r) => r.jobId).map((r) => [r.jobId, Number(r._sum.amount) || 0])
  );
}

async function getLedgerSummary(providerId) {
  const [pendingSum, availSum, debitWithdrawnSum, debitPendingSum, clawbackSum, refundDebtSum] =
    await Promise.all([
    prisma.earning.aggregate({
      where: { providerId, type: "credit", status: "pending" },
      _sum: { amount: true },
    }),
    prisma.earning.aggregate({
      where: { providerId, type: "credit", status: "available" },
      _sum: { amount: true },
    }),
    prisma.earning.aggregate({
      where: { providerId, type: "debit", status: "withdrawn" },
      _sum: { amount: true },
    }),
    prisma.earning.aggregate({
      where: { providerId, type: "debit", status: "pending" },
      _sum: { amount: true },
    }),
    prisma.earning.aggregate({
      where: { providerId, type: "debit", status: "clawback" },
      _sum: { amount: true },
    }),
    prisma.earning.aggregate({
      where: { providerId, type: "debit", status: "refund_debt" },
      _sum: { amount: true },
    }),
  ]);

  const pending = Number(pendingSum._sum.amount) || 0;
  const creditsAvailable = Number(availSum._sum.amount) || 0;
  const withdrawn = Number(debitWithdrawnSum._sum.amount) || 0;
  const reservedPending = Number(debitPendingSum._sum.amount) || 0;
  const clawback = Number(clawbackSum._sum.amount) || 0;
  const refundDebtOwed = Number(refundDebtSum._sum.amount) || 0;
  const available = Math.max(0, creditsAvailable - withdrawn - reservedPending - clawback);

  return { pending, creditsAvailable, withdrawn, reservedPending, clawback, refundDebtOwed, available };
}

async function getProviderBalance(userId) {
  const provider = await requireProviderByUserId(userId);
  const s = await getLedgerSummary(provider.id);
  return {
    available: s.available,
    pending: s.pending,
    withdrawn: s.withdrawn,
    refundDebtOwed: s.refundDebtOwed,
    totalClawback: s.clawback,
  };
}

async function getDeliveryContextByJobIds(jobIds) {
  const ids = (jobIds || []).map((id) => String(id)).filter(Boolean);
  const map = new Map();
  if (!ids.length) return map;
  const rows = await prisma.deliveryRequest.findMany({
    where: { jobId: { in: ids } },
    select: { jobId: true, status: true, fulfillmentStatus: true, payload: true },
  });
  for (const row of rows) {
    if (!row.jobId) continue;
    const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
    const payment = payload.payment && typeof payload.payment === "object" ? payload.payment : {};
    const drStatus = String(row.status || "").toLowerCase();
    const deliveryPaid =
      ["paid", "in_transit", "completed"].includes(drStatus) || payment.deliveryPaid === true;
    map.set(String(row.jobId), {
      fulfillmentStatus: row.fulfillmentStatus ? String(row.fulfillmentStatus) : null,
      deliveryPaid,
    });
  }
  return map;
}

function withDeliveryContext(row, deliveryByJob) {
  const ctx = deliveryByJob.get(String(row.id)) || {};
  return {
    ...row,
    fulfillmentStatus: ctx.fulfillmentStatus || null,
    deliveryPaid: Boolean(ctx.deliveryPaid),
  };
}

async function getProviderEarnings(userId) {
  const provider = await requireProviderByUserId(userId);
  const providerUserId = provider.userId;

  let jobs = await prisma.job.findMany({
    where: { providerId: providerUserId },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { name: true } },
    },
  });

  // Heal cancelled courier forfeit jobs that never released escrow to the provider.
  let healedAny = false;
  for (const job of jobs) {
    const refreshed = await paymentService.releaseForfeitedCourierEscrowIfNeeded(job, provider.id);
    if (
      refreshed &&
      (Number(refreshed.releasedAmount) || 0) !== (Number(job.releasedAmount) || 0)
    ) {
      healedAny = true;
    }
  }
  if (healedAny) {
    jobs = await prisma.job.findMany({
      where: { providerId: providerUserId },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true } },
      },
    });
  }

  const ledger = await getLedgerSummary(provider.id);

  const withdrawals = await prisma.withdrawalRequest.findMany({
    where: { providerId: provider.id },
  });
  const openStatuses = new Set(["pending", "approved", "PENDING", "APPROVED"]);
  const pendingWithdrawals = withdrawals.filter((w) => openStatuses.has(String(w.status)));
  const pendingWithdrawalAmount = pendingWithdrawals.reduce((s, w) => s + Number(w.amount), 0);

  const jobIds = jobs.map((j) => j.id);
  const clawbackMap = await getJobClawbackMap(provider.id, jobIds);
  const deliveryByJob = await getDeliveryContextByJobIds(jobIds);

  const earningRows = jobs.map((job) =>
    withDeliveryContext(
      {
        ...jobToEarningRow(job, clawbackMap[job.id] || 0),
        customerName: job.customer?.name || null,
      },
      deliveryByJob
    )
  );
  const providerEscrowRemaining = earningRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.remainingAmount) || 0),
    0
  );
  const { totalProviderShareRecorded, totalProviderShareRemaining } =
    sumProviderShareTotals(earningRows);
  const hasLegacyJobs = earningRows.some((row) => row.legacyEscrowV2);

  const paidIntents =
    jobIds.length === 0
      ? []
      : await prisma.paymentIntent.findMany({
          where: {
            jobId: { in: jobIds },
            kind: "LABOR",
            state: "PAID",
            recipientUserId: providerUserId,
          },
          orderBy: { paidAt: "desc" },
          select: {
            id: true,
            jobId: true,
            paymentType: true,
            amount: true,
            commissionAmount: true,
            recipientAmount: true,
            merchantReference: true,
            paidAt: true,
            createdAt: true,
          },
        });

  const jobMetaById = new Map(
    earningRows.map((row) => [
      row.id,
      {
        title: row.title || row.category || "Service",
        category: row.category || null,
        customerName: row.customerName || null,
        providerShareRecorded: Number(row.providerShareRecorded) || 0,
        providerShareRemaining: Number(row.providerShareRemaining) || 0,
        customerPaidTotal: row.customerPaidTotal != null ? Number(row.customerPaidTotal) : null,
        customerRemaining: row.customerRemaining != null ? Number(row.customerRemaining) : null,
      },
    ])
  );

  const settlementRecords = paidIntents.map((intent) => {
    const meta = intent.jobId ? jobMetaById.get(intent.jobId) : null;
    return {
      id: intent.id,
      jobId: intent.jobId,
      jobTitle: meta?.title || null,
      jobCategory: meta?.category || null,
      customerName: meta?.customerName || null,
      paymentType: intent.paymentType,
      customerAmount: Number(intent.amount) || 0,
      commissionAmount: Number(intent.commissionAmount) || 0,
      providerShare: Number(intent.recipientAmount) || 0,
      merchantReference: intent.merchantReference,
      paidAt: intent.paidAt
        ? intent.paidAt instanceof Date
          ? intent.paidAt.toISOString()
          : String(intent.paidAt)
        : intent.createdAt instanceof Date
          ? intent.createdAt.toISOString()
          : String(intent.createdAt),
    };
  });

  return {
    summary: {
      totalReleased: ledger.creditsAvailable,
      withdrawn: ledger.withdrawn,
      pendingWithdrawals: pendingWithdrawalAmount,
      available: ledger.available,
      refundDebtOwed: ledger.refundDebtOwed,
      totalClawback: ledger.clawback,
      pending: ledger.pending,
      providerEscrowRemaining,
      totalProviderShareRecorded,
      totalProviderShareRemaining,
      hasLegacyJobs,
    },
    jobs: earningRows,
    settlementRecords,
  };
}

async function getProviderEarningJob(userId, jobId) {
  const provider = await requireProviderByUserId(userId);
  let job = await prisma.job.findFirst({
    where: { id: jobId, providerId: provider.userId },
    include: {
      customer: { select: { id: true, name: true, email: true } },
    },
  });
  if (!job) throw new AppError("Job not found", 404);
  const beforeReleased = Number(job.releasedAmount) || 0;
  const healed = await paymentService.releaseForfeitedCourierEscrowIfNeeded(job, provider.id);
  if ((Number(healed.releasedAmount) || 0) !== beforeReleased) {
    job = await prisma.job.findFirst({
      where: { id: jobId, providerId: provider.userId },
      include: {
        customer: { select: { id: true, name: true, email: true } },
      },
    });
  }
  const clawbackMap = await getJobClawbackMap(provider.id, [job.id]);
  const deliveryByJob = await getDeliveryContextByJobIds([job.id]);
  return {
    job: withDeliveryContext(
      {
        ...jobToEarningRow(job, clawbackMap[job.id] || 0),
        customerName: job.customer?.name,
      },
      deliveryByJob
    ),
  };
}

const ACCOUNT_TYPES = new Set(["CHEQUE", "SAVINGS", "CURRENT"]);
const VERIFICATION_STATUSES = new Set([
  "NOT_CONFIGURED",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "ACTION_REQUIRED",
  "REJECTED",
  "SUSPENDED",
]);

function normalizeAccountType(raw) {
  const v = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (!v) return null;
  if (v === "CHECKING" || v === "CHEQUE_ACCOUNT") return "CHEQUE";
  if (!ACCOUNT_TYPES.has(v)) return null;
  return v;
}

function deriveVerificationStatus(profile) {
  if (!profile || profile.isActive === false) return "NOT_CONFIGURED";
  if (profile.verificationStatus && VERIFICATION_STATUSES.has(String(profile.verificationStatus))) {
    return String(profile.verificationStatus);
  }
  if (profile.bankName && profile.accountHolder) return "PENDING_VERIFICATION";
  return "NOT_CONFIGURED";
}

function providerProfileResponse(profile, verificationStatus, removeMeta = {}) {
  return {
    profile: bankCrypto.toPublicProfileRow(profile, { verificationStatus }),
    verificationStatus,
    gatewaySettlementSupported: payoutDestinationService.gatewaySettlementSupported(),
    canRemove: removeMeta.canRemove ?? false,
    removeBlockedReason: removeMeta.removeBlockedReason,
  };
}

async function logPayoutAudit(action, provider, profile, actorUserId, meta = {}) {
  await logAudit(action, {
    actorUserId,
    entityType: ENTITY_TYPES.PROVIDER,
    entityId: provider.id,
    meta: {
      providerUserId: provider.userId,
      verificationStatus: profile?.verificationStatus || null,
      accountMasked: profile ? bankCrypto.maskAccountNumber(profile.accountNumber) : null,
      ...meta,
    },
  });
}

function buildProviderBankPayload(existing, body) {
  const bankName = String(body?.bankName || "").trim();
  const accountHolder = String(body?.accountHolder || "").trim();
  if (bankName.length < 2) throw new AppError("bankName is required", 400);
  if (accountHolder.length < 2) throw new AppError("accountHolder is required", 400);

  const accountTypeIn = normalizeAccountType(body?.accountType);
  if (!existing && !accountTypeIn) {
    throw new AppError("accountType is required (CHEQUE, SAVINGS, or CURRENT)", 400);
  }
  if (body?.accountType != null && String(body.accountType).trim() !== "" && !accountTypeIn) {
    throw new AppError("accountType must be CHEQUE, SAVINGS, or CURRENT", 400);
  }

  const accIn = String(body?.accountNumber ?? "").trim();
  const branchIn = String(body?.branchCode ?? "").trim();

  let accountEnc;
  let branchEnc;
  if (existing) {
    accountEnc = accIn.length >= 4 ? bankCrypto.encryptField(accIn) : existing.accountNumber;
    branchEnc = branchIn.length >= 2 ? bankCrypto.encryptField(branchIn) : existing.branchCode;
  } else {
    if (accIn.length < 4) throw new AppError("accountNumber is required", 400);
    if (branchIn.length < 2) throw new AppError("branchCode is required", 400);
    accountEnc = bankCrypto.encryptField(accIn);
    branchEnc = bankCrypto.encryptField(branchIn);
  }

  const plainAccount =
    accIn.length >= 4 ? accIn : existing ? bankCrypto.decryptField(existing.accountNumber) : accIn;
  const plainBranch =
    branchIn.length >= 2 ? branchIn : existing ? bankCrypto.decryptField(existing.branchCode) : branchIn;

  const accountType = accountTypeIn || existing?.accountType || null;
  const incomingPlain = {
    bankName,
    accountHolder,
    accountNumber: plainAccount,
    branchCode: plainBranch,
    accountType,
  };

  return {
    bankName,
    accountHolder,
    accountEnc,
    branchEnc,
    accountType,
    incomingPlain,
  };
}

async function persistProviderWithdrawalProfile(userId, body, { mode = "upsert", actorUserId } = {}) {
  const provider = await requireProviderByUserId(userId);
  const existing = await prisma.providerWithdrawalProfile.findUnique({
    where: { providerId: provider.id },
  });

  if (mode === "replace") {
    if (!body?.confirmReplace) {
      throw new AppError("confirmReplace: true is required to replace payout bank details", 400);
    }
    if (!existing) throw new AppError("No payout profile to replace", 404);
    const accIn = String(body?.accountNumber ?? "").trim();
    const branchIn = String(body?.branchCode ?? "").trim();
    if (accIn.length < 4) throw new AppError("accountNumber is required for replace", 400);
    if (branchIn.length < 2) throw new AppError("branchCode is required for replace", 400);
  }

  const payload = buildProviderBankPayload(existing, body);
  const materialChange = payoutDestinationService.detectMaterialBankChange(existing, payload.incomingPlain);

  if (existing && mode === "upsert" && !materialChange) {
    const removeMeta = await payoutDestinationService.canDeactivatePayoutProfile({
      scope: "provider",
      entityId: provider.id,
    });
    return providerProfileResponse(existing, deriveVerificationStatus(existing), removeMeta);
  }

  const bankCheck = await fraudDetection.checkBankAccountDuplicate(
    payload.bankName,
    payload.incomingPlain.branchCode,
    payload.incomingPlain.accountNumber,
    provider.id
  );

  let verificationStatus = bankCheck.duplicate ? "ACTION_REQUIRED" : "PENDING_VERIFICATION";

  if (existing && materialChange && existing.gatewayRecipientId) {
    await payoutDestinationService.deactivatePayoutDestination({
      scope: "provider",
      entityId: provider.id,
      profile: existing,
    }).catch(() => {});
  }

  const profile = await prisma.providerWithdrawalProfile.upsert({
    where: { providerId: provider.id },
    create: {
      id: randomUUID(),
      providerId: provider.id,
      bankName: payload.bankName,
      accountHolder: payload.accountHolder,
      accountNumber: payload.accountEnc,
      branchCode: payload.branchEnc,
      accountType: payload.accountType,
      verificationStatus,
      bankAccountHash: bankCheck.hash,
      isActive: true,
      deactivatedAt: null,
    },
    update: {
      bankName: payload.bankName,
      accountHolder: payload.accountHolder,
      accountNumber: payload.accountEnc,
      branchCode: payload.branchEnc,
      ...(payload.accountType ? { accountType: payload.accountType } : {}),
      verificationStatus,
      bankAccountHash: bankCheck.hash,
      isActive: true,
      deactivatedAt: null,
      ...(materialChange
        ? {
            gatewayRecipientId: null,
            gatewayProfileStatus: null,
            gatewayProfilePayload: null,
          }
        : {}),
    },
  });

  if (materialChange) {
    await prisma.provider.update({
      where: { id: provider.id },
      data: { bankVerifiedAt: null },
    });
  }

  if (!bankCheck.duplicate) {
    const registration = await payoutDestinationService.registerPayoutDestination({
      scope: "provider",
      entityId: provider.id,
    });
    verificationStatus = registration.verificationStatus || verificationStatus;
  }

  const providerService = require("./provider.service");
  await providerService.persistProfileCompleted(provider.id);

  const refreshed = await prisma.providerWithdrawalProfile.findUnique({
    where: { providerId: provider.id },
  });
  const auditAction =
    mode === "replace"
      ? AUDIT_ACTIONS.PAYOUT_PROFILE_REPLACED
      : existing
        ? AUDIT_ACTIONS.PAYOUT_PROFILE_UPDATED
        : AUDIT_ACTIONS.PAYOUT_PROFILE_CREATED;
  await logPayoutAudit(auditAction, provider, refreshed, actorUserId || userId, {
    mode,
    materialChange,
    duplicateDetected: bankCheck.duplicate,
  });
  await logPayoutAudit(AUDIT_ACTIONS.PAYOUT_VERIFICATION_REQUESTED, provider, refreshed, actorUserId || userId);

  const removeMeta = await payoutDestinationService.canDeactivatePayoutProfile({
    scope: "provider",
    entityId: provider.id,
  });

  return providerProfileResponse(refreshed, verificationStatus, removeMeta);
}

async function getWithdrawalProfile(userId) {
  const provider = await requireProviderByUserId(userId);
  const profile = await prisma.providerWithdrawalProfile.findUnique({
    where: { providerId: provider.id },
  });
  if (!profile || profile.isActive === false) {
    return {
      profile: null,
      verificationStatus: "NOT_CONFIGURED",
      gatewaySettlementSupported: payoutDestinationService.gatewaySettlementSupported(),
      canRemove: false,
    };
  }
  const verificationStatus = deriveVerificationStatus(profile);
  const removeMeta = await payoutDestinationService.canDeactivatePayoutProfile({
    scope: "provider",
    entityId: provider.id,
  });
  return providerProfileResponse(profile, verificationStatus, removeMeta);
}

async function upsertWithdrawalProfile(userId, body) {
  return persistProviderWithdrawalProfile(userId, body, { mode: "upsert", actorUserId: userId });
}

async function replaceWithdrawalProfile(userId, body) {
  return persistProviderWithdrawalProfile(userId, body, { mode: "replace", actorUserId: userId });
}

async function deactivateWithdrawalProfile(userId) {
  const provider = await requireProviderByUserId(userId);
  const profile = await prisma.providerWithdrawalProfile.findUnique({
    where: { providerId: provider.id },
  });
  if (!profile || profile.isActive === false) {
    throw new AppError("No active payout profile to remove", 404);
  }

  const removeMeta = await payoutDestinationService.canDeactivatePayoutProfile({
    scope: "provider",
    entityId: provider.id,
  });
  if (!removeMeta.canRemove) {
    throw new AppError(removeMeta.removeBlockedReason || "Cannot remove payout profile", 409);
  }

  await payoutDestinationService.deactivatePayoutDestination({
    scope: "provider",
    entityId: provider.id,
    profile,
  });

  await logPayoutAudit(AUDIT_ACTIONS.PAYOUT_PROFILE_DEACTIVATED, provider, profile, userId);

  return {
    profile: null,
    verificationStatus: "NOT_CONFIGURED",
    gatewaySettlementSupported: payoutDestinationService.gatewaySettlementSupported(),
    canRemove: false,
  };
}

async function requestWithdrawal(userId, body, idempotencyKey, requestHash, route) {
  throw new AppError(
    "In-app withdrawals are disabled. Provider settlement is recorded per payment transaction and paid outside EloFix until a split-capable payment gateway is connected.",
    410
  );
  const provider = await requireProviderByUserId(userId);
  if (provider.blocked) {
    throw new AppError("Withdrawals are frozen while your account is blocked", 403);
  }
  const trust = await providerTrustScore.getTrustScoreForProviderProfile(provider.id);
  if (trust?.isHighRisk) {
    throw new AppError(
      "Withdrawals are unavailable while your trust score is High Risk. Improve your score to request payouts.",
      403
    );
  }
  const amount = coerceMoney(body?.amount);
  const bank = await prisma.providerWithdrawalProfile.findUnique({
    where: { providerId: provider.id },
  });
  if (!bank) {
    throw new AppError("Add withdrawal bank details before requesting a payout", 400);
  }

  const txResult = await prisma.$transaction(
    async (tx) => {
      const gate = await idempotencyGate(tx, { idempotencyKey, requestHash, route });
      if (gate.replay) {
        return { replay: true };
      }

      const ledger = await getLedgerSummaryTx(tx, provider.id);
      if (amount > ledger.available) {
        throw new AppError("Insufficient funds", 400);
      }

      const openDisputeCount = await tx.jobDispute.count({
        where: {
          providerId: String(provider.userId),
          status: { in: ["OPEN", "UNDER_INVESTIGATION"] },
        },
      });
      if (openDisputeCount > 0) {
        throw new AppError("Withdrawals are unavailable while you have an open dispute", 403);
      }

      const withdrawal = await tx.withdrawalRequest.create({
        data: {
          id: randomUUID(),
          providerId: provider.id,
          amount,
          status: "paid",
          idempotencyKey,
        },
      });

      await earningService.createPendingWithdrawalDebit(tx, {
        providerId: provider.id,
        amount,
        withdrawalRequestId: withdrawal.id,
        debitStatus: "withdrawn",
      });

      await idempotencyCommit(tx, { idempotencyKey, requestHash, route });
      return { replay: false, withdrawal };
    },
    {
      maxWait: 5000,
      timeout: 15000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );

  if (txResult.replay) {
    const existing = await prisma.withdrawalRequest.findUnique({
      where: { idempotencyKey },
    });
    if (!existing) {
      throw new AppError("Idempotent replay missing withdrawal row", 409);
    }
    return {
      withdrawal: {
        id: existing.id,
        amount: Number(existing.amount),
        status: existing.status,
        createdAt: existing.createdAt.toISOString(),
      },
    };
  }

  const row = txResult.withdrawal;
  await logAudit(AUDIT_ACTIONS.WITHDRAWAL_REQUEST, {
    userId,
    entityType: ENTITY_TYPES.WITHDRAWAL,
    entityId: row.id,
    newValue: { providerId: provider.id, amount, autoPaid: true },
  });
  await notificationEvents.notifyWithdrawalStatus(
    provider.userId,
    row.id,
    row.status || "paid",
    row.amount,
    "provider"
  );

  return {
    withdrawal: {
      id: row.id,
      amount: Number(row.amount),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    },
  };
}

async function getLedgerSummaryTx(tx, providerId) {
  const [pendingSum, availSum, debitWithdrawnSum, debitPendingSum, clawbackSum, refundDebtSum] =
    await Promise.all([
    tx.earning.aggregate({
      where: { providerId, type: "credit", status: "pending" },
      _sum: { amount: true },
    }),
    tx.earning.aggregate({
      where: { providerId, type: "credit", status: "available" },
      _sum: { amount: true },
    }),
    tx.earning.aggregate({
      where: { providerId, type: "debit", status: "withdrawn" },
      _sum: { amount: true },
    }),
    tx.earning.aggregate({
      where: { providerId, type: "debit", status: "pending" },
      _sum: { amount: true },
    }),
    tx.earning.aggregate({
      where: { providerId, type: "debit", status: "clawback" },
      _sum: { amount: true },
    }),
    tx.earning.aggregate({
      where: { providerId, type: "debit", status: "refund_debt" },
      _sum: { amount: true },
    }),
  ]);

  const pending = Number(pendingSum._sum.amount) || 0;
  const creditsAvailable = Number(availSum._sum.amount) || 0;
  const withdrawn = Number(debitWithdrawnSum._sum.amount) || 0;
  const reservedPending = Number(debitPendingSum._sum.amount) || 0;
  const clawback = Number(clawbackSum._sum.amount) || 0;
  const refundDebtOwed = Number(refundDebtSum._sum.amount) || 0;
  const available = Math.max(0, creditsAvailable - withdrawn - reservedPending - clawback);

  return { pending, creditsAvailable, withdrawn, reservedPending, clawback, refundDebtOwed, available };
}

async function listProviderTransactions(userId) {
  const provider = await requireProviderByUserId(userId);

  const [withdrawals, clawbacks, debts, jobs] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where: { providerId: provider.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.earning.findMany({
      where: { providerId: provider.id, type: "debit", status: "clawback" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.earning.findMany({
      where: { providerId: provider.id, type: "debit", status: "refund_debt" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.job.findMany({
      where: { providerId: provider.userId },
      select: { id: true, title: true, meta: true, createdAt: true },
    }),
  ]);

  const jobTitleMap = Object.fromEntries(jobs.map((j) => [j.id, j.title]));

  const transactions = [];

  for (const w of withdrawals) {
    transactions.push({
      id: w.id,
      kind: "withdrawal",
      amount: Number(w.amount),
      status: w.status,
      jobId: null,
      jobTitle: null,
      createdAt: w.createdAt instanceof Date ? w.createdAt.toISOString() : String(w.createdAt),
      description: "Bank withdrawal",
    });
  }

  for (const row of clawbacks) {
    const isDebtRecovery = String(row.idempotencyKey || "").includes(":debt:");
    transactions.push({
      id: row.id,
      kind: isDebtRecovery ? "debt_recovery" : "refund_clawback",
      amount: Number(row.amount),
      status: null,
      jobId: row.jobId,
      jobTitle: row.jobId ? jobTitleMap[row.jobId] || null : null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      description: isDebtRecovery
        ? "Refund debt recovered from release"
        : "Refund recovery — deducted from balance",
    });
  }

  for (const row of debts) {
    transactions.push({
      id: row.id,
      kind: "refund_debt",
      amount: Number(row.amount),
      status: null,
      jobId: row.jobId,
      jobTitle: row.jobId ? jobTitleMap[row.jobId] || null : null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      description: "Refund debt recorded — recovered from future releases",
    });
  }

  for (const job of jobs) {
    const meta = normalizeMeta(job.meta);
    const escrowApplied = Number(meta?.refund?.escrowApplied) || 0;
    if (escrowApplied <= 0) continue;
    const processedAt = meta?.refund?.processedAt;
    const createdAt =
      processedAt != null && String(processedAt).trim() !== ""
        ? String(processedAt)
        : job.createdAt instanceof Date
          ? job.createdAt.toISOString()
          : String(job.createdAt);
    transactions.push({
      id: `escrow-refund:${job.id}`,
      kind: "refund_escrow_reversal",
      amount: escrowApplied,
      status: null,
      jobId: job.id,
      jobTitle: job.title || null,
      createdAt,
      description: "Refund reversed from escrow",
    });
  }

  transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { transactions };
}

async function listProviderWithdrawals(userId) {
  const provider = await requireProviderByUserId(userId);
  const rows = await prisma.withdrawalRequest.findMany({
    where: { providerId: provider.id },
    orderBy: { createdAt: "desc" },
  });
  return {
    withdrawals: rows.map((w) => ({
      id: w.id,
      amount: Number(w.amount),
      status: w.status,
      createdAt: w.createdAt instanceof Date ? w.createdAt.toISOString() : String(w.createdAt),
    })),
  };
}

module.exports = {
  getProviderEarnings,
  getProviderEarningJob,
  getProviderBalance,
  getLedgerSummary,
  getLedgerSummaryTx,
  getWithdrawalProfile,
  upsertWithdrawalProfile,
  replaceWithdrawalProfile,
  deactivateWithdrawalProfile,
  listProviderWithdrawals,
  listProviderTransactions,
  requestWithdrawal,
  jobToEarningRow,
};
