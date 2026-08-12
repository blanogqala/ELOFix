const { Prisma } = require("@prisma/client");
const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const bankCrypto = require("../utils/bankCrypto");
const { hashBankAccount } = require("../utils/identityHash.util");
const supplierService = require("./supplier.service");
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES } = require("../constants/auditActions");
const payoutDestinationService = require("./payoutDestination.service");
const branchSettlementService = require("./branchSettlement.service");

const ACCOUNT_TYPES = new Set(["CHEQUE", "SAVINGS", "CURRENT"]);
const VERIFICATION_STATUSES = new Set([
  "NOT_CONFIGURED",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "ACTION_REQUIRED",
  "REJECTED",
]);

function roundMoney2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function normalizeAccountType(raw) {
  const v = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (!v) return null;
  if (v === "CHECKING" || v === "CHEQUE_ACCOUNT") return "CHEQUE";
  if (!ACCOUNT_TYPES.has(v)) return null;
  return v;
}

function deriveVerificationStatus(profile) {
  if (!profile) return "NOT_CONFIGURED";
  if (profile.verificationStatus && VERIFICATION_STATUSES.has(String(profile.verificationStatus))) {
    return String(profile.verificationStatus);
  }
  if (profile.bankName && profile.accountHolder) return "PENDING_VERIFICATION";
  return "NOT_CONFIGURED";
}

function toBranchPublicProfileRow(row, verificationStatus) {
  if (!row || row.isActive === false) return null;
  const gatewaySettlementProfile = {
    status: row.gatewayProfileStatus || null,
    provider: row.gatewayProvider || null,
    recipientConfigured: Boolean(row.gatewayRecipientId),
  };
  return {
    id: row.id,
    branchId: row.branchId,
    bankName: row.bankName,
    accountHolder: row.accountHolder,
    accountType: row.accountType || undefined,
    accountNumberMasked: bankCrypto.maskAccountNumber(row.accountNumber),
    branchCodeMasked: bankCrypto.maskBranchCode(row.branchCode),
    verificationStatus: verificationStatus || deriveVerificationStatus(row),
    gatewaySettlementProfile,
    isActive: row.isActive !== false,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

async function logBranchPayoutAudit(action, branchId, profile, actorUserId, meta = {}) {
  await logAudit(action, {
    actorUserId,
    entityType: ENTITY_TYPES.BRANCH,
    entityId: String(branchId),
    meta: {
      verificationStatus: profile?.verificationStatus || null,
      accountMasked: profile ? bankCrypto.maskAccountNumber(profile.accountNumber) : null,
      ...meta,
    },
  });
}

function buildBranchBankPayload(existing, body) {
  const bankName = String(body?.bankName || "").trim();
  const accountHolder = String(body?.accountHolder || "").trim();
  if (bankName.length < 2) throw new AppError("bankName is required", 400);
  if (accountHolder.length < 2) throw new AppError("accountHolder is required", 400);

  const accountTypeIn = normalizeAccountType(body?.accountType);
  if (!existing && !accountTypeIn) {
    throw new AppError("accountType is required (CHEQUE, SAVINGS, or CURRENT)", 400);
  }
  if (body?.accountType != null && String(body.accountType).trim() !== "" && !accountTypeIn) {
    throw new AppError("accountType must be CHEQUE, SAVINGS, or CURRENT", 400);
  }

  const accIn = String(body?.accountNumber ?? "").trim();
  const branchIn = String(body?.branchCode ?? "").trim();

  let accountEnc;
  let branchEnc;
  if (existing) {
    accountEnc = accIn.length >= 4 ? bankCrypto.encryptField(accIn) : existing.accountNumber;
    branchEnc = branchIn.length >= 2 ? bankCrypto.encryptField(branchIn) : existing.branchCode;
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
  const accountType = accountTypeIn || existing?.accountType || null;

  return {
    bankName,
    accountHolder,
    accountEnc,
    branchEnc,
    accountType,
    bankHash,
    incomingPlain: {
      bankName,
      accountHolder,
      accountNumber: plainAccount,
      branchCode: plainBranch,
      accountType,
    },
  };
}

async function branchProfileResponse(branchId, profile, verificationStatus) {
  const removeMeta = await payoutDestinationService.canDeactivatePayoutProfile({
    scope: "branch",
    entityId: branchId,
  });
  return {
    profile: toBranchPublicProfileRow(profile, verificationStatus),
    verificationStatus,
    gatewaySettlementSupported: branchSettlementService.gatewaySettlementSupported(),
    bankProfileComplete: Boolean(profile?.bankName && profile?.accountHolder && profile?.isActive !== false),
    canRemove: removeMeta.canRemove,
    removeBlockedReason: removeMeta.removeBlockedReason,
  };
}

async function resolveBranchPortalActor(reqUser) {
  return supplierService.resolveInventoryActor(reqUser);
}

async function requireBranchAccess(actor, branchId) {
  return supplierService.assertBranchInventoryAccess(actor, branchId);
}

async function requireBranchManager(reqUser, branchId) {
  if (reqUser.role !== "BRANCH_STAFF") return;
  const bu = await prisma.branchUser.findUnique({
    where: { id: String(reqUser.userId) },
    select: { role: true, branchId: true },
  });
  if (!bu || String(bu.branchId) !== String(branchId)) {
    throw new AppError("Forbidden", 403);
  }
  if (String(bu.role) !== "MANAGER") {
    throw new AppError("Only branch managers can update bank details", 403);
  }
}

function parseDateBound(value, endOfDay) {
  const s = String(value || "").trim();
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function getBranchBalance(reqUser, branchId) {
  const actor = await resolveBranchPortalActor(reqUser);
  const br = await requireBranchAccess(actor, branchId);
  const summary = await branchSettlementService.aggregateBranchSettlementSummary(
    br.id,
    actor.supplierOrgId
  );
  return summary;
}

async function getWithdrawalProfile(reqUser, branchId) {
  const actor = await resolveBranchPortalActor(reqUser);
  await requireBranchAccess(actor, branchId);
  const profile = await prisma.branchWithdrawalProfile.findUnique({
    where: { branchId: String(branchId) },
  });
  if (!profile || profile.isActive === false) {
    return {
      profile: null,
      verificationStatus: "NOT_CONFIGURED",
      gatewaySettlementSupported: branchSettlementService.gatewaySettlementSupported(),
      bankProfileComplete: false,
      canRemove: false,
    };
  }
  const verificationStatus = deriveVerificationStatus(profile);
  return branchProfileResponse(branchId, profile, verificationStatus);
}

async function persistBranchWithdrawalProfile(reqUser, branchId, body, { mode = "upsert" } = {}) {
  const actor = await resolveBranchPortalActor(reqUser);
  await requireBranchAccess(actor, branchId);
  await requireBranchManager(reqUser, branchId);

  const existing = await prisma.branchWithdrawalProfile.findUnique({
    where: { branchId: String(branchId) },
  });

  if (mode === "replace") {
    if (!body?.confirmReplace) {
      throw new AppError("confirmReplace: true is required to replace bank details", 400);
    }
    if (!existing || existing.isActive === false) {
      throw new AppError("No bank profile to replace", 404);
    }
    const accIn = String(body?.accountNumber ?? "").trim();
    const branchIn = String(body?.branchCode ?? "").trim();
    if (accIn.length < 4) throw new AppError("accountNumber is required for replace", 400);
    if (branchIn.length < 2) throw new AppError("branchCode is required for replace", 400);
  }

  const payload = buildBranchBankPayload(existing, body);
  const materialChange = payoutDestinationService.detectMaterialBankChange(existing, payload.incomingPlain);

  if (existing && mode === "upsert" && !materialChange) {
    return branchProfileResponse(branchId, existing, deriveVerificationStatus(existing));
  }

  if (existing && materialChange && existing.gatewayRecipientId) {
    await payoutDestinationService.deactivatePayoutDestination({
      scope: "branch",
      entityId: branchId,
      profile: existing,
    }).catch(() => {});
  }

  const profile = await prisma.branchWithdrawalProfile.upsert({
    where: { branchId: String(branchId) },
    create: {
      id: randomUUID(),
      branchId: String(branchId),
      bankName: payload.bankName,
      accountHolder: payload.accountHolder,
      accountNumber: payload.accountEnc,
      branchCode: payload.branchEnc,
      accountType: payload.accountType,
      verificationStatus: "PENDING_VERIFICATION",
      bankAccountHash: payload.bankHash,
      isActive: true,
      deactivatedAt: null,
    },
    update: {
      bankName: payload.bankName,
      accountHolder: payload.accountHolder,
      accountNumber: payload.accountEnc,
      branchCode: payload.branchEnc,
      ...(payload.accountType ? { accountType: payload.accountType } : {}),
      verificationStatus: "PENDING_VERIFICATION",
      bankAccountHash: payload.bankHash,
      isActive: true,
      deactivatedAt: null,
      ...(materialChange
        ? {
            gatewayRecipientId: null,
            gatewayProfileStatus: null,
            gatewayProfilePayload: null,
          }
        : {}),
    },
  });

  const registration = await branchSettlementService.registerBranchPayoutProfile(branchId);
  const verificationStatus = registration.verificationStatus || deriveVerificationStatus(profile);

  const auditAction =
    mode === "replace"
      ? AUDIT_ACTIONS.PAYOUT_PROFILE_REPLACED
      : existing
        ? AUDIT_ACTIONS.PAYOUT_PROFILE_UPDATED
        : AUDIT_ACTIONS.PAYOUT_PROFILE_CREATED;
  await logBranchPayoutAudit(auditAction, branchId, profile, reqUser.userId, { mode, materialChange });
  await logBranchPayoutAudit(AUDIT_ACTIONS.PAYOUT_VERIFICATION_REQUESTED, branchId, profile, reqUser.userId);

  return branchProfileResponse(branchId, profile, verificationStatus);
}

async function upsertWithdrawalProfile(reqUser, branchId, body) {
  return persistBranchWithdrawalProfile(reqUser, branchId, body, { mode: "upsert" });
}

async function replaceWithdrawalProfile(reqUser, branchId, body) {
  return persistBranchWithdrawalProfile(reqUser, branchId, body, { mode: "replace" });
}

async function deactivateWithdrawalProfile(reqUser, branchId) {
  const actor = await resolveBranchPortalActor(reqUser);
  await requireBranchAccess(actor, branchId);
  await requireBranchManager(reqUser, branchId);

  const profile = await prisma.branchWithdrawalProfile.findUnique({
    where: { branchId: String(branchId) },
  });
  if (!profile || profile.isActive === false) {
    throw new AppError("No active bank profile to remove", 404);
  }

  const removeMeta = await payoutDestinationService.canDeactivatePayoutProfile({
    scope: "branch",
    entityId: branchId,
  });
  if (!removeMeta.canRemove) {
    throw new AppError(removeMeta.removeBlockedReason || "Cannot remove bank profile", 409);
  }

  await payoutDestinationService.deactivatePayoutDestination({
    scope: "branch",
    entityId: branchId,
    profile,
  });

  await logBranchPayoutAudit(AUDIT_ACTIONS.PAYOUT_PROFILE_DEACTIVATED, branchId, profile, reqUser.userId);

  return {
    profile: null,
    verificationStatus: "NOT_CONFIGURED",
    gatewaySettlementSupported: branchSettlementService.gatewaySettlementSupported(),
    bankProfileComplete: false,
    canRemove: false,
  };
}

async function requestWithdrawal(reqUser, branchId) {
  throw new AppError(
    "Manual branch withdrawals are not supported. Configure bank details for automatic settlement when available.",
    410
  );
}

async function listBranchWithdrawals(reqUser, branchId, { from, to } = {}) {
  const actor = await resolveBranchPortalActor(reqUser);
  await requireBranchAccess(actor, branchId);
  return branchSettlementService.listBranchSettlementHistory(branchId, { from, to });
}

async function listSupplierOrgBranchWithdrawals(supplierOrgId, { from, to, branchId } = {}) {
  return branchSettlementService.listSupplierSettlementHistory(supplierOrgId, { from, to, branchId });
}

async function listSupplierOrgBranchWithdrawalsForPortal(reqUser, query = {}) {
  const actor = await resolveBranchPortalActor(reqUser);
  if (actor.role !== "SUPPLIER") {
    throw new AppError("Forbidden", 403);
  }
  return listSupplierOrgBranchWithdrawals(actor.supplierOrgId, query);
}

/** @deprecated use aggregateSupplierSettlementSummary */
async function computeSupplierAvailableWithdrawalsSummary(supplierOrgId, query = {}) {
  const summary = await branchSettlementService.aggregateSupplierSettlementSummary(supplierOrgId, query);
  return {
    totalAvailable: summary.totalPendingSettlement,
    byBranchId: Object.fromEntries(
      Object.entries(summary.byBranchId || {}).map(([id, v]) => [id, v.pendingSettlement])
    ),
    totalPendingSettlement: summary.totalPendingSettlement,
    totalSettled: summary.totalSettled,
    gatewaySettlementSupported: summary.gatewaySettlementSupported,
  };
}

module.exports = {
  getBranchBalance,
  getWithdrawalProfile,
  upsertWithdrawalProfile,
  replaceWithdrawalProfile,
  deactivateWithdrawalProfile,
  requestWithdrawal,
  listBranchWithdrawals,
  computeSupplierAvailableWithdrawalsSummary,
  listSupplierOrgBranchWithdrawals,
  listSupplierOrgBranchWithdrawalsForPortal,
};
