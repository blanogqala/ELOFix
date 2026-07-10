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
  const e = enrichJob(job, normalizeMeta(job.meta));
  const amount = e.totalPrice != null && !Number.isNaN(Number(e.totalPrice)) ? Number(e.totalPrice) : Number(job.price) || 0;
  const released = Boolean(job.paymentReleased);
  const paidLabor = Boolean(job.laborPaid);
  let status = "PENDING";
  if (released) status = "RELEASED";
  else if (paidLabor) status = "PENDING";

  const clawbackMeta = Number(e.refundDetails?.clawbackApplied) || 0;
  const clawbackFromReleased = Math.max(clawbackMeta, Number(clawbackFromLedger) || 0);
  const escrowReversed = Number(e.refundDetails?.escrowApplied) || 0;
  const releasedAmount = Number(e.releasedAmount) || 0;
  const netReleasedAfterRefund = Math.max(0, releasedAmount - clawbackFromReleased);

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
    refundAmount: e.refundAmount,
    refundStatus: e.refundStatus,
    refundDetails: e.refundDetails,
    providerRefundDebt: e.providerRefundDebt,
    clawbackFromReleased,
    escrowReversed,
    netReleasedAfterRefund,
    createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : String(job.createdAt),
    customerName: job.customer?.name,
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

async function getProviderEarnings(userId) {
  const provider = await requireProviderByUserId(userId);
  const providerUserId = provider.userId;

  const jobs = await prisma.job.findMany({
    where: { providerId: providerUserId },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { name: true } },
    },
  });

  const ledger = await getLedgerSummary(provider.id);

  const withdrawals = await prisma.withdrawalRequest.findMany({
    where: { providerId: provider.id },
  });
  const openStatuses = new Set(["pending", "approved", "PENDING", "APPROVED"]);
  const pendingWithdrawals = withdrawals.filter((w) => openStatuses.has(String(w.status)));
  const pendingWithdrawalAmount = pendingWithdrawals.reduce((s, w) => s + Number(w.amount), 0);

  const jobIds = jobs.map((j) => j.id);
  const clawbackMap = await getJobClawbackMap(provider.id, jobIds);

  const earningRows = jobs.map((job) => jobToEarningRow(job, clawbackMap[job.id] || 0));
  const providerEscrowRemaining = earningRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.remainingAmount) || 0),
    0
  );

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
    },
    jobs: earningRows,
  };
}

async function getProviderEarningJob(userId, jobId) {
  const provider = await requireProviderByUserId(userId);
  const job = await prisma.job.findFirst({
    where: { id: jobId, providerId: provider.userId },
    include: {
      customer: { select: { id: true, name: true, email: true } },
    },
  });
  if (!job) throw new AppError("Job not found", 404);
  const clawbackMap = await getJobClawbackMap(provider.id, [job.id]);
  return {
    job: {
      ...jobToEarningRow(job, clawbackMap[job.id] || 0),
      customerName: job.customer?.name,
    },
  };
}

async function getWithdrawalProfile(userId) {
  const provider = await requireProviderByUserId(userId);
  const profile = await prisma.providerWithdrawalProfile.findUnique({
    where: { providerId: provider.id },
  });
  return { profile: bankCrypto.toPublicProfileRow(profile) };
}

async function upsertWithdrawalProfile(userId, body) {
  const provider = await requireProviderByUserId(userId);
  const bankName = String(body?.bankName || "").trim();
  const accountHolder = String(body?.accountHolder || "").trim();
  if (bankName.length < 2) throw new AppError("bankName is required", 400);
  if (accountHolder.length < 2) throw new AppError("accountHolder is required", 400);

  const existing = await prisma.providerWithdrawalProfile.findUnique({
    where: { providerId: provider.id },
  });

  const accIn = String(body?.accountNumber ?? "").trim();
  const branchIn = String(body?.branchCode ?? "").trim();

  let accountEnc;
  let branchEnc;
  if (existing) {
    if (accIn.length >= 4) {
      accountEnc = bankCrypto.encryptField(accIn);
    } else {
      accountEnc = existing.accountNumber;
    }
    if (branchIn.length >= 2) {
      branchEnc = bankCrypto.encryptField(branchIn);
    } else {
      branchEnc = existing.branchCode;
    }
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

  const bankCheck = await fraudDetection.checkBankAccountDuplicate(
    bankName,
    plainBranch,
    plainAccount,
    provider.id
  );
  const bankHash = bankCheck.hash;

  const profile = await prisma.providerWithdrawalProfile.upsert({
    where: { providerId: provider.id },
    create: {
      id: randomUUID(),
      providerId: provider.id,
      bankName,
      accountHolder,
      accountNumber: accountEnc,
      branchCode: branchEnc,
      bankAccountHash: bankHash,
    },
    update: {
      bankName,
      accountHolder,
      accountNumber: accountEnc,
      branchCode: branchEnc,
      bankAccountHash: bankHash,
    },
  });

  if (!bankCheck.duplicate) {
    await prisma.provider.update({
      where: { id: provider.id },
      data: { bankVerifiedAt: new Date() },
    });
    await providerTrustScore.onVerifiedBank(provider.id);
  }

  return { profile: bankCrypto.toPublicProfileRow(profile) };
}

async function requestWithdrawal(userId, body, idempotencyKey, requestHash, route) {
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
  listProviderWithdrawals,
  listProviderTransactions,
  requestWithdrawal,
  jobToEarningRow,
};
