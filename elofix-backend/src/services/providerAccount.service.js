const { Prisma } = require("@prisma/client");
const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const earningService = require("./earning.service");
const bankCrypto = require("../utils/bankCrypto");
const { logAudit } = require("./auditLog.service");
const { idempotencyGate, idempotencyCommit } = require("../utils/idempotencyTransaction");

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

function jobToEarningRow(job) {
  const price = Number(job.price) || 0;
  const released = Boolean(job.paymentReleased);
  const paidLabor = Boolean(job.laborPaid);
  let status = "PENDING";
  if (released) status = "RELEASED";
  else if (paidLabor) status = "PENDING";

  return {
    id: job.id,
    title: job.title,
    category: job.category,
    amount: price,
    status,
    laborPaid: paidLabor,
    paymentReleased: released,
    createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : String(job.createdAt),
  };
}

async function getLedgerSummary(providerId) {
  const [pendingSum, availSum, debitWithdrawnSum, debitPendingSum] = await Promise.all([
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
  ]);

  const pending = Number(pendingSum._sum.amount) || 0;
  const creditsAvailable = Number(availSum._sum.amount) || 0;
  const withdrawn = Number(debitWithdrawnSum._sum.amount) || 0;
  const reservedPending = Number(debitPendingSum._sum.amount) || 0;
  const available = Math.max(0, creditsAvailable - withdrawn - reservedPending);

  return { pending, creditsAvailable, withdrawn, reservedPending, available };
}

async function getProviderBalance(userId) {
  const provider = await requireProviderByUserId(userId);
  const s = await getLedgerSummary(provider.id);
  return {
    available: s.available,
    pending: s.pending,
    withdrawn: s.withdrawn,
  };
}

async function getProviderEarnings(userId) {
  const provider = await requireProviderByUserId(userId);
  const providerUserId = provider.userId;

  const jobs = await prisma.job.findMany({
    where: { providerId: providerUserId },
    orderBy: { createdAt: "desc" },
  });

  const ledger = await getLedgerSummary(provider.id);

  const withdrawals = await prisma.withdrawalRequest.findMany({
    where: { providerId: provider.id },
  });
  const openStatuses = new Set(["pending", "approved", "PENDING", "APPROVED"]);
  const pendingWithdrawals = withdrawals.filter((w) => openStatuses.has(String(w.status)));
  const pendingWithdrawalAmount = pendingWithdrawals.reduce((s, w) => s + Number(w.amount), 0);

  return {
    summary: {
      totalReleased: ledger.creditsAvailable,
      withdrawn: ledger.withdrawn,
      pendingWithdrawals: pendingWithdrawalAmount,
      available: ledger.available,
    },
    jobs: jobs.map(jobToEarningRow),
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
  return {
    job: {
      ...jobToEarningRow(job),
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

  const profile = await prisma.providerWithdrawalProfile.upsert({
    where: { providerId: provider.id },
    create: {
      id: randomUUID(),
      providerId: provider.id,
      bankName,
      accountHolder,
      accountNumber: accountEnc,
      branchCode: branchEnc,
    },
    update: {
      bankName,
      accountHolder,
      accountNumber: accountEnc,
      branchCode: branchEnc,
    },
  });
  return { profile: bankCrypto.toPublicProfileRow(profile) };
}

async function requestWithdrawal(userId, body, idempotencyKey, requestHash, route) {
  const provider = await requireProviderByUserId(userId);
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

      const withdrawal = await tx.withdrawalRequest.create({
        data: {
          id: randomUUID(),
          providerId: provider.id,
          amount,
          status: "pending",
          idempotencyKey,
        },
      });

      await earningService.createPendingWithdrawalDebit(tx, {
        providerId: provider.id,
        amount,
        withdrawalRequestId: withdrawal.id,
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
  await logAudit("withdrawal.request", {
    userId,
    metadata: { withdrawalId: row.id, providerId: provider.id, amount },
  });

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
  const [pendingSum, availSum, debitWithdrawnSum, debitPendingSum] = await Promise.all([
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
  ]);

  const pending = Number(pendingSum._sum.amount) || 0;
  const creditsAvailable = Number(availSum._sum.amount) || 0;
  const withdrawn = Number(debitWithdrawnSum._sum.amount) || 0;
  const reservedPending = Number(debitPendingSum._sum.amount) || 0;
  const available = Math.max(0, creditsAvailable - withdrawn - reservedPending);

  return { pending, creditsAvailable, withdrawn, reservedPending, available };
}

module.exports = {
  getProviderEarnings,
  getProviderEarningJob,
  getProviderBalance,
  getWithdrawalProfile,
  upsertWithdrawalProfile,
  requestWithdrawal,
};
