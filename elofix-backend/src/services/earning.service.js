/**
 * Ledger model: single `Earning` table with type/status (credit vs debit, pending vs available, etc.).
 * Full double-entry bookkeeping (paired postings per event, escrow accounts) is deferred — see product roadmap.
 */
const { randomUUID } = require("crypto");
const AppError = require("../utils/AppError");

const EPS = 1e-6;

/**
 * Ensure pending credit row matches current escrow held (repair legacy / missing ledger rows).
 */
async function syncPendingCreditToHeld(tx, { providerId, jobId, heldAmount }) {
  const h = Number(heldAmount) || 0;
  if (h <= 0) {
    const orphan = await tx.earning.findFirst({
      where: { jobId, providerId, type: "credit", status: "pending" },
    });
    if (orphan) {
      await tx.earning.delete({ where: { id: orphan.id } });
    }
    return;
  }

  let row = await tx.earning.findFirst({
    where: { jobId, providerId, type: "credit", status: "pending" },
  });

  if (!row) {
    await tx.earning.create({
      data: {
        id: randomUUID(),
        providerId,
        jobId,
        amount: h,
        type: "credit",
        status: "pending",
      },
    });
    return;
  }

  await tx.earning.update({
    where: { id: row.id },
    data: { amount: h },
  });
}

/**
 * Debit clawback — reduces provider available balance (refund recovery).
 */
async function createClawbackDebit(tx, { providerId, jobId, amount, idempotencyKey }) {
  const a = Number(amount) || 0;
  if (a <= EPS) return;
  await tx.earning.create({
    data: {
      id: randomUUID(),
      providerId,
      jobId: jobId || null,
      amount: a,
      type: "debit",
      status: "clawback",
      ...(idempotencyKey ? { idempotencyKey } : {}),
    },
  });
}

/**
 * Outstanding refund debt — recovered from future job releases before available credit.
 */
async function createRefundDebt(tx, { providerId, jobId, amount, idempotencyKey }) {
  const a = Number(amount) || 0;
  if (a <= EPS) return;
  await tx.earning.create({
    data: {
      id: randomUUID(),
      providerId,
      jobId: jobId || null,
      amount: a,
      type: "debit",
      status: "refund_debt",
      ...(idempotencyKey ? { idempotencyKey } : {}),
    },
  });
}

/**
 * Apply new release toward outstanding refund_debt before crediting available balance.
 * @returns {{ remainingRelease: number, debtRecovered: number }}
 */
async function recoverRefundDebtFromRelease(tx, { providerId, jobId, releaseAmount, idempotencyKey }) {
  let remaining = Number(releaseAmount) || 0;
  let debtRecovered = 0;
  if (remaining <= EPS) {
    return { remainingRelease: 0, debtRecovered: 0 };
  }

  const debts = await tx.earning.findMany({
    where: { providerId, type: "debit", status: "refund_debt" },
    orderBy: { createdAt: "asc" },
  });

  for (const debt of debts) {
    if (remaining <= EPS) break;
    const dAmt = Number(debt.amount);
    const take = Math.min(remaining, dAmt);
    remaining -= take;
    debtRecovered += take;
    const newD = dAmt - take;
    if (newD <= EPS) {
      await tx.earning.delete({ where: { id: debt.id } });
    } else {
      await tx.earning.update({ where: { id: debt.id }, data: { amount: newD } });
    }
    await createClawbackDebit(tx, {
      providerId,
      jobId: debt.jobId || jobId,
      amount: take,
      idempotencyKey: idempotencyKey ? `${idempotencyKey}:debt:${debt.id}` : undefined,
    });
  }

  return { remainingRelease: remaining, debtRecovered };
}

/**
 * Consume held escrow (pending credits) toward a customer refund.
 * @returns {number} amount applied from escrow
 */
async function applyEscrowToRefund(tx, { providerId, jobId, amount }) {
  let remaining = Number(amount) || 0;
  if (remaining <= EPS) return 0;

  const pending = await tx.earning.findFirst({
    where: { jobId, providerId, type: "credit", status: "pending" },
  });
  if (!pending) return 0;

  const pAmt = Number(pending.amount);
  const take = Math.min(remaining, pAmt);
  remaining -= take;
  const newP = pAmt - take;
  if (newP <= EPS) {
    await tx.earning.delete({ where: { id: pending.id } });
  } else {
    await tx.earning.update({ where: { id: pending.id }, data: { amount: newP } });
  }
  return take;
}

/**
 * Claw back from provider available balance via clawback debits (FIFO audit trail).
 * @returns {number} amount clawed back
 */
async function clawbackFromAvailable(tx, { providerId, jobId, amount, idempotencyKey }) {
  const target = Number(amount) || 0;
  if (target <= EPS) return 0;

  const ledger = await sumLedgerForProviderTx(tx, providerId);
  const canClaw = Math.min(target, ledger.available);
  if (canClaw <= EPS) return 0;

  await createClawbackDebit(tx, {
    providerId,
    jobId,
    amount: canClaw,
    idempotencyKey: idempotencyKey ? `${idempotencyKey}:clawback` : undefined,
  });
  return canClaw;
}

async function sumLedgerForProviderTx(tx, providerId) {
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

  const creditsAvailable = Number(availSum._sum.amount) || 0;
  const withdrawn = Number(debitWithdrawnSum._sum.amount) || 0;
  const reservedPending = Number(debitPendingSum._sum.amount) || 0;
  const clawback = Number(clawbackSum._sum.amount) || 0;
  const refundDebtOwed = Number(refundDebtSum._sum.amount) || 0;
  const available = Math.max(0, creditsAvailable - withdrawn - reservedPending - clawback);

  return {
    pending: Number(pendingSum._sum.amount) || 0,
    creditsAvailable,
    withdrawn,
    reservedPending,
    clawback,
    refundDebtOwed,
    available,
  };
}

/**
 * Move `releaseAmount` from pending credit to a new available credit row.
 */
async function applyReleaseToLedger(tx, { providerId, jobId, releaseAmount, idempotencyKey }) {
  let r = Number(releaseAmount) || 0;
  if (r <= 0) {
    throw new AppError("Release amount must be positive", 400);
  }

  const { remainingRelease } = await recoverRefundDebtFromRelease(tx, {
    providerId,
    jobId,
    releaseAmount: r,
    idempotencyKey,
  });
  r = remainingRelease;
  if (r <= EPS) {
    return;
  }

  const pending = await tx.earning.findFirst({
    where: { jobId, providerId, type: "credit", status: "pending" },
  });
  if (!pending) {
    throw new AppError("No pending earnings to release", 400);
  }

  const pAmt = Number(pending.amount);
  if (r > pAmt + EPS) {
    throw new AppError("Release exceeds pending ledger", 400);
  }

  const newP = pAmt - r;
  if (newP <= EPS) {
    await tx.earning.delete({ where: { id: pending.id } });
  } else {
    await tx.earning.update({
      where: { id: pending.id },
      data: { amount: newP },
    });
  }

  await tx.earning.create({
    data: {
      id: randomUUID(),
      providerId,
      jobId,
      amount: r,
      type: "credit",
      status: "available",
      ...(idempotencyKey ? { idempotencyKey } : {}),
    },
  });
}

async function createLaborCreditPending(tx, { providerId, jobId, amount, idempotencyKey }) {
  const a = Number(amount) || 0;
  if (a <= 0) {
    throw new AppError("Labor amount must be positive", 400);
  }
  await tx.earning.create({
    data: {
      id: randomUUID(),
      providerId,
      jobId,
      amount: a,
      type: "credit",
      status: "pending",
      ...(idempotencyKey ? { idempotencyKey } : {}),
    },
  });
}

/**
 * Reserve funds for a withdrawal request.
 * @param {object} opts
 * @param {"pending"|"withdrawn"} [opts.debitStatus="pending"] — pending until admin mark-paid; withdrawn when auto-completed
 */
async function createPendingWithdrawalDebit(
  tx,
  { providerId, amount, withdrawalRequestId, debitStatus = "pending" }
) {
  const a = Number(amount) || 0;
  if (a <= 0) {
    throw new AppError("Withdrawal amount must be positive", 400);
  }
  const status = debitStatus === "withdrawn" ? "withdrawn" : "pending";
  await tx.earning.create({
    data: {
      id: randomUUID(),
      providerId,
      jobId: null,
      amount: a,
      type: "debit",
      status,
      withdrawalRequestId,
    },
  });
}

module.exports = {
  syncPendingCreditToHeld,
  applyReleaseToLedger,
  createLaborCreditPending,
  createPendingWithdrawalDebit,
  createClawbackDebit,
  createRefundDebt,
  recoverRefundDebtFromRelease,
  applyEscrowToRefund,
  clawbackFromAvailable,
  sumLedgerForProviderTx,
  EPS,
};
