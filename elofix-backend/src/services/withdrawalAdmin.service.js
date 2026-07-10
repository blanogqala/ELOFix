const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const notificationEvents = require("./notificationEvents.service");
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES, ACTOR_TYPES } = require("../constants/auditActions");

function withdrawalStatus(s) {
  return String(s || "").toLowerCase();
}

function toWithdrawalDto(row) {
  return {
    id: row.id,
    providerId: row.providerId,
    amount: Number(row.amount),
    status: row.status,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    providerName: row.provider?.user?.name,
    providerEmail: row.provider?.user?.email,
  };
}

async function listWithdrawals(filters = {}) {
  const search = String(filters.search || "").trim();
  const statusFilter = String(filters.status || "").trim().toLowerCase();

  const where = {};
  if (statusFilter && statusFilter !== "all") {
    where.status = statusFilter;
  }
  if (search) {
    where.provider = {
      user: {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      },
    };
  }

  const rows = await prisma.withdrawalRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      provider: {
        include: { user: { select: { name: true, email: true } } },
      },
    },
  });
  return { withdrawals: rows.map(toWithdrawalDto) };
}

async function approveWithdrawal(adminUserId, withdrawalId) {
  const id = String(withdrawalId || "").trim();
  const row = await prisma.$transaction(
    async (tx) => {
      const wr = await tx.withdrawalRequest.findUnique({ where: { id } });
      if (!wr) throw new AppError("Withdrawal not found", 404);
      if (withdrawalStatus(wr.status) !== "pending") {
        throw new AppError("Only pending withdrawals can be approved", 400);
      }
      const updated = await tx.withdrawalRequest.update({
        where: { id },
        data: { status: "approved" },
        include: {
          provider: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      });
      return updated;
    },
    {
      maxWait: 5000,
      timeout: 15000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
  await logAudit(AUDIT_ACTIONS.WITHDRAWAL_APPROVE, {
    userId: adminUserId,
    actorType: ACTOR_TYPES.ADMIN,
    entityType: ENTITY_TYPES.WITHDRAWAL,
    entityId: id,
    newValue: { providerId: row.providerId, amount: Number(row.amount) },
  });
  await notificationEvents.notifyWithdrawalStatus(
    row.provider?.userId,
    row.id,
    "approved",
    row.amount,
    "provider"
  );
  return { withdrawal: toWithdrawalDto(row) };
}

async function markWithdrawalPaid(adminUserId, withdrawalId) {
  const id = String(withdrawalId || "").trim();
  const row = await prisma.$transaction(
    async (tx) => {
      const wr = await tx.withdrawalRequest.findUnique({ where: { id } });
      if (!wr) throw new AppError("Withdrawal not found", 404);
      if (withdrawalStatus(wr.status) !== "approved") {
        throw new AppError("Only approved withdrawals can be marked paid", 400);
      }

      const earning = await tx.earning.findFirst({
        where: { withdrawalRequestId: id },
      });

      if (earning) {
        if (earning.status === "pending") {
          await tx.earning.update({
            where: { id: earning.id },
            data: { status: "withdrawn" },
          });
        } else if (earning.status !== "withdrawn") {
          throw new AppError("Withdrawal ledger row is in an unexpected state", 409);
        }
      }

      const updated = await tx.withdrawalRequest.update({
        where: { id },
        data: { status: "paid" },
        include: {
          provider: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      });
      return updated;
    },
    {
      maxWait: 5000,
      timeout: 15000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
  await logAudit(AUDIT_ACTIONS.WITHDRAWAL_MARK_PAID, {
    userId: adminUserId,
    actorType: ACTOR_TYPES.ADMIN,
    entityType: ENTITY_TYPES.WITHDRAWAL,
    entityId: id,
    newValue: { providerId: row.providerId, amount: Number(row.amount) },
  });
  await notificationEvents.notifyWithdrawalStatus(
    row.provider?.userId,
    row.id,
    "paid",
    row.amount,
    "provider"
  );
  return { withdrawal: toWithdrawalDto(row) };
}

async function markWithdrawalFailed(adminUserId, withdrawalId, reason) {
  const id = String(withdrawalId || "").trim();
  const note = reason != null ? String(reason).slice(0, 2000) : null;
  const { updated, wr } = await prisma.$transaction(
    async (tx) => {
      const wrRow = await tx.withdrawalRequest.findUnique({ where: { id } });
      if (!wrRow) throw new AppError("Withdrawal not found", 404);
      const st = withdrawalStatus(wrRow.status);
      if (st === "paid" || st === "failed") {
        throw new AppError("Withdrawal cannot be failed in its current state", 400);
      }

      const earning = await tx.earning.findFirst({
        where: { withdrawalRequestId: id },
      });

      if (earning && earning.status === "pending") {
        await tx.earning.update({
          where: { id: earning.id },
          data: { status: "cancelled" },
        });
      }

      const updatedRow = await tx.withdrawalRequest.update({
        where: { id },
        data: { status: "failed" },
        include: {
          provider: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      });
      return { updated: updatedRow, wr: wrRow };
    },
    {
      maxWait: 5000,
      timeout: 15000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
  await logAudit(AUDIT_ACTIONS.WITHDRAWAL_MARK_FAILED, {
    userId: adminUserId,
    actorType: ACTOR_TYPES.ADMIN,
    entityType: ENTITY_TYPES.WITHDRAWAL,
    entityId: id,
    newValue: {
      providerId: wr.providerId,
      amount: Number(wr.amount),
      reason: note,
    },
  });
  await notificationEvents.notifyWithdrawalStatus(
    updated.provider?.userId,
    updated.id,
    "failed",
    updated.amount,
    "provider"
  );
  return { withdrawal: toWithdrawalDto(updated) };
}

module.exports = {
  listWithdrawals,
  approveWithdrawal,
  markWithdrawalPaid,
  markWithdrawalFailed,
};
