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
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ACTOR_TYPES, ENTITY_TYPES } = require("../constants/auditActions");

const ACTIVE_RECOVERY_STATUSES = ["PENDING", "PARTIALLY_RECOVERED", "OVERDUE"];

function dueAtFromNow() {
  return new Date(Date.now() + getRefundDebtDueMs());
}

function isoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function pendingRepaymentAwaitsAdmin(pendingRepayment) {
  if (!pendingRepayment) return false;
  if (pendingRepayment.gatewayPaymentVerified === true) return true;
  const method = String(pendingRepayment.method || "").trim().toUpperCase();
  if (method === "GATEWAY") {
    return Boolean(pendingRepayment.gatewayPaymentVerified);
  }
  // BANK_TRANSFER or legacy DTO without method — submitted for admin review.
  return true;
}

function serializePendingRepayment(row, intent) {
  if (!row) return null;
  const method = String(row.method || "BANK_TRANSFER").toUpperCase();
  const intentState = intent ? String(intent.state || "").toUpperCase() : null;
  const gatewayPaymentVerified =
    method === "GATEWAY" &&
    Boolean(intent) &&
    String(intent.kind || "").toUpperCase() === "PROVIDER_REFUND_REPAYMENT" &&
    String(intent.state || "").toUpperCase() === "PAID";
  return {
    id: row.id,
    amount: Number(row.amount),
    reference: row.reference,
    status: row.status,
    jobId: row.jobId || null,
    createdAt: isoDate(row.createdAt),
    method,
    gatewayProvider: intent ? String(intent.provider || "") || null : null,
    paymentIntentState: intentState,
    gatewayPaymentVerified,
  };
}

const SAFE_REPAYMENT_INTENT_SELECT = {
  id: true,
  state: true,
  provider: true,
  kind: true,
  jobId: true,
  userId: true,
  amount: true,
  commissionAmount: true,
  paidAt: true,
  gatewayTransactionId: true,
  merchantReference: true,
};

function resolveRepaymentCheckoutProvider(preferredProvider, enabled) {
  const list = Array.isArray(enabled) ? enabled : [];
  if (!list.length) {
    throw new AppError("No payment gateway is configured for repayment", 503);
  }
  const raw = preferredProvider == null ? "" : String(preferredProvider).trim();
  const explicit = raw.length > 0;
  const { normalizeProvider } = require("./payments/gatewayRegistry");
  if (explicit) {
    const key = normalizeProvider(raw);
    if (!key || !list.includes(key)) {
      throw new AppError("Selected payment method is not available", 400);
    }
    return key;
  }
  return list[0];
}

function isUnresolvedGatewayIntent(intent) {
  return ["PENDING", "PROCESSING"].includes(String(intent?.state || "").toUpperCase());
}

function isAuthoritativeFailedGatewayIntent(intent) {
  return ["FAILED", "CANCELLED"].includes(String(intent?.state || "").toUpperCase());
}

function assertGatewayRepaymentIntentPayable(repayment, intent) {
  const method = String(repayment?.method || "BANK_TRANSFER").toUpperCase();
  const hasIntentLink = Boolean(repayment?.paymentIntentId || intent?.id);
  if (method !== "GATEWAY" && !hasIntentLink) {
    return true;
  }
  if (!intent) {
    throw new AppError(
      "Gateway repayment cannot be confirmed until the linked payment is found",
      409
    );
  }
  if (String(intent.kind || "").toUpperCase() !== "PROVIDER_REFUND_REPAYMENT") {
    throw new AppError("Linked payment is not a provider refund repayment", 409);
  }
  if (String(intent.state || "").toUpperCase() !== "PAID") {
    throw new AppError(
      "Gateway repayment cannot be confirmed until payment is verified as paid",
      409
    );
  }
  if (!intent.paidAt) {
    throw new AppError("Gateway repayment is missing authoritative paid proof", 409);
  }
  if (!intent.gatewayTransactionId && !intent.merchantReference) {
    throw new AppError("Gateway repayment is missing transaction proof", 409);
  }
  const providerUserId = repayment?.provider?.userId || repayment?.providerUserId;
  if (providerUserId && String(intent.userId) !== String(providerUserId)) {
    throw new AppError("Payment does not belong to this provider", 409);
  }
  if (repayment?.jobId && intent.jobId && String(intent.jobId) !== String(repayment.jobId)) {
    throw new AppError("Payment job does not match this repayment", 409);
  }
  const { toCents } = require("./payments/money.util");
  if (toCents(intent.amount) !== toCents(repayment.amount)) {
    throw new AppError("Payment amount does not match the repayment", 409);
  }
  return true;
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
  if (pendingRepaymentAwaitsAdmin(pendingRepayment)) {
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
async function applyRecoveryToRefundRecoveriesInTransaction(tx, { providerId, amount, debtJobId = null }) {
  let remaining = roundMoney(amount);
  const payouts = [];
  if (remaining <= EPS) return payouts;

  const recoveries = await tx.refundRecovery.findMany({
    where: {
      providerId,
      status: { in: ACTIVE_RECOVERY_STATUSES },
      ...(debtJobId ? { jobId: String(debtJobId) } : {}),
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
  debtJobId = null,
  idempotencyKey = null,
}) {
  const target = roundMoney(amount);
  if (target <= EPS) return { recovered: 0, payouts: [], source };

  const { recovered, payouts } = await earningService.recoverRefundDebtByAmount(tx, {
    providerId,
    jobId,
    debtJobId: debtJobId || null,
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
        continue;
      }
      if (!gateway.result?.ok) {
        await prisma.$transaction(async (tx) => {
          await mutateJobMetaInTransaction(tx, p.jobId, (m) => {
            const refund = m.refund && typeof m.refund === "object" ? m.refund : {};
            const pending = Boolean(gateway.pending || gateway.result?.pending);
            const actionRequired = Boolean(gateway.manualOnly && pending);
            return {
              ...m,
              refund: {
                ...refund,
                customerRefundStatus: actionRequired
                  ? refund.customerRefundStatus || "REFUND_PROCESSING"
                  : "REFUND_PROCESSING",
                status: actionRequired ? "needs_attention" : refund.status || "processing",
                actionRequired: actionRequired || Boolean(refund.actionRequired),
                actionRequiredReason: actionRequired
                  ? gateway.result?.message || "paystack_refund_needs_attention"
                  : refund.actionRequiredReason || null,
              },
            };
          });
        });
        continue;
      }
      const externalRefundId =
        gateway.result?.externalRefundId ||
        (gateway.result?.results || []).map((r) => r.externalRefundId).find(Boolean) ||
        null;
      await paymentService.createRefundInvoiceInTransaction(prisma, {
        userId: p.customerId,
        jobId: p.jobId,
        laborRefund: p.amount,
        materialsRefund: 0,
        cardLast4: "0000",
        meta: { externalRefundId, source: "staged_customer_payout" },
      });
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
              status: "processed",
              customerRefundStatus: "REFUND_COMPLETED",
              immediateRefund: roundMoney(prevImmediate + p.amount),
              pendingRefund: Math.max(0, roundMoney(prevPending - p.amount)),
              completedAt: new Date().toISOString(),
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

  const [recoveries, pendingRepayments, lastRejectedRow] = await Promise.all([
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
    prisma.providerRefundRepayment.findMany({
      where: { providerId: providerProfileId, status: "SUBMITTED" },
      orderBy: { createdAt: "desc" },
      include: { paymentIntent: { select: SAFE_REPAYMENT_INTENT_SELECT } },
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

  const pendingByJobId = new Map();
  let legacyPendingDto = null;
  for (const row of pendingRepayments) {
    const dto = serializePendingRepayment(row, row.paymentIntent || null);
    if (row.jobId) {
      if (!pendingByJobId.has(String(row.jobId))) pendingByJobId.set(String(row.jobId), dto);
    } else if (!legacyPendingDto) {
      legacyPendingDto = dto;
    }
  }

  const pendingRepaymentDto = pendingRepayments[0]
    ? serializePendingRepayment(pendingRepayments[0], pendingRepayments[0].paymentIntent || null)
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

  function pendingForRecoveryJob(recoveryJobId) {
    if (recoveryJobId && pendingByJobId.has(String(recoveryJobId))) {
      return pendingByJobId.get(String(recoveryJobId));
    }
    if (pendingByJobId.size > 0) return null;
    return legacyPendingDto;
  }

  const recoveryDtos = recoveries.map((r) => {
    const balance = roundMoney(Number(r.totalPending) - Number(r.recoveredAmount));
    const refundMeta = refundMetaFromJob(r.job);
    const pendingForRow = pendingForRecoveryJob(r.jobId);
    const repaymentStatus = deriveRepaymentStatus({
      recoveryStatus: r.status,
      balance,
      pendingRepayment: pendingForRow,
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
      pendingRepayment: pendingForRow,
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
      include: { paymentIntent: { select: SAFE_REPAYMENT_INTENT_SELECT } },
    });
    if (pendingRow && (!pendingRow.jobId || String(pendingRow.jobId) === String(job.id))) {
      pendingForJob = serializePendingRepayment(pendingRow, pendingRow.paymentIntent || null);
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
async function getProviderExpectedRepaymentAmount(providerProfileId, { jobId } = {}) {
  await ensureRefundRecoveriesForProvider(providerProfileId);
  await repairOverstatedProviderRefundRecoveries(providerProfileId);

  const recoveries = await prisma.refundRecovery.findMany({
    where: {
      providerId: providerProfileId,
      status: { in: ACTIVE_RECOVERY_STATUSES },
      ...(jobId ? { jobId: String(jobId) } : {}),
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

function repaymentCheckoutUrls(jobId, intentId) {
  const { frontendBaseUrl } = require("./payments/paymentConfig");
  return {
    returnUrl: `${frontendBaseUrl()}/provider/jobs/${jobId}/refund?intentId=${intentId}`,
    cancelUrl: `${frontendBaseUrl()}/provider/jobs/${jobId}/refund?cancelled=1`,
  };
}

function checkoutResponse({
  repayment,
  intent,
  checkout,
  providerKey,
  derivedAmount,
  status = "SUBMITTED",
  gatewayPaymentVerified = false,
  lockedProvider = null,
}) {
  return {
    repaymentId: repayment.id,
    intentId: intent.id,
    amount: derivedAmount,
    provider: providerKey,
    merchantReference: intent.merchantReference,
    checkout: checkout || null,
    status,
    gatewayPaymentVerified,
    lockedProvider: lockedProvider || (isUnresolvedGatewayIntent(intent) ? String(intent.provider) : null),
  };
}

async function createRepaymentGatewayCheckout(intent, customer, derivedAmount, urls) {
  const { getGateway } = require("./payments/gatewayRegistry");
  const gw = getGateway(intent.provider);
  return gw.createCheckout(
    {
      ...intent,
      amount: derivedAmount != null ? derivedAmount : Number(intent.amount),
      returnUrl: urls.returnUrl || intent.returnUrl,
      cancelUrl: urls.cancelUrl || intent.cancelUrl,
    },
    customer
  );
}

async function resetRepaymentIntentForRetry(tx, intent, {
  providerKey,
  derivedAmount,
  returnUrl,
  cancelUrl,
}) {
  const { Prisma } = require("@prisma/client");
  const { paymentCurrency } = require("./payments/paymentConfig");
  const merchantReference = `EFX-RR-${randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
  return tx.paymentIntent.update({
    where: { id: intent.id },
    data: {
      merchantReference,
      provider: providerKey,
      amount: new Prisma.Decimal(derivedAmount.toFixed(2)),
      commissionAmount: new Prisma.Decimal("0"),
      recipientAmount: new Prisma.Decimal(derivedAmount.toFixed(2)),
      currency: paymentCurrency(),
      state: "PENDING",
      failedAt: null,
      cancelledAt: null,
      paidAt: null,
      refundedAt: null,
      gatewayTransactionId: null,
      returnUrl,
      cancelUrl,
    },
  });
}

async function applyPaystackVerifyToRepaymentIntent(intent, verified) {
  const webhookService = require("./payments/webhook.service");
  const state = String(verified.state || "").toUpperCase();
  return webhookService.processWebhookResult("PAYSTACK", {
    valid: true,
    merchantReference: verified.merchantReference || intent.merchantReference,
    gatewayTransactionId: verified.gatewayTransactionId,
    state,
    amount: verified.amount,
    currency: verified.currency || intent.currency || "ZAR",
    externalEventId: `repay-verify:${intent.id}:${verified.gatewayTransactionId || Date.now()}`,
    raw: {
      ...(verified.raw && typeof verified.raw === "object" ? verified.raw : {}),
      source: "provider_refund_repayment_verify",
    },
  });
}

async function verifyPaystackRepaymentIntent(intent) {
  const { getGateway } = require("./payments/gatewayRegistry");
  const gw = getGateway("PAYSTACK");
  if (typeof gw.verifyTransaction !== "function") {
    throw new AppError("Paystack verification is unavailable", 503);
  }
  try {
    return await gw.verifyTransaction(intent.merchantReference);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      err?.message || "Could not verify the existing Paystack repayment. Try again shortly.",
      503
    );
  }
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
  const { getGateway, listEnabledGateways } = require("./payments/gatewayRegistry");
  const { paymentCurrency } = require("./payments/paymentConfig");
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
  const providerKey = resolveRepaymentCheckoutProvider(preferredProvider, enabled);
  getGateway(providerKey);

  const customer = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { email: true, name: true, phone: true },
  });

  const existing = await prisma.providerRefundRepayment.findFirst({
    where: {
      providerId: provider.id,
      jobId: String(jobId),
      status: "SUBMITTED",
    },
    include: { paymentIntent: true },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return continueExistingProviderRefundRepaymentCheckout({
      existing,
      preferredProvider,
      providerKey,
      derivedAmount,
      jobId,
      customer,
    });
  }

  const urls = repaymentCheckoutUrls(jobId, "pending");
  const created = await prisma.$transaction(async (tx) => {
    const pending = await tx.providerRefundRepayment.findFirst({
      where: {
        providerId: provider.id,
        jobId: String(jobId),
        status: "SUBMITTED",
      },
    });
    if (pending) {
      throw new AppError(
        "A repayment attempt is already in progress for this job.",
        409
      );
    }

    const intentId = randomUUID();
    const merchantReference = `EFX-RR-${intentId.replace(/-/g, "").slice(0, 16).toUpperCase()}`;
    const { returnUrl, cancelUrl } = repaymentCheckoutUrls(jobId, intentId);

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

    return { repayment, intent, returnUrl, cancelUrl };
  });

  const checkout = await createRepaymentGatewayCheckout(
    created.intent,
    customer,
    derivedAmount,
    { returnUrl: created.returnUrl, cancelUrl: created.cancelUrl }
  );

  return checkoutResponse({
    repayment: created.repayment,
    intent: created.intent,
    checkout,
    providerKey,
    derivedAmount,
    status: "SUBMITTED",
    gatewayPaymentVerified: false,
    lockedProvider: providerKey,
  });
}

async function continueExistingProviderRefundRepaymentCheckout({
  existing,
  preferredProvider,
  providerKey,
  derivedAmount,
  jobId,
  customer,
}) {
  const method = String(existing.method || "BANK_TRANSFER").toUpperCase();
  if (method !== "GATEWAY" || !existing.paymentIntentId) {
    throw new AppError(
      "You already have a repayment waiting for admin review. Please wait for approval before submitting again.",
      409
    );
  }

  const intent = existing.paymentIntent
    || await prisma.paymentIntent.findUnique({ where: { id: existing.paymentIntentId } });
  if (!intent) {
    throw new AppError("The existing repayment payment could not be found. Contact support.", 409);
  }
  if (String(intent.kind || "") !== "PROVIDER_REFUND_REPAYMENT") {
    throw new AppError("Linked payment is not a provider refund repayment", 409);
  }

  const existingProvider = String(intent.provider || "").toUpperCase();
  const requestedDifferentGateway =
    Boolean(preferredProvider && String(preferredProvider).trim()) &&
    existingProvider &&
    existingProvider !== String(providerKey);

  if (String(intent.state || "").toUpperCase() === "PAID") {
    return checkoutResponse({
      repayment: existing,
      intent,
      checkout: null,
      providerKey: existingProvider,
      derivedAmount,
      status: "AWAITING_VERIFICATION",
      gatewayPaymentVerified: true,
      lockedProvider: existingProvider,
    });
  }

  if (existingProvider === "PAYSTACK") {
    let verified;
    try {
      verified = await verifyPaystackRepaymentIntent(intent);
    } catch (err) {
      throw err instanceof AppError
        ? err
        : new AppError("Could not verify the existing Paystack repayment. Try again shortly.", 503);
    }
    const verifyState = String(verified?.state || "").toUpperCase();
    if (verifyState === "PAID") {
      await applyPaystackVerifyToRepaymentIntent(intent, verified);
      const paidIntent = await prisma.paymentIntent.findUnique({ where: { id: intent.id } });
      return checkoutResponse({
        repayment: existing,
        intent: paidIntent || intent,
        checkout: null,
        providerKey: existingProvider,
        derivedAmount,
        status: "AWAITING_VERIFICATION",
        gatewayPaymentVerified: true,
        lockedProvider: existingProvider,
      });
    }
    if (verifyState === "PROCESSING" || verifyState === "PENDING") {
      const urls = repaymentCheckoutUrls(jobId, intent.id);
      const checkout = await createRepaymentGatewayCheckout(intent, customer, derivedAmount, urls);
      return checkoutResponse({
        repayment: existing,
        intent,
        checkout,
        providerKey: existingProvider,
        derivedAmount,
        status: "PROCESSING",
        gatewayPaymentVerified: false,
        lockedProvider: existingProvider,
      });
    }
    if (verifyState === "FAILED" || verifyState === "CANCELLED") {
      const urls = repaymentCheckoutUrls(jobId, intent.id);
      const refreshed = await prisma.$transaction(async (tx) => {
        const latest = await tx.paymentIntent.findUnique({ where: { id: intent.id } });
        if (latest && String(latest.state).toUpperCase() === "PAID") {
          return { alreadyPaid: true, intent: latest };
        }
        const next = await resetRepaymentIntentForRetry(tx, intent, {
          providerKey,
          derivedAmount,
          returnUrl: urls.returnUrl,
          cancelUrl: urls.cancelUrl,
        });
        await tx.providerRefundRepayment.update({
          where: { id: existing.id },
          data: {
            merchantReference: next.merchantReference,
            paymentIntentId: next.id,
            method: "GATEWAY",
          },
        });
        return { alreadyPaid: false, intent: next };
      });
      if (refreshed.alreadyPaid) {
        return checkoutResponse({
          repayment: existing,
          intent: refreshed.intent,
          checkout: null,
          providerKey: existingProvider,
          derivedAmount,
          status: "AWAITING_VERIFICATION",
          gatewayPaymentVerified: true,
          lockedProvider: existingProvider,
        });
      }
      const checkout = await createRepaymentGatewayCheckout(
        refreshed.intent,
        customer,
        derivedAmount,
        urls
      );
      return checkoutResponse({
        repayment: existing,
        intent: refreshed.intent,
        checkout,
        providerKey,
        derivedAmount,
        status: "SUBMITTED",
        gatewayPaymentVerified: false,
        lockedProvider: providerKey,
      });
    }
    throw new AppError(
      "Could not determine the existing Paystack repayment status. Try again shortly.",
      503
    );
  }

  // PayFast (and other adapters without reliable server lookup): fail closed on switch.
  if (isUnresolvedGatewayIntent(intent)) {
    if (requestedDifferentGateway) {
      throw new AppError(
        `Complete or resolve the existing ${existingProvider} payment before choosing another method.`,
        409
      );
    }
    const urls = {
      returnUrl: intent.returnUrl || repaymentCheckoutUrls(jobId, intent.id).returnUrl,
      cancelUrl: intent.cancelUrl || repaymentCheckoutUrls(jobId, intent.id).cancelUrl,
    };
    const checkout = await createRepaymentGatewayCheckout(intent, customer, derivedAmount, urls);
    return checkoutResponse({
      repayment: existing,
      intent,
      checkout,
      providerKey: existingProvider,
      derivedAmount,
      status: "SUBMITTED",
      gatewayPaymentVerified: false,
      lockedProvider: existingProvider,
    });
  }

  if (isAuthoritativeFailedGatewayIntent(intent)) {
    const urls = repaymentCheckoutUrls(jobId, intent.id);
    const refreshed = await prisma.$transaction(async (tx) => {
      const next = await resetRepaymentIntentForRetry(tx, intent, {
        providerKey,
        derivedAmount,
        returnUrl: urls.returnUrl,
        cancelUrl: urls.cancelUrl,
      });
      await tx.providerRefundRepayment.update({
        where: { id: existing.id },
        data: {
          merchantReference: next.merchantReference,
          paymentIntentId: next.id,
          method: "GATEWAY",
        },
      });
      return next;
    });
    const checkout = await createRepaymentGatewayCheckout(refreshed, customer, derivedAmount, urls);
    return checkoutResponse({
      repayment: existing,
      intent: refreshed,
      checkout,
      providerKey,
      derivedAmount,
      status: "SUBMITTED",
      gatewayPaymentVerified: false,
      lockedProvider: providerKey,
    });
  }

  throw new AppError(
    "The existing repayment cannot be safely restarted yet. Complete the current payment or contact support.",
    409
  );
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

    if (gateway.pending && !gateway.requiresManualAction) {
      await prisma.$transaction(async (tx) => {
        await mutateJobMetaInTransaction(tx, p.jobId, (m) => {
          const refund = m.refund && typeof m.refund === "object" ? m.refund : {};
          return {
            ...m,
            refund: {
              ...refund,
              status: "processing",
              customerRefundStatus: "REFUND_PROCESSING",
              originalPaymentIntentIds: gateway.originalPaymentIntentIds || [],
              gatewayRefundRefs: (gateway.results || []).map((r) => r.externalRefundId).filter(Boolean),
            },
          };
        });
      });
      results.push({ jobId: p.jobId, status: "REFUND_PROCESSING", gateway });
      continue;
    }

    if (gateway.pending && gateway.requiresManualAction) {
      await prisma.$transaction(async (tx) => {
        await mutateJobMetaInTransaction(tx, p.jobId, (m) => {
          const refund = m.refund && typeof m.refund === "object" ? m.refund : {};
          return {
            ...m,
            refund: {
              ...refund,
              status: "needs_attention",
              customerRefundStatus: "REFUND_PROCESSING",
              actionRequired: true,
              actionRequiredReason: gateway.message || "paystack_refund_needs_attention",
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
      results.push({ jobId: p.jobId, status: "REFUND_PROCESSING", gateway });
      continue;
    }

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
    const externalRefundId = (gateway.results || []).map((r) => r.externalRefundId).filter(Boolean)[0] || null;
    await paymentService.createRefundInvoiceInTransaction(prisma, {
      userId: p.customerId,
      jobId: p.jobId,
      laborRefund: p.amount,
      materialsRefund: 0,
      cardLast4: "0000",
      meta: { externalRefundId, source: "admin_customer_refund" },
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

function summarizeCustomerRefundPayoutResults(results) {
  const statuses = (results || []).map((r) => String(r.status || ""));
  if (!statuses.length) return "NONE";
  if (statuses.every((s) => s === "REFUND_COMPLETED")) return "REFUND_COMPLETED";
  if (statuses.some((s) => s === "REFUND_PROCESSING")) return "REFUND_PROCESSING";
  if (statuses.some((s) => s === "REFUND_FAILED")) return "REFUND_FAILED";
  if (statuses.some((s) => s === "REFUND_MANUAL_ACTION_REQUIRED")) {
    return "REFUND_MANUAL_ACTION_REQUIRED";
  }
  return statuses[0] || "UNKNOWN";
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
      where: {
        providerId: provider.id,
        status: "SUBMITTED",
        ...(jobId ? { jobId: String(jobId) } : {}),
      },
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
  const expectedByProviderJob = new Map();
  await Promise.all(
    providerIds.map(async (pid) => {
      expectedByProvider.set(pid, await getProviderExpectedRepaymentAmount(pid));
    })
  );
  await Promise.all(
    rows
      .filter((r) => r.jobId)
      .map(async (r) => {
        const key = `${r.providerId}:${r.jobId}`;
        if (expectedByProviderJob.has(key)) return;
        expectedByProviderJob.set(
          key,
          await getProviderExpectedRepaymentAmount(r.providerId, { jobId: r.jobId })
        );
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
    const providerCtx = expectedByProvider.get(row.providerId) || {};
    const jobCtx =
      row.jobId ? expectedByProviderJob.get(`${row.providerId}:${row.jobId}`) : null;
    const ctx = { ...(jobCtx || providerCtx) };
    if (jobCtx) {
      ctx.expectedAmount = jobCtx.expectedAmount;
      ctx.recoveries = jobCtx.recoveries;
      ctx.primary = jobCtx.primary || providerCtx.primary || null;
    }
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
    include: {
      provider: { include: { user: true } },
      paymentIntent: true,
    },
  });
  if (!repayment) throw new AppError("Repayment not found", 404);
  if (repayment.status === "CONFIRMED") {
    return { repayment, customerRefund: { status: "NONE", results: [] }, idempotent: true };
  }
  if (repayment.status !== "SUBMITTED") {
    throw new AppError("Repayment already reviewed", 400);
  }

  assertGatewayRepaymentIntentPayable(repayment, repayment.paymentIntent);

  const amount = Number(repayment.amount);
  if (!Number.isFinite(amount) || amount <= EPS) {
    throw new AppError("Repayment amount is missing or invalid; cannot confirm", 400);
  }

  const debtJobId = repayment.jobId ? String(repayment.jobId) : null;
  const { expectedAmount } = await getProviderExpectedRepaymentAmount(repayment.providerId, {
    jobId: debtJobId,
  });
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
      jobId: debtJobId,
      debtJobId,
      idempotencyKey: `repayment:${repayment.id}`,
    });
    payouts = debtJobId
      ? (p || []).filter((pay) => pay.jobId && String(pay.jobId) === debtJobId)
      : p;

    await tx.providerRefundRepayment.update({
      where: { id: repayment.id },
      data: {
        status: "CONFIRMED",
        reviewedBy: String(adminUserId),
        reviewedAt: new Date(),
        adminNote: adminNote != null ? String(adminNote) : null,
      },
    });

    // Mark READY only for payouts belonging to this recovery (job-scoped when debtJobId is set).
    for (const pay of payouts || []) {
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
  try {
    await clearProviderRefundDebtRestrictionIfClear(repayment.providerId);
  } catch (e) {
    console.error("[refundRecovery] clear provider restriction failed", e);
  }
  for (const p of payouts) {
    if (p.customerId) {
      await notificationEvents.notifyCustomerRefundApproved({
        customerId: p.customerId,
        jobId: p.jobId,
        amount: p.amount,
      });
    }
  }

  let customerRefund = { status: "NONE", results: [] };
  const shouldPayout =
    Boolean(repayment.jobId) ||
    (payouts || []).some((p) => p.jobId && Number(p.amount) > EPS);
  if (shouldPayout) {
    try {
      const payoutResult = await processAdminCustomerRefund(adminUserId, repayment.id);
      customerRefund = {
        status: summarizeCustomerRefundPayoutResults(payoutResult?.results),
        results: payoutResult?.results || [],
      };
    } catch (e) {
      console.error("[refundRecovery] auto customer refund after confirm failed", e);
      customerRefund = {
        status: "REFUND_FAILED",
        results: [],
        error: e?.message || String(e),
      };
    }
  }

  return {
    repayment,
    customerRefund,
  };
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

/**
 * Lift refund-debt new-work restriction when no OVERDUE recoveries remain.
 * Does not clear an admin block that was not applied for refund debt.
 */
async function clearProviderRefundDebtRestrictionIfClear(providerId) {
  const overdue = await prisma.refundRecovery.findFirst({
    where: { providerId: String(providerId), status: "OVERDUE" },
    select: { id: true },
  });
  if (overdue) return false;
  const provider = await prisma.provider.findUnique({
    where: { id: String(providerId) },
    select: {
      id: true,
      userId: true,
      blocked: true,
      refundDebtBlockedAt: true,
      blockedReason: true,
    },
  });
  if (!provider?.refundDebtBlockedAt) return false;
  await prisma.provider.update({
    where: { id: provider.id },
    data: {
      blocked: false,
      blockedReason: null,
      blockedAt: null,
      refundDebtBlockedAt: null,
    },
  });
  await logAudit(AUDIT_ACTIONS.PROVIDER_RESTRICTION_CLEARED, {
    actorType: ACTOR_TYPES.SYSTEM,
    entityType: ENTITY_TYPES.PROVIDER,
    entityId: provider.id,
    newValue: { cleared: true },
  });
  const notificationEvents = require("./notificationEvents.service");
  await notificationEvents.notifyProviderRestrictionCleared(provider.userId);
  await notificationEvents.notifyAccountUnblocked(provider.userId);
  return true;
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
  getProviderExpectedRepaymentAmount,
  getProviderJobRefundObligation,
  deriveRepaymentStatus,
  pendingRepaymentAwaitsAdmin,
  serializePendingRepayment,
  resolveRepaymentCheckoutProvider,
  assertGatewayRepaymentIntentPayable,
  submitProviderRepayment,
  createProviderRefundRepaymentCheckout,
  markGatewayRepaymentPaidFromIntent,
  processAdminCustomerRefund,
  summarizeCustomerRefundPayoutResults,
  listAdminRefundRepayments,
  confirmAdminRefundRepayment,
  rejectAdminRefundRepayment,
  ensureRefundRecoveriesForProvider,
  dueAtFromNow,
  clearProviderRefundDebtRestrictionIfClear,
};
