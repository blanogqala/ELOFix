const { Prisma } = require("@prisma/client");
const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const bankCrypto = require("../utils/bankCrypto");
const { hashBankAccount } = require("../utils/identityHash.util");
const materialOrderService = require("./materialOrder.service");
const supplierService = require("./supplier.service");
const { idempotencyGate, idempotencyCommit } = require("../utils/idempotencyTransaction");
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES } = require("../constants/auditActions");

const RESERVED_WITHDRAWAL_STATUSES = new Set(["pending", "approved", "paid", "PENDING", "APPROVED", "PAID"]);

function roundMoney2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function coerceMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new AppError("amount must be a positive number", 400);
  }
  return n;
}

function toBranchPublicProfileRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    branchId: row.branchId,
    bankName: row.bankName,
    accountHolder: row.accountHolder,
    accountNumberMasked: bankCrypto.maskAccountNumber(row.accountNumber),
    branchCodeMasked: bankCrypto.maskBranchCode(row.branchCode),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

async function resolveBranchPortalActor(reqUser) {
  return supplierService.resolveInventoryActor(reqUser);
}

async function requireBranchAccess(actor, branchId) {
  return supplierService.assertBranchInventoryAccess(actor, branchId);
}

function parseDateBound(value, endOfDay) {
  const s = String(value || "").trim();
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function sumReservedWithdrawalsTx(tx, branchId) {
  const rows = await tx.branchWithdrawalRequest.findMany({
    where: { branchId: String(branchId) },
    select: { amount: true, status: true },
  });
  return rows
    .filter((w) => RESERVED_WITHDRAWAL_STATUSES.has(String(w.status)))
    .reduce((sum, w) => sum + Number(w.amount), 0);
}

async function sumReservedWithdrawalsInRange(branchId, { from, to } = {}) {
  const fromDate = parseDateBound(from, false);
  const toDate = parseDateBound(to, true);
  const createdAtFilter =
    fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {};

  const rows = await prisma.branchWithdrawalRequest.findMany({
    where: { branchId: String(branchId), ...createdAtFilter },
    select: { amount: true, status: true },
  });
  return rows
    .filter((w) => RESERVED_WITHDRAWAL_STATUSES.has(String(w.status)))
    .reduce((sum, w) => sum + Number(w.amount), 0);
}

async function computeBranchAvailableWithdrawalsInRange(supplierOrgId, branchId, { from, to } = {}) {
  const earnedInRange = await materialOrderService.computeBranchEarnedInRange(supplierOrgId, branchId, {
    from,
    to,
  });
  const withdrawnInRange = await sumReservedWithdrawalsInRange(branchId, { from, to });
  return Math.max(0, roundMoney2(earnedInRange - withdrawnInRange));
}

async function computeSupplierAvailableWithdrawalsSummary(supplierOrgId, { from, to } = {}) {
  const sid = String(supplierOrgId || "").trim();
  if (!sid) return { totalAvailable: 0, byBranchId: {} };

  const branches = await prisma.branch.findMany({
    where: { supplierId: sid },
    select: { id: true },
  });

  const byBranchId = {};
  let totalAvailable = 0;
  for (const b of branches) {
    const available = await computeBranchAvailableWithdrawalsInRange(sid, b.id, { from, to });
    byBranchId[b.id] = available;
    totalAvailable = roundMoney2(totalAvailable + available);
  }

  return { totalAvailable, byBranchId };
}

async function getBranchBalanceForBranch(branchId, supplierOrgId) {
  const totalEarned = await materialOrderService.computeBranchAllTimeEarned(supplierOrgId, branchId);
  const withdrawals = await prisma.branchWithdrawalRequest.findMany({
    where: { branchId: String(branchId) },
    select: { amount: true, status: true },
  });
  const totalWithdrawn = withdrawals
    .filter((w) => RESERVED_WITHDRAWAL_STATUSES.has(String(w.status)))
    .reduce((sum, w) => sum + Number(w.amount), 0);
  const withdrawalCap = roundMoney2(totalEarned);
  const available = Math.max(0, roundMoney2(withdrawalCap - totalWithdrawn));
  return {
    totalEarned: roundMoney2(totalEarned),
    totalWithdrawn: roundMoney2(totalWithdrawn),
    withdrawalCap,
    available,
  };
}

async function getBranchBalance(reqUser, branchId) {
  const actor = await resolveBranchPortalActor(reqUser);
  const br = await requireBranchAccess(actor, branchId);
  const balance = await getBranchBalanceForBranch(br.id, actor.supplierOrgId);
  return balance;
}

async function getWithdrawalProfile(reqUser, branchId) {
  const actor = await resolveBranchPortalActor(reqUser);
  await requireBranchAccess(actor, branchId);
  const profile = await prisma.branchWithdrawalProfile.findUnique({
    where: { branchId: String(branchId) },
  });
  return { profile: toBranchPublicProfileRow(profile) };
}

async function upsertWithdrawalProfile(reqUser, branchId, body) {
  const actor = await resolveBranchPortalActor(reqUser);
  await requireBranchAccess(actor, branchId);

  const bankName = String(body?.bankName || "").trim();
  const accountHolder = String(body?.accountHolder || "").trim();
  if (bankName.length < 2) throw new AppError("bankName is required", 400);
  if (accountHolder.length < 2) throw new AppError("accountHolder is required", 400);

  const existing = await prisma.branchWithdrawalProfile.findUnique({
    where: { branchId: String(branchId) },
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

  const bankHash = hashBankAccount(bankName, plainBranch, plainAccount);

  const profile = await prisma.branchWithdrawalProfile.upsert({
    where: { branchId: String(branchId) },
    create: {
      id: randomUUID(),
      branchId: String(branchId),
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

  return { profile: toBranchPublicProfileRow(profile) };
}

async function requestWithdrawal(reqUser, branchId, body, idempotencyKey, requestHash, route) {
  const actor = await resolveBranchPortalActor(reqUser);
  const br = await requireBranchAccess(actor, branchId);
  const amount = coerceMoney(body?.amount);

  const bank = await prisma.branchWithdrawalProfile.findUnique({
    where: { branchId: br.id },
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

      const totalEarned = await materialOrderService.computeBranchAllTimeEarned(actor.supplierOrgId, br.id);
      const totalWithdrawn = await sumReservedWithdrawalsTx(tx, br.id);
      const withdrawalCap = roundMoney2(totalEarned);
      const available = Math.max(0, roundMoney2(withdrawalCap - totalWithdrawn));

      if (amount > available) {
        throw new AppError("Insufficient funds", 400);
      }

      const withdrawal = await tx.branchWithdrawalRequest.create({
        data: {
          id: randomUUID(),
          branchId: br.id,
          amount,
          status: "paid",
          idempotencyKey,
        },
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
    const existing = await prisma.branchWithdrawalRequest.findUnique({
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
    userId: reqUser.userId,
    entityType: ENTITY_TYPES.WITHDRAWAL,
    entityId: row.id,
    newValue: { branchId: br.id, amount, autoPaid: true, kind: "branch" },
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

async function listBranchWithdrawals(reqUser, branchId, { from, to } = {}) {
  const actor = await resolveBranchPortalActor(reqUser);
  await requireBranchAccess(actor, branchId);

  const fromDate = parseDateBound(from, false);
  const toDate = parseDateBound(to, true);
  const createdAtFilter =
    fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {};

  const rows = await prisma.branchWithdrawalRequest.findMany({
    where: { branchId: String(branchId), ...createdAtFilter },
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

async function listSupplierOrgBranchWithdrawals(supplierOrgId, { from, to, branchId } = {}) {
  const sid = String(supplierOrgId || "").trim();
  if (!sid) throw new AppError("Invalid supplier", 400);

  const fromDate = parseDateBound(from, false);
  const toDate = parseDateBound(to, true);
  const createdAtFilter =
    fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {};

  const bid = String(branchId || "").trim();
  const branchFilter = bid ? { branchId: bid } : {};

  const rows = await prisma.branchWithdrawalRequest.findMany({
    where: {
      branch: { supplierId: sid },
      ...branchFilter,
      ...createdAtFilter,
    },
    orderBy: { createdAt: "desc" },
    include: {
      branch: { select: { id: true, name: true } },
    },
  });

  return {
    withdrawals: rows.map((w) => ({
      id: w.id,
      branchId: w.branchId,
      branchName: w.branch?.name || "",
      amount: Number(w.amount),
      status: w.status,
      createdAt: w.createdAt instanceof Date ? w.createdAt.toISOString() : String(w.createdAt),
    })),
  };
}

async function listSupplierOrgBranchWithdrawalsForPortal(reqUser, query = {}) {
  const actor = await resolveBranchPortalActor(reqUser);
  if (actor.role !== "SUPPLIER") {
    throw new AppError("Forbidden", 403);
  }
  return listSupplierOrgBranchWithdrawals(actor.supplierOrgId, query);
}

module.exports = {
  getBranchBalance,
  getWithdrawalProfile,
  upsertWithdrawalProfile,
  requestWithdrawal,
  listBranchWithdrawals,
  computeBranchAvailableWithdrawalsInRange,
  computeSupplierAvailableWithdrawalsSummary,
  listSupplierOrgBranchWithdrawals,
  listSupplierOrgBranchWithdrawalsForPortal,
};
