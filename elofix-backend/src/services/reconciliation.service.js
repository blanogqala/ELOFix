const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { logAudit } = require("./auditLog.service");

const EPS = 0.01;

async function ledgerAggregates(providerId) {
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

/**
 * Verify earning aggregates are internally consistent.
 * @param {string} providerId Provider.id (internal UUID)
 * @param {string | null} actingUserId Admin user id for audit
 */
async function reconcileProvider(providerId, actingUserId = null) {
  const pid = String(providerId || "").trim();
  const provider = await prisma.provider.findUnique({ where: { id: pid } });
  if (!provider) throw new AppError("Provider not found", 404);

  const s = await ledgerAggregates(pid);

  const totalCredits = s.pending + s.creditsAvailable;
  const netProvider = totalCredits - s.withdrawn - s.reservedPending;
  const sumPendingPlusAvailable = s.pending + s.available;

  const ok = Math.abs(netProvider - sumPendingPlusAvailable) < EPS;

  const details = {
    providerId: pid,
    pending: s.pending,
    creditsAvailable: s.creditsAvailable,
    withdrawn: s.withdrawn,
    reservedPending: s.reservedPending,
    available: s.available,
    totalCredits,
    netProvider,
    sumPendingPlusAvailable,
  };

  if (!ok) {
    await logAudit("reconcile.mismatch", {
      userId: actingUserId,
      metadata: details,
    });
  }

  return { ok, details };
}

module.exports = { reconcileProvider, ledgerAggregates };
