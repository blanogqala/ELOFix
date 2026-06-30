const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const earningService = require("./earning.service");
const paymentService = require("./payment.service");
const { mutateJobMetaInTransaction } = require("./jobMeta.service");
const { attemptGatewayRefundFirst } = require("./providerRefundClawback.service");
const notificationEvents = require("./notificationEvents.service");
const { PLATFORM_BANK, REFUND_DEBT_DUE_DAYS, getRefundDebtDueMs } = require("../config/refundRecovery.config");
const { generateRefundReference } = require("../utils/refundReference.util");
const { roundMoney, EPS } = require("../utils/refundMath.util");

const ACTIVE_RECOVERY_STATUSES = ["PENDING", "PARTIALLY_RECOVERED", "OVERDUE"];

function dueAtFromNow() {
  return new Date(Date.now() + getRefundDebtDueMs());
}

/**
 * Read-only preview of how a labor refund net splits between immediate customer payout and provider debt.
 */
async function previewProviderRefundSplit(job, providerProfileId, laborNet) {
  const net = roundMoney(laborNet);
  if (net <= EPS || !providerProfileId) {
    return {
      immediateCustomerRefund: 0,
      pendingCustomerRefund: 0,
      escrowPreview: 0,
      clawbackPreview: 0,
      debtPreview: 0,
    };
  }

  const heldFromJob = Math.max(
    0,
    roundMoney(Number(job.providerAmount || 0) - Number(job.releasedAmount || 0))
  );
  const heldPortion = Math.min(net, heldFromJob);
  const releasedPortion = roundMoney(net - heldPortion);

  const escrowPreview = heldPortion;
  let clawbackPreview = 0;
  let debtPreview = 0;

  if (releasedPortion > EPS) {
    const ledger = await earningService.sumLedgerForProviderTx(prisma, providerProfileId);
    clawbackPreview = Math.min(releasedPortion, ledger.available);
    debtPreview = roundMoney(releasedPortion - clawbackPreview);
  }

  const immediateCustomerRefund = roundMoney(escrowPreview + clawbackPreview);
  const pendingCustomerRefund = debtPreview;

  return {
    immediateCustomerRefund,
    pendingCustomerRefund,
    escrowPreview,
    clawbackPreview,
    debtPreview,
  };
}

/**
 * Create RefundRecovery row inside an existing transaction when provider debt is added.
 */
async function createRefundRecoveryInTransaction(tx, {
  providerId,
  customerId,
  jobId,
  disputeId,
  amount,
  reference,
}) {
  const pending = roundMoney(amount);
  if (pending <= EPS) return null;

  const dueAt = dueAtFromNow();
  let ref = reference;
  if (!ref) {
    const provider = await tx.provider.findUnique({
      where: { id: providerId },
      include: { user: { select: { name: true } } },
    });
    ref = generateRefundReference(provider);
  }

  return tx.refundRecovery.create({
    data: {
      id: randomUUID(),
      providerId,
      customerId,
      jobId: jobId || null,
      disputeId: disputeId || null,
      totalPending: pending,
      recoveredAmount: 0,
      status: "PENDING",
      dueAt,
      reference: ref,
    },
  });
}

/**
 * Apply recovered amount to RefundRecovery rows FIFO; returns payout details for customer gateway.
 * @returns {Array<{ recoveryId, customerId, jobId, amount }>}
 */
async function applyRecoveryToRefundRecoveriesInTransaction(tx, { providerId, amount }) {
  let remaining = roundMoney(amount);
  const payouts = [];
  if (remaining <= EPS) return payouts;

  const recoveries = await tx.refundRecovery.findMany({
    where: {
      providerId,
      status: { in: ACTIVE_RECOVERY_STATUSES },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const row of recoveries) {
    if (remaining <= EPS) break;
    const total = Number(row.totalPending);
    const recovered = Number(row.recoveredAmount);
    const balance = roundMoney(total - recovered);
    if (balance <= EPS) continue;

    const take = Math.min(remaining, balance);
    remaining = roundMoney(remaining - take);
    const newRecovered = roundMoney(recovered + take);
    const newStatus =
      newRecovered >= total - EPS ? "RECOVERED" : "PARTIALLY_RECOVERED";

    await tx.refundRecovery.update({
      where: { id: row.id },
      data: {
        recoveredAmount: newRecovered,
        status: newStatus,
        updatedAt: new Date(),
      },
    });

    payouts.push({
      recoveryId: row.id,
      customerId: row.customerId,
      jobId: row.jobId,
      amount: take,
    });
  }

  return payouts;
}

/**
 * Full provider recovery: ledger debt + RefundRecovery + staged customer payout (post-commit).
 */
async function applyProviderRecovery(tx, {
  providerId,
  amount,
  source = "future_earnings",
  jobId = null,
  idempotencyKey = null,
}) {
  const target = roundMoney(amount);
  if (target <= EPS) return { recovered: 0, payouts: [], source };

  const { recovered, payouts } = await earningService.recoverRefundDebtByAmount(tx, {
    providerId,
    jobId,
    amount: target,
    idempotencyKey,
  });

  return { recovered, payouts, source };
}

/**
 * Process staged customer gateway refunds after transaction commit.
 */
async function processStagedCustomerPayouts(payouts) {
  for (const p of payouts || []) {
    if (!p.jobId || p.amount <= EPS) continue;
    try {
      const gateway = await attemptGatewayRefundFirst(p.jobId, p.amount);
      if (gateway.failed) {
        console.warn("[refundRecovery] staged payout gateway failed", p.jobId, gateway.result);
      }
      await paymentService.createRefundInvoice(
        p.customerId,
        p.jobId,
        p.amount,
        0,
        "0000"
      );
      await notificationEvents.notifyCustomerStagedRefundPayout({
        customerId: p.customerId,
        jobId: p.jobId,
        amount: p.amount,
      });
      await prisma.$transaction(async (tx) => {
        await mutateJobMetaInTransaction(tx, p.jobId, (m) => {
          const refund = m.refund && typeof m.refund === "object" ? m.refund : {};
          const prevImmediate = Number(refund.immediateRefund) || 0;
          const prevPending = Number(refund.pendingRefund) || 0;
          return {
            ...m,
            refund: {
              ...refund,
              immediateRefund: roundMoney(prevImmediate + p.amount),
              pendingRefund: Math.max(0, roundMoney(prevPending - p.amount)),
            },
          };
        });
      });
    } catch (e) {
      console.error("[refundRecovery] staged payout error", p.jobId, e?.message || e);
    }
  }
}

async function assertProviderNoOverdueRefundDebt(providerProfileId) {
  const overdue = await prisma.refundRecovery.findFirst({
    where: {
      providerId: providerProfileId,
      status: "OVERDUE",
    },
  });
  if (overdue) {
    throw new AppError(
      "Your account is blocked due to overdue refund debt. Please settle your outstanding balance before accepting new work.",
      403
    );
  }
}

async function assertProviderUserNoOverdueRefundDebt(userId) {
  const provider = await prisma.provider.findUnique({
    where: { userId },
    select: { id: true, blocked: true },
  });
  if (!provider) return;
  if (provider.blocked) {
    throw new AppError(
      "Your account is blocked. Contact support if you believe this is an error.",
      403
    );
  }
  await assertProviderNoOverdueRefundDebt(provider.id);
}

async function getProviderRefundDebtSummary(providerProfileId) {
  await ensureRefundRecoveriesForProvider(providerProfileId);

  const [recoveries, pendingRepayment, lastRejectedRow] = await Promise.all([
    prisma.refundRecovery.findMany({
      where: {
        providerId: providerProfileId,
        status: { in: ACTIVE_RECOVERY_STATUSES },
      },
      orderBy: { dueAt: "asc" },
      include: {
        job: { select: { id: true, title: true } },
      },
    }),
    prisma.providerRefundRepayment.findFirst({
      where: { providerId: providerProfileId, status: "SUBMITTED" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.providerRefundRepayment.findFirst({
      where: { providerId: providerProfileId, status: "REJECTED" },
      orderBy: { reviewedAt: "desc" },
    }),
  ]);

  const totalOwed = recoveries.reduce((sum, r) => {
    const bal = roundMoney(Number(r.totalPending) - Number(r.recoveredAmount));
    return roundMoney(sum + bal);
  }, 0);

  const earliestDue = recoveries[0]?.dueAt || null;
  const reference = recoveries[0]?.reference || null;

  const pendingRepaymentDto = pendingRepayment
    ? {
        id: pendingRepayment.id,
        amount: Number(pendingRepayment.amount),
        reference: pendingRepayment.reference,
        status: pendingRepayment.status,
        createdAt:
          pendingRepayment.createdAt instanceof Date
            ? pendingRepayment.createdAt.toISOString()
            : String(pendingRepayment.createdAt),
      }
    : null;

  const lastRejectedRepayment =
    !pendingRepaymentDto && lastRejectedRow
      ? {
          amount: Number(lastRejectedRow.amount),
          reference: lastRejectedRow.reference,
          adminNote: lastRejectedRow.adminNote,
          reviewedAt:
            lastRejectedRow.reviewedAt instanceof Date
              ? lastRejectedRow.reviewedAt.toISOString()
              : lastRejectedRow.reviewedAt
                ? String(lastRejectedRow.reviewedAt)
                : null,
        }
      : null;

  return {
    totalOwed,
    dueAt: earliestDue,
    reference,
    platformBank: PLATFORM_BANK,
    pendingRepayment: pendingRepaymentDto,
    lastRejectedRepayment,
    recoveries: recoveries.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      jobTitle: r.job?.title || null,
      totalPending: Number(r.totalPending),
      recoveredAmount: Number(r.recoveredAmount),
      balance: roundMoney(Number(r.totalPending) - Number(r.recoveredAmount)),
      status: r.status,
      dueAt: r.dueAt,
      reference: r.reference,
    })),
  };
}

async function submitProviderRepayment(userId, { amount, reference, proofUrl }) {
  const provider = await prisma.provider.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!provider) throw new AppError("Provider profile not found", 404);

  const amt = roundMoney(amount);
  if (amt <= EPS) throw new AppError("Repayment amount must be positive", 400);
  if (!reference || !String(reference).trim()) {
    throw new AppError("Payment reference is required", 400);
  }

  const summary = await getProviderRefundDebtSummary(provider.id);
  if (summary.totalOwed <= EPS) {
    throw new AppError("You have no outstanding refund debt", 400);
  }
  if (amt > summary.totalOwed + EPS) {
    throw new AppError(
      `Repayment cannot exceed outstanding debt of R${summary.totalOwed.toFixed(2)}`,
      400
    );
  }

  const row = await prisma.$transaction(async (tx) => {
    const pending = await tx.providerRefundRepayment.findFirst({
      where: { providerId: provider.id, status: "SUBMITTED" },
    });
    if (pending) {
      throw new AppError(
        "You already have a repayment waiting for admin review. Please wait for approval before submitting again.",
        409
      );
    }

    return tx.providerRefundRepayment.create({
      data: {
        id: randomUUID(),
        providerId: provider.id,
        amount: amt,
        reference: String(reference).trim(),
        proofUrl: proofUrl ? String(proofUrl).trim() : null,
        status: "SUBMITTED",
      },
    });
  });

  await notificationEvents.notifyAdminRefundRepaymentSubmitted({
    providerId: userId,
    repaymentId: row.id,
    amount: amt,
    reference: row.reference,
  });
  await notificationEvents.notifyProviderRepaymentSubmitted(userId, amt);

  return row;
}

async function listAdminRefundRepayments({ status, search, view } = {}) {
  const where = {};
  const mode = String(view || "reviews").toLowerCase();

  if (mode === "history") {
    const statusFilter = String(status || "").trim().toUpperCase();
    if (statusFilter === "CONFIRMED" || statusFilter === "REJECTED") {
      where.status = statusFilter;
    } else {
      where.status = { in: ["CONFIRMED", "REJECTED"] };
    }
  } else {
    where.status = "SUBMITTED";
  }

  const term = String(search || "").trim();
  if (term) {
    where.OR = [
      { reference: { contains: term, mode: "insensitive" } },
      {
        provider: {
          user: {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { email: { contains: term, mode: "insensitive" } },
            ],
          },
        },
      },
    ];
  }

  const orderBy =
    mode === "history"
      ? [{ reviewedAt: "desc" }, { createdAt: "desc" }]
      : { createdAt: "desc" };

  return prisma.providerRefundRepayment.findMany({
    where,
    orderBy,
    include: {
      provider: {
        select: {
          blocked: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
}

async function confirmAdminRefundRepayment(adminUserId, repaymentId, { adminNote } = {}) {
  const repayment = await prisma.providerRefundRepayment.findUnique({
    where: { id: String(repaymentId) },
    include: { provider: { include: { user: true } } },
  });
  if (!repayment) throw new AppError("Repayment not found", 404);
  if (repayment.status !== "SUBMITTED") {
    throw new AppError("Repayment already reviewed", 400);
  }

  const amount = Number(repayment.amount);
  let payouts = [];

  await prisma.$transaction(async (tx) => {
    const { payouts: p } = await applyProviderRecovery(tx, {
      providerId: repayment.providerId,
      amount,
      source: "bank_transfer",
      idempotencyKey: `repayment:${repayment.id}`,
    });
    payouts = p;

    await tx.providerRefundRepayment.update({
      where: { id: repayment.id },
      data: {
        status: "CONFIRMED",
        reviewedBy: String(adminUserId),
        reviewedAt: new Date(),
        adminNote: adminNote != null ? String(adminNote) : null,
      },
    });
  });

  await processStagedCustomerPayouts(payouts);

  await notificationEvents.notifyProviderRepaymentConfirmed(
    repayment.provider.userId,
    amount
  );
  for (const p of payouts) {
    if (p.customerId) {
      await notificationEvents.notifyCustomerRepaymentFunded({
        customerId: p.customerId,
        jobId: p.jobId,
        amount: p.amount,
      });
    }
  }

  return repayment;
}

async function rejectAdminRefundRepayment(adminUserId, repaymentId, { adminNote } = {}) {
  const repayment = await prisma.providerRefundRepayment.findUnique({
    where: { id: String(repaymentId) },
    include: { provider: { include: { user: true } } },
  });
  if (!repayment) throw new AppError("Repayment not found", 404);
  if (repayment.status !== "SUBMITTED") {
    throw new AppError("Repayment already reviewed", 400);
  }

  await prisma.providerRefundRepayment.update({
    where: { id: repayment.id },
    data: {
      status: "REJECTED",
      reviewedBy: String(adminUserId),
      reviewedAt: new Date(),
      adminNote: adminNote != null ? String(adminNote) : null,
    },
  });

  await notificationEvents.notifyProviderRepaymentRejected(
    repayment.provider.userId,
    Number(repayment.amount),
    adminNote
  );

  return repayment;
}

/**
 * Backfill RefundRecovery for legacy refund_debt rows without a recovery record.
 */
async function ensureRefundRecoveriesForProvider(providerProfileId) {
  const debts = await prisma.earning.findMany({
    where: { providerId: providerProfileId, type: "debit", status: "refund_debt" },
    orderBy: { createdAt: "asc" },
  });
  if (!debts.length) return;

  const existing = await prisma.refundRecovery.aggregate({
    where: {
      providerId: providerProfileId,
      status: { in: ACTIVE_RECOVERY_STATUSES },
    },
    _sum: { totalPending: true, recoveredAmount: true },
  });
  const existingBal =
    roundMoney(Number(existing._sum.totalPending || 0) - Number(existing._sum.recoveredAmount || 0));
  const debtTotal = debts.reduce((s, d) => roundMoney(s + Number(d.amount)), 0);
  const gap = roundMoney(debtTotal - existingBal);
  if (gap <= EPS) return;

  for (const debt of debts) {
    const amt = Number(debt.amount);
    if (amt <= EPS) continue;
    const job = debt.jobId
      ? await prisma.job.findUnique({
          where: { id: debt.jobId },
          select: { customerId: true },
        })
      : null;
    if (!job?.customerId) continue;

    const dup = await prisma.refundRecovery.findFirst({
      where: { providerId: providerProfileId, jobId: debt.jobId, status: { in: ACTIVE_RECOVERY_STATUSES } },
    });
    if (dup) continue;

    const provider = await prisma.provider.findUnique({
      where: { id: providerProfileId },
      include: { user: { select: { name: true } } },
    });

    await prisma.refundRecovery.create({
      data: {
        id: randomUUID(),
        providerId: providerProfileId,
        customerId: job.customerId,
        jobId: debt.jobId,
        totalPending: amt,
        recoveredAmount: 0,
        status: "PENDING",
        dueAt: dueAtFromNow(),
        reference: generateRefundReference(provider),
      },
    });
    break;
  }
}

module.exports = {
  REFUND_DEBT_DUE_DAYS,
  PLATFORM_BANK,
  previewProviderRefundSplit,
  createRefundRecoveryInTransaction,
  applyRecoveryToRefundRecoveriesInTransaction,
  applyProviderRecovery,
  processStagedCustomerPayouts,
  assertProviderNoOverdueRefundDebt,
  assertProviderUserNoOverdueRefundDebt,
  getProviderRefundDebtSummary,
  submitProviderRepayment,
  listAdminRefundRepayments,
  confirmAdminRefundRepayment,
  rejectAdminRefundRepayment,
  ensureRefundRecoveriesForProvider,
  dueAtFromNow,
};
