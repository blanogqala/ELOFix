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
 * Derived UI/API status for provider repayment + staged customer refund.
 * Does not invent a parallel Prisma enum — maps existing recovery/repayment/meta.
 */
function deriveRepaymentStatus({
  recoveryStatus,
  balance,
  pendingRepayment,
  lastRejectedRepayment,
  customerRefundPending = 0,
}) {
  const bal = roundMoney(balance);
  const pendingCust = roundMoney(customerRefundPending);
  if (bal <= EPS && pendingCust <= EPS) {
    return "REFUNDED";
  }
  if (pendingRepayment) {
    return "AWAITING_VERIFICATION";
  }
  if (String(recoveryStatus || "").toUpperCase() === "OVERDUE" && bal > EPS) {
    return "OVERDUE";
  }
  if (bal <= EPS && pendingCust > EPS) {
    return "REFUND_PROCESSING";
  }
  if (lastRejectedRepayment && bal > EPS) {
    return "PAYMENT_REJECTED";
  }
  if (bal > EPS) {
    return "REFUND_DUE";
  }
  return "REFUND_DUE";
}

function refundMetaFromJob(job) {
  const meta =
    job?.meta && typeof job.meta === "object" && !Array.isArray(job.meta) ? job.meta : {};
  const refund = meta.refund && typeof meta.refund === "object" ? meta.refund : {};
  return {
    customerRefundPending: Number(refund.pendingRefund) || 0,
    customerRefundImmediate: Number(refund.immediateRefund) || 0,
    refundStatus: refund.status || null,
    customerRefundStatus: refund.customerRefundStatus || null,
    originalPaymentIntentIds: Array.isArray(refund.originalPaymentIntentIds)
      ? refund.originalPaymentIntentIds
      : [],
    manualActionReason: refund.manualActionReason || null,
  };
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

/**
 * Cap active recoveries that were booked at customer gross instead of
 * provider share (released amount / 93% of paid). Fixes legacy FULL_REFUND debt.
 */
async function repairOverstatedProviderRefundRecoveries(providerProfileId) {
  const recoveries = await prisma.refundRecovery.findMany({
    where: {
      providerId: providerProfileId,
      status: { in: ACTIVE_RECOVERY_STATUSES },
    },
    include: {
      job: {
        select: {
          id: true,
          providerAmount: true,
          releasedAmount: true,
          meta: true,
        },
      },
    },
  });

  for (const r of recoveries) {
    const job = r.job;
    if (!job) continue;
    const releasedCap = roundMoney(
      Math.max(0, Number(job.releasedAmount ?? job.providerAmount ?? 0))
    );
    if (releasedCap <= EPS) continue;

    const pending = roundMoney(Number(r.totalPending));
    const recovered = roundMoney(Number(r.recoveredAmount) || 0);
    if (pending <= releasedCap + EPS) continue;

    const reduction = roundMoney(pending - releasedCap);
    const newPending = releasedCap;

    await prisma.$transaction(async (tx) => {
      await tx.refundRecovery.update({
        where: { id: r.id },
        data: {
          totalPending: newPending,
          status:
            recovered + EPS >= newPending
              ? "RECOVERED"
              : recovered > EPS
                ? "PARTIALLY_RECOVERED"
                : r.status,
        },
      });

      const debtRows = await tx.earning.findMany({
        where: {
          providerId: providerProfileId,
          jobId: job.id,
          type: "debit",
          status: "refund_debt",
        },
        orderBy: { createdAt: "desc" },
      });
      let left = reduction;
      for (const row of debtRows) {
        if (left <= EPS) break;
        const amt = roundMoney(Number(row.amount));
        const take = Math.min(amt, left);
        const next = roundMoney(amt - take);
        if (next <= EPS) {
          await tx.earning.delete({ where: { id: row.id } });
        } else {
          await tx.earning.update({ where: { id: row.id }, data: { amount: next } });
        }
        left = roundMoney(left - take);
      }

      await mutateJobMetaInTransaction(tx, job.id, (m) => {
        const refund = m.refund && typeof m.refund === "object" ? { ...m.refund } : {};
        const prevDebt = Number(refund.providerDebtAdded) || 0;
        const prevPending = Number(refund.pendingRefund) || 0;
        const prevCumulative =
          Number(refund.cumulativeCustomerNet ?? refund.amount ?? 0) || 0;
        const prevCustomerNet = Number(refund.customerNet) || 0;
        const nextCumulative = Math.max(0, roundMoney(prevCumulative - reduction));
        return {
          ...m,
          refund: {
            ...refund,
            providerDebtAdded: Math.max(0, roundMoney(prevDebt - reduction)),
            pendingRefund: Math.max(0, roundMoney(prevPending - reduction)),
            cumulativeCustomerNet: nextCumulative,
            amount: nextCumulative,
            customerNet: Math.max(0, roundMoney(prevCustomerNet - reduction)),
          },
        };
      });
    });
  }
}

async function getProviderRefundDebtSummary(providerProfileId) {
  await ensureRefundRecoveriesForProvider(providerProfileId);
  await repairOverstatedProviderRefundRecoveries(providerProfileId);

  const [recoveries, pendingRepayment, lastRejectedRow] = await Promise.all([
    prisma.refundRecovery.findMany({
      where: {
        providerId: providerProfileId,
        status: { in: ACTIVE_RECOVERY_STATUSES },
      },
      orderBy: { dueAt: "asc" },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            meta: true,
            customer: { select: { id: true, name: true } },
          },
        },
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
        jobId: pendingRepayment.jobId || null,
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

  const recoveryDtos = recoveries.map((r) => {
    const balance = roundMoney(Number(r.totalPending) - Number(r.recoveredAmount));
    const refundMeta = refundMetaFromJob(r.job);
    const repaymentStatus = deriveRepaymentStatus({
      recoveryStatus: r.status,
      balance,
      pendingRepayment: pendingRepaymentDto,
      lastRejectedRepayment,
      customerRefundPending: refundMeta.customerRefundPending,
    });
    return {
      id: r.id,
      jobId: r.jobId,
      jobTitle: r.job?.title || null,
      customerId: r.customerId || r.job?.customer?.id || null,
      customerName: r.job?.customer?.name || null,
      totalPending: Number(r.totalPending),
      recoveredAmount: Number(r.recoveredAmount),
      balance,
      status: r.status,
      repaymentStatus,
      dueAt: r.dueAt,
      reference: r.reference,
      customerRefundPending: refundMeta.customerRefundPending,
      customerRefundImmediate: refundMeta.customerRefundImmediate,
      refundStatus: refundMeta.refundStatus,
    };
  });

  const aggregateStatus = deriveRepaymentStatus({
    recoveryStatus: recoveries[0]?.status,
    balance: totalOwed,
    pendingRepayment: pendingRepaymentDto,
    lastRejectedRepayment,
    customerRefundPending: recoveryDtos.reduce(
      (s, r) => roundMoney(s + (Number(r.customerRefundPending) || 0)),
      0
    ),
  });

  return {
    totalOwed,
    dueAt: earliestDue,
    reference,
    repaymentStatus: aggregateStatus,
    platformBank: PLATFORM_BANK,
    pendingRepayment: pendingRepaymentDto,
    lastRejectedRepayment,
    recoveries: recoveryDtos,
  };
}

/**
 * Job-scoped refund obligation for the authenticated provider.
 */
async function getProviderJobRefundObligation(userId, jobId) {
  const provider = await prisma.provider.findUnique({
    where: { userId: String(userId) },
    select: { id: true },
  });
  if (!provider) throw new AppError("Provider profile not found", 404);

  const job = await prisma.job.findUnique({
    where: { id: String(jobId) },
    select: {
      id: true,
      title: true,
      providerId: true,
      customerId: true,
      meta: true,
      customer: { select: { id: true, name: true } },
    },
  });
  if (!job) throw new AppError("Job not found", 404);
  if (String(job.providerId) !== String(userId)) {
    throw new AppError("Not authorized for this job refund", 403);
  }

  const summary = await getProviderRefundDebtSummary(provider.id);
  const recoveries = summary.recoveries.filter((r) => r.jobId === job.id && r.balance > EPS);
  const amountDue = recoveries.reduce((s, r) => roundMoney(s + r.balance), 0);
  const primary = recoveries[0] || null;
  const refundMeta = refundMetaFromJob(job);

  // Prefer job-scoped SUBMITTED repayment so another job cannot force "awaiting" here.
  let pendingForJob = null;
  if (summary.pendingRepayment) {
    const pendingRow = await prisma.providerRefundRepayment.findFirst({
      where: {
        providerId: provider.id,
        status: "SUBMITTED",
        OR: [{ jobId: job.id }, { jobId: null }],
      },
      orderBy: { createdAt: "desc" },
    });
    if (pendingRow && (!pendingRow.jobId || String(pendingRow.jobId) === String(job.id))) {
      pendingForJob = {
        id: pendingRow.id,
        amount: Number(pendingRow.amount),
        reference: pendingRow.reference,
        status: pendingRow.status,
        jobId: pendingRow.jobId || null,
        createdAt:
          pendingRow.createdAt instanceof Date
            ? pendingRow.createdAt.toISOString()
            : String(pendingRow.createdAt),
      };
    }
  }

  const repaymentStatus =
    amountDue <= EPS &&
    refundMeta.customerRefundPending <= EPS &&
    !["READY", "REFUND_READY", "REFUND_REQUESTED", "REFUND_PROCESSING", "REFUND_MANUAL_ACTION_REQUIRED", "REFUND_FAILED"].includes(
      String(refundMeta.customerRefundStatus || "").toUpperCase()
    )
      ? deriveRepaymentStatus({
          recoveryStatus: "RECOVERED",
          balance: 0,
          pendingRepayment: pendingForJob,
          lastRejectedRepayment: summary.lastRejectedRepayment,
          customerRefundPending: refundMeta.customerRefundPending,
        })
      : deriveRepaymentStatus({
          recoveryStatus: primary?.status || (amountDue <= EPS ? "RECOVERED" : null),
          balance: amountDue,
          pendingRepayment: pendingForJob,
          lastRejectedRepayment: summary.lastRejectedRepayment,
          customerRefundPending: refundMeta.customerRefundPending,
        });

  // When repayment verified and customer refund ready, prefer REFUND_PROCESSING over AWAITING.
  let statusOut = repaymentStatus;
  const crs = String(refundMeta.customerRefundStatus || "").toUpperCase();
  if (crs === "READY" || crs === "REFUND_READY") {
    statusOut = "REFUND_PROCESSING";
  } else if (crs === "REFUND_COMPLETED") {
    statusOut = "REFUNDED";
  } else if (
    crs === "REFUND_REQUESTED" ||
    crs === "REFUND_PROCESSING" ||
    crs === "REFUND_MANUAL_ACTION_REQUIRED"
  ) {
    statusOut = "REFUND_PROCESSING";
  }

  return {
    jobId: job.id,
    jobTitle: job.title || null,
    customerId: job.customerId,
    customerName: job.customer?.name || null,
    amountDue,
    dueAt: primary?.dueAt || summary.dueAt,
    reference: primary?.reference || summary.reference,
    repaymentStatus: statusOut,
    recoveryStatus: primary?.status || null,
    customerRefundPending: refundMeta.customerRefundPending,
    customerRefundImmediate: refundMeta.customerRefundImmediate,
    refundStatus: refundMeta.refundStatus,
    customerRefundStatus: refundMeta.customerRefundStatus,
    platformBank: summary.platformBank,
    pendingRepayment: pendingForJob,
    lastRejectedRepayment: summary.lastRejectedRepayment,
    recoveries,
    totalOwed: summary.totalOwed,
  };
}

/**
 * Active refund-obligation total for a provider (authoritative expected repayment).
 */
async function getProviderExpectedRepaymentAmount(providerProfileId) {
  await ensureRefundRecoveriesForProvider(providerProfileId);
  await repairOverstatedProviderRefundRecoveries(providerProfileId);

  const recoveries = await prisma.refundRecovery.findMany({
    where: {
      providerId: providerProfileId,
      status: { in: ACTIVE_RECOVERY_STATUSES },
    },
    orderBy: { dueAt: "asc" },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          meta: true,
          customer: { select: { id: true, name: true } },
        },
      },
    },
  });

  const expectedAmount = recoveries.reduce((sum, r) => {
    const bal = roundMoney(Number(r.totalPending) - Number(r.recoveredAmount));
    return roundMoney(sum + Math.max(0, bal));
  }, 0);

  const primary = recoveries[0] || null;
  return {
    expectedAmount,
    recoveries,
    primary,
  };
}

/**
 * Provider gateway checkout to repay EloFix (primary repayment path).
 * Amount is always server-derived from the job obligation.
 */
async function createProviderRefundRepaymentCheckout(
  userId,
  jobId,
  { provider: preferredProvider, amount: clientAmount } = {}
) {
  const { getGateway, normalizeProvider, listEnabledGateways } = require("./payments/gatewayRegistry");
  const { frontendBaseUrl, paymentCurrency } = require("./payments/paymentConfig");
  const { Prisma } = require("@prisma/client");

  const obligation = await getProviderJobRefundObligation(userId, String(jobId));
  const derivedAmount = roundMoney(obligation.amountDue);
  if (derivedAmount <= EPS) {
    throw new AppError("You have no outstanding refund debt for this job", 400);
  }
  if (clientAmount != null && clientAmount !== "" && Number.isFinite(Number(clientAmount))) {
    if (Math.abs(roundMoney(clientAmount) - derivedAmount) > EPS) {
      throw new AppError(
        `Repayment amount must equal the outstanding obligation of R${derivedAmount.toFixed(2)}`,
        400
      );
    }
  }

  const provider = await prisma.provider.findUnique({
    where: { userId: String(userId) },
    select: { id: true },
  });
  if (!provider) throw new AppError("Provider profile not found", 404);

  const enabled = listEnabledGateways();
  if (!enabled.length) {
    throw new AppError("No payment gateway is configured for repayment", 503);
  }
  let providerKey = preferredProvider ? normalizeProvider(preferredProvider) : null;
  if (!providerKey || !enabled.includes(providerKey)) {
    providerKey = enabled[0];
  }
  const gw = getGateway(providerKey);

  const customer = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { email: true, name: true, phone: true },
  });

  const result = await prisma.$transaction(async (tx) => {
    const pending = await tx.providerRefundRepayment.findFirst({
      where: { providerId: provider.id, status: "SUBMITTED" },
    });
    if (pending) {
      // Reuse existing gateway checkout if still pending payment
      if (pending.method === "GATEWAY" && pending.paymentIntentId) {
        const existingIntent = await tx.paymentIntent.findUnique({
          where: { id: pending.paymentIntentId },
        });
        if (existingIntent && ["PENDING", "PROCESSING"].includes(existingIntent.state)) {
          const reuseGw = getGateway(existingIntent.provider);
          const checkout = await reuseGw.createCheckout(
            {
              ...existingIntent,
              amount: Number(existingIntent.amount),
              returnUrl:
                existingIntent.returnUrl ||
                `${frontendBaseUrl()}/provider/jobs/${jobId}/refund?intentId=${existingIntent.id}`,
              cancelUrl:
                existingIntent.cancelUrl ||
                `${frontendBaseUrl()}/provider/jobs/${jobId}/refund?cancelled=1`,
            },
            customer
          );
          return {
            reuse: true,
            repayment: pending,
            intent: existingIntent,
            checkout,
            providerKey: existingIntent.provider,
          };
        }
      }
      throw new AppError(
        "You already have a repayment waiting for admin review. Please wait for approval before submitting again.",
        409
      );
    }

    const intentId = randomUUID();
    const merchantReference = `EFX-RR-${intentId.replace(/-/g, "").slice(0, 16).toUpperCase()}`;
    const returnUrl = `${frontendBaseUrl()}/provider/jobs/${jobId}/refund?intentId=${intentId}`;
    const cancelUrl = `${frontendBaseUrl()}/provider/jobs/${jobId}/refund?cancelled=1`;

    const intent = await tx.paymentIntent.create({
      data: {
        id: intentId,
        merchantReference,
        provider: providerKey,
        kind: "PROVIDER_REFUND_REPAYMENT",
        paymentType: null,
        userId: String(userId),
        jobId: String(jobId),
        amount: new Prisma.Decimal(derivedAmount.toFixed(2)),
        commissionAmount: new Prisma.Decimal("0"),
        recipientAmount: new Prisma.Decimal(derivedAmount.toFixed(2)),
        currency: paymentCurrency(),
        state: "PENDING",
        escrowStatus: "NOT_APPLICABLE",
        providerPayoutStatus: "NOT_APPLICABLE",
        returnUrl,
        cancelUrl,
        idempotencyKey: `provider-refund-repay:${provider.id}:${jobId}:${intentId}`,
        gatewayPayload: { purpose: "PROVIDER_REFUND_REPAYMENT", jobId: String(jobId) },
      },
    });

    const repayment = await tx.providerRefundRepayment.create({
      data: {
        id: randomUUID(),
        providerId: provider.id,
        jobId: String(jobId),
        amount: derivedAmount,
        reference: obligation.reference || merchantReference,
        method: "GATEWAY",
        paymentIntentId: intent.id,
        merchantReference,
        status: "SUBMITTED",
      },
    });

    const checkout = await gw.createCheckout(
      {
        ...intent,
        amount: derivedAmount,
        returnUrl,
        cancelUrl,
      },
      customer
    );

    return { reuse: false, repayment, intent, checkout, providerKey };
  });

  if (!result.reuse) {
    await notificationEvents.notifyAdminRefundRepaymentSubmitted({
      providerId: userId,
      repaymentId: result.repayment.id,
      amount: derivedAmount,
      reference: result.repayment.reference,
    });
    await notificationEvents.notifyProviderRepaymentSubmitted(userId, derivedAmount);
  }

  return {
    repaymentId: result.repayment.id,
    intentId: result.intent.id,
    amount: derivedAmount,
    provider: result.providerKey,
    merchantReference: result.intent.merchantReference,
    checkout: result.checkout,
    status: "SUBMITTED",
  };
}

/**
 * After PROVIDER_REFUND_REPAYMENT PaymentIntent is PAID via webhook — attach gateway proof.
 * Admin still confirms repayment (audit).
 */
async function markGatewayRepaymentPaidFromIntent(intent) {
  if (!intent || intent.kind !== "PROVIDER_REFUND_REPAYMENT") return null;

  const repayment = await prisma.providerRefundRepayment.findFirst({
    where: {
      OR: [
        { paymentIntentId: intent.id },
        { merchantReference: intent.merchantReference },
      ],
    },
    include: { provider: { include: { user: true } } },
  });
  if (!repayment) return null;

  const updated = await prisma.providerRefundRepayment.update({
    where: { id: repayment.id },
    data: {
      gatewayTransactionId: intent.gatewayTransactionId || repayment.gatewayTransactionId,
      merchantReference: intent.merchantReference || repayment.merchantReference,
      paymentIntentId: intent.id,
      method: "GATEWAY",
    },
  });

  await notificationEvents.notifyAdminRefundRepaymentSubmitted({
    providerId: repayment.provider.userId,
    repaymentId: repayment.id,
    amount: Number(repayment.amount),
    reference: repayment.reference,
  });

  return updated;
}

/**
 * Admin: process customer refund after repayment is CONFIRMED and status READY.
 */
async function processAdminCustomerRefund(adminUserId, repaymentId) {
  const repayment = await prisma.providerRefundRepayment.findUnique({
    where: { id: String(repaymentId) },
    include: { provider: { include: { user: true } } },
  });
  if (!repayment) throw new AppError("Repayment not found", 404);
  if (repayment.status !== "CONFIRMED") {
    throw new AppError("Provider repayment must be verified before processing the customer refund", 400);
  }

  const jobId = repayment.jobId || (await getProviderExpectedRepaymentAmount(repayment.providerId)).primary?.jobId;
  if (!jobId) {
    // Fall back: find jobs marked READY for this repayment
    const jobs = await prisma.job.findMany({
      where: { providerId: repayment.provider.userId },
      select: { id: true, meta: true, customerId: true },
      take: 50,
    });
    const readyJobs = jobs.filter((j) => {
      const meta = j.meta && typeof j.meta === "object" ? j.meta : {};
      const refund = meta.refund && typeof meta.refund === "object" ? meta.refund : {};
      return (
        refund.customerRefundStatus === "READY" &&
        (refund.repaymentId === repayment.id || Number(refund.readyPayoutAmount) > EPS)
      );
    });
    if (!readyJobs.length) {
      throw new AppError("No customer refund is ready for this repayment", 400);
    }
    const payouts = readyJobs.map((j) => {
      const meta = j.meta && typeof j.meta === "object" ? j.meta : {};
      const refund = meta.refund && typeof meta.refund === "object" ? meta.refund : {};
      return {
        jobId: j.id,
        customerId: j.customerId,
        amount: roundMoney(Number(refund.readyPayoutAmount) || Number(refund.pendingRefund) || 0),
      };
    }).filter((p) => p.amount > EPS);

    return executeCustomerRefundPayouts(adminUserId, repayment, payouts);
  }

  const job = await prisma.job.findUnique({
    where: { id: String(jobId) },
    select: { id: true, meta: true, customerId: true },
  });
  if (!job) throw new AppError("Job not found for customer refund", 404);
  const refundMeta = refundMetaFromJob(job);
  if (
    refundMeta.customerRefundStatus &&
    refundMeta.customerRefundStatus !== "READY" &&
    refundMeta.customerRefundStatus !== "REFUND_FAILED" &&
    refundMeta.customerRefundStatus !== "REFUND_MANUAL_ACTION_REQUIRED"
  ) {
    if (refundMeta.customerRefundStatus === "REFUND_COMPLETED") {
      throw new AppError("Customer refund already completed", 400);
    }
    if (
      refundMeta.customerRefundStatus === "REFUND_REQUESTED" ||
      refundMeta.customerRefundStatus === "REFUND_PROCESSING"
    ) {
      throw new AppError("Customer refund is already processing", 409);
    }
  }

  const amount = roundMoney(
    Number(
      (job.meta && typeof job.meta === "object" && job.meta.refund?.readyPayoutAmount) ||
        refundMeta.customerRefundPending ||
        Number(repayment.amount)
    )
  );
  if (amount <= EPS) {
    throw new AppError("No ready customer refund amount found", 400);
  }

  return executeCustomerRefundPayouts(adminUserId, repayment, [
    { jobId: job.id, customerId: job.customerId, amount },
  ]);
}

async function executeCustomerRefundPayouts(adminUserId, repayment, payouts) {
  const refundService = require("./payments/refund.service");
  const results = [];

  for (const p of payouts) {
    if (!p.jobId || p.amount <= EPS) continue;

    await prisma.$transaction(async (tx) => {
      await mutateJobMetaInTransaction(tx, p.jobId, (m) => {
        const refund = m.refund && typeof m.refund === "object" ? m.refund : {};
        return {
          ...m,
          refund: {
            ...refund,
            customerRefundStatus: "REFUND_REQUESTED",
            processedByAdminId: String(adminUserId),
            processRequestedAt: new Date().toISOString(),
          },
        };
      });
    });

    await notificationEvents.notifyCustomerRefundProcessing({
      customerId: p.customerId,
      jobId: p.jobId,
      amount: p.amount,
    });

    const gateway = await refundService.refundJobLaborAcrossIntents(p.jobId, p.amount, {
      idempotencyKey: `admin-customer-refund:${repayment.id}:${p.jobId}`,
    });

    if (gateway.requiresManualAction || gateway.supported === false) {
      await prisma.$transaction(async (tx) => {
        await mutateJobMetaInTransaction(tx, p.jobId, (m) => {
          const refund = m.refund && typeof m.refund === "object" ? m.refund : {};
          return {
            ...m,
            refund: {
              ...refund,
              status: "pending_manual_gateway",
              customerRefundStatus: "REFUND_MANUAL_ACTION_REQUIRED",
              manualActionReason:
                gateway.message ||
                "Gateway does not support programmatic refunds — process via merchant dashboard",
              originalPaymentIntentIds: gateway.originalPaymentIntentIds || [],
              gatewayRefundRefs: (gateway.results || []).map((r) => r.externalRefundId).filter(Boolean),
            },
          };
        });
      });
      await notificationEvents.notifyAdminGatewayRefundManualRequired({
        jobId: p.jobId,
        repaymentId: repayment.id,
        amount: p.amount,
        reason: gateway.message,
      });
      results.push({ jobId: p.jobId, status: "REFUND_MANUAL_ACTION_REQUIRED", gateway });
      continue;
    }

    if (!gateway.ok) {
      await prisma.$transaction(async (tx) => {
        await mutateJobMetaInTransaction(tx, p.jobId, (m) => {
          const refund = m.refund && typeof m.refund === "object" ? m.refund : {};
          return {
            ...m,
            refund: {
              ...refund,
              status: "gateway_failed",
              customerRefundStatus: "REFUND_FAILED",
              manualActionReason: gateway.message || "Gateway refund failed",
              originalPaymentIntentIds: gateway.originalPaymentIntentIds || [],
            },
          };
        });
      });
      await notificationEvents.notifyAdminGatewayRefundFailed({
        jobId: p.jobId,
        repaymentId: repayment.id,
        amount: p.amount,
        reason: gateway.message,
      });
      await notificationEvents.notifyCustomerRefundFailed({
        customerId: p.customerId,
        jobId: p.jobId,
        amount: p.amount,
      });
      results.push({ jobId: p.jobId, status: "REFUND_FAILED", gateway });
      continue;
    }

    // Success — update meta and invoice
    await paymentService.createRefundInvoice(p.customerId, p.jobId, p.amount, 0, "0000");
    await prisma.$transaction(async (tx) => {
      await mutateJobMetaInTransaction(tx, p.jobId, (m) => {
        const refund = m.refund && typeof m.refund === "object" ? m.refund : {};
        const prevImmediate = Number(refund.immediateRefund) || 0;
        const prevPending = Number(refund.pendingRefund) || 0;
        return {
          ...m,
          refund: {
            ...refund,
            status: "processed",
            customerRefundStatus: "REFUND_COMPLETED",
            immediateRefund: roundMoney(prevImmediate + p.amount),
            pendingRefund: Math.max(0, roundMoney(prevPending - p.amount)),
            readyPayoutAmount: 0,
            originalPaymentIntentIds: gateway.originalPaymentIntentIds || [],
            gatewayRefundRefs: (gateway.results || []).map((r) => r.externalRefundId).filter(Boolean),
            completedAt: new Date().toISOString(),
          },
        };
      });
    });
    await notificationEvents.notifyCustomerRefundProcessed(p.customerId, p.jobId, p.amount);
    await notificationEvents.notifyProviderRefundCompleted(repayment.provider.userId, p.amount, p.jobId);
    results.push({ jobId: p.jobId, status: "REFUND_COMPLETED", gateway });
  }

  return { repaymentId: repayment.id, results };
}

function mapAdminRefundRepaymentRow(row, expectedCtx) {
  const rawAmount = row.amount;
  const submittedNum = Number(rawAmount);
  const amountMissing = !Number.isFinite(submittedNum);
  const submittedAmount = amountMissing ? null : roundMoney(submittedNum);

  const isPending = String(row.status) === "SUBMITTED";
  const expectedAmount = isPending
    ? roundMoney(expectedCtx?.expectedAmount || 0)
    : submittedAmount;
  const difference =
    !amountMissing && expectedAmount != null
      ? roundMoney(Math.abs(submittedAmount - expectedAmount))
      : null;
  const amountMismatch =
    isPending && !amountMissing && difference != null && difference > EPS;

  const primary = expectedCtx?.primary || null;
  const job = primary?.job || null;
  const refundMeta = refundMetaFromJob(job);
  const originalPayments = expectedCtx?.originalPayments || [];

  return {
    id: row.id,
    providerId: row.providerId,
    amount: submittedAmount,
    submittedAmount,
    expectedAmount: expectedAmount == null ? null : expectedAmount,
    difference,
    amountMismatch,
    amountMissing,
    currency: "ZAR",
    reference: row.reference,
    proofUrl: row.proofUrl || null,
    method: row.method || "BANK_TRANSFER",
    gatewayTransactionId: row.gatewayTransactionId || null,
    merchantReference: row.merchantReference || null,
    paymentIntentId: row.paymentIntentId || null,
    status: row.status,
    reviewedBy: row.reviewedBy || null,
    reviewedAt:
      row.reviewedAt instanceof Date
        ? row.reviewedAt.toISOString()
        : row.reviewedAt
          ? String(row.reviewedAt)
          : null,
    adminNote: row.adminNote || null,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    refundObligationId: primary?.id || null,
    jobId: row.jobId || primary?.jobId || job?.id || null,
    jobTitle: job?.title || null,
    customerId: primary?.customerId || job?.customer?.id || null,
    customerName: job?.customer?.name || null,
    obligationReference: primary?.reference || null,
    refundReason: "Administrator dispute resolution — customer refund",
    customerRefundStatus: refundMeta.customerRefundStatus,
    customerRefundPending: refundMeta.customerRefundPending,
    originalCustomerPayments: originalPayments,
    manualActionReason: refundMeta.manualActionReason,
    provider: row.provider
      ? {
          blocked: Boolean(row.provider.blocked),
          user: row.provider.user
            ? {
                id: row.provider.user.id,
                name: row.provider.user.name,
                email: row.provider.user.email,
              }
            : null,
        }
      : null,
  };
}

async function submitProviderRepayment(userId, { amount, reference, proofUrl, jobId } = {}) {
  const provider = await prisma.provider.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!provider) throw new AppError("Provider profile not found", 404);

  if (!reference || !String(reference).trim()) {
    throw new AppError("Payment reference is required", 400);
  }

  let derivedAmount = 0;
  if (jobId) {
    const obligation = await getProviderJobRefundObligation(userId, String(jobId));
    derivedAmount = roundMoney(obligation.amountDue);
  } else {
    const summary = await getProviderRefundDebtSummary(provider.id);
    derivedAmount = roundMoney(summary.totalOwed);
  }

  if (derivedAmount <= EPS) {
    throw new AppError("You have no outstanding refund debt", 400);
  }

  if (amount != null && amount !== "" && Number.isFinite(Number(amount))) {
    const clientAmt = roundMoney(amount);
    if (Math.abs(clientAmt - derivedAmount) > EPS) {
      throw new AppError(
        `Repayment amount must equal the outstanding obligation of R${derivedAmount.toFixed(2)}`,
        400
      );
    }
  }

  const amt = derivedAmount;

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
        jobId: jobId ? String(jobId) : null,
        amount: amt,
        reference: String(reference).trim(),
        proofUrl: proofUrl ? String(proofUrl).trim() : null,
        method: "BANK_TRANSFER",
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

  return {
    id: row.id,
    status: row.status,
    amount: amt,
    reference: row.reference,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
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

  const rows = await prisma.providerRefundRepayment.findMany({
    where,
    orderBy,
    include: {
      provider: {
        select: {
          blocked: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
      job: {
        select: {
          id: true,
          title: true,
          meta: true,
          customer: { select: { id: true, name: true } },
        },
      },
    },
  });

  const providerIds = [...new Set(rows.map((r) => r.providerId))];
  const expectedByProvider = new Map();
  await Promise.all(
    providerIds.map(async (pid) => {
      expectedByProvider.set(pid, await getProviderExpectedRepaymentAmount(pid));
    })
  );

  // Enrich with original customer payment refs for primary jobs
  const jobIds = [
    ...new Set(
      rows
        .map((r) => r.jobId || expectedByProvider.get(r.providerId)?.primary?.jobId)
        .filter(Boolean)
    ),
  ];
  const laborIntents =
    jobIds.length > 0
      ? await prisma.paymentIntent.findMany({
          where: {
            jobId: { in: jobIds },
            kind: "LABOR",
            state: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED"] },
          },
          orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            jobId: true,
            amount: true,
            refundedAmount: true,
            provider: true,
            gatewayTransactionId: true,
            merchantReference: true,
            paymentType: true,
            state: true,
          },
        })
      : [];
  const paymentsByJob = new Map();
  for (const intent of laborIntents) {
    const list = paymentsByJob.get(intent.jobId) || [];
    list.push({
      paymentIntentId: intent.id,
      amount: Number(intent.amount),
      refundedAmount: Number(intent.refundedAmount || 0),
      gateway: intent.provider,
      gatewayTransactionId: intent.gatewayTransactionId
        ? `${String(intent.gatewayTransactionId).slice(0, 4)}…${String(intent.gatewayTransactionId).slice(-4)}`
        : null,
      merchantReference: intent.merchantReference,
      paymentType: intent.paymentType,
      state: intent.state,
    });
    paymentsByJob.set(intent.jobId, list);
  }

  return rows.map((row) => {
    const ctx = { ...(expectedByProvider.get(row.providerId) || {}) };
    // Prefer repayment-linked job for display/meta when present
    if (row.job) {
      ctx.primary = {
        ...(ctx.primary || {}),
        id: ctx.primary?.id || null,
        jobId: row.job.id,
        customerId: row.job.customer?.id || ctx.primary?.customerId,
        reference: ctx.primary?.reference || row.reference,
        job: row.job,
      };
    }
    const jid = row.jobId || ctx.primary?.jobId;
    return mapAdminRefundRepaymentRow(row, {
      ...ctx,
      originalPayments: jid ? paymentsByJob.get(jid) || [] : [],
    });
  });
}

async function confirmAdminRefundRepayment(
  adminUserId,
  repaymentId,
  { adminNote, acknowledgePartial } = {}
) {
  const repayment = await prisma.providerRefundRepayment.findUnique({
    where: { id: String(repaymentId) },
    include: { provider: { include: { user: true } } },
  });
  if (!repayment) throw new AppError("Repayment not found", 404);
  if (repayment.status !== "SUBMITTED") {
    throw new AppError("Repayment already reviewed", 400);
  }

  const amount = Number(repayment.amount);
  if (!Number.isFinite(amount) || amount <= EPS) {
    throw new AppError("Repayment amount is missing or invalid; cannot confirm", 400);
  }

  const { expectedAmount } = await getProviderExpectedRepaymentAmount(repayment.providerId);
  const difference = roundMoney(Math.abs(amount - expectedAmount));
  if (difference > EPS && !acknowledgePartial) {
    throw new AppError(
      `Amount mismatch: submitted R${amount.toFixed(2)} vs expected R${expectedAmount.toFixed(2)}. Pass acknowledgePartial to confirm a partial repayment.`,
      400
    );
  }

  let payouts = [];

  await prisma.$transaction(async (tx) => {
    const { payouts: p } = await applyProviderRecovery(tx, {
      providerId: repayment.providerId,
      amount,
      source: repayment.method === "GATEWAY" ? "gateway_repayment" : "bank_transfer",
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

    // Mark customer refund READY — do NOT auto-process gateway refund here.
    for (const pay of p) {
      if (!pay.jobId || pay.amount <= EPS) continue;
      await mutateJobMetaInTransaction(tx, pay.jobId, (m) => {
        const refund = m.refund && typeof m.refund === "object" ? m.refund : {};
        return {
          ...m,
          refund: {
            ...refund,
            customerRefundStatus: "READY",
            readyPayoutAmount: roundMoney(
              (Number(refund.readyPayoutAmount) || 0) + Number(pay.amount)
            ),
            repaymentId: repayment.id,
            readyAt: new Date().toISOString(),
          },
        };
      });
    }
  });

  await notificationEvents.notifyProviderRepaymentConfirmed(
    repayment.provider.userId,
    amount
  );
  await notificationEvents.notifyAdminCustomerRefundReady({
    repaymentId: repayment.id,
    providerId: repayment.provider.userId,
    amount,
    jobIds: payouts.map((p) => p.jobId).filter(Boolean),
  });
  for (const p of payouts) {
    if (p.customerId) {
      await notificationEvents.notifyCustomerRefundApproved({
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
  getProviderJobRefundObligation,
  deriveRepaymentStatus,
  submitProviderRepayment,
  createProviderRefundRepaymentCheckout,
  markGatewayRepaymentPaidFromIntent,
  processAdminCustomerRefund,
  listAdminRefundRepayments,
  confirmAdminRefundRepayment,
  rejectAdminRefundRepayment,
  ensureRefundRecoveriesForProvider,
  dueAtFromNow,
};
