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
 * Move `releaseAmount` from pending credit to a new available credit row.
 */
async function applyReleaseToLedger(tx, { providerId, jobId, releaseAmount, idempotencyKey }) {
  const r = Number(releaseAmount) || 0;
  if (r <= 0) {
    throw new AppError("Release amount must be positive", 400);
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
 * Reserve funds for a withdrawal request (lifecycle: pending until mark-paid).
 */
async function createPendingWithdrawalDebit(tx, { providerId, amount, withdrawalRequestId }) {
  const a = Number(amount) || 0;
  if (a <= 0) {
    throw new AppError("Withdrawal amount must be positive", 400);
  }
  await tx.earning.create({
    data: {
      id: randomUUID(),
      providerId,
      jobId: null,
      amount: a,
      type: "debit",
      status: "pending",
      withdrawalRequestId,
    },
  });
}

module.exports = {
  syncPendingCreditToHeld,
  applyReleaseToLedger,
  createLaborCreditPending,
  createPendingWithdrawalDebit,
  EPS,
};
