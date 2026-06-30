const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { ACCOUNT_STATUS, INACTIVE_STATUSES } = require("../constants/accountStatus");

const BLOCKED_ACTION_MESSAGE = "Your profile is blocked. View your profile for details.";

/**
 * Derive logical account status from persisted User / Provider rows.
 * DB mapping (no separate status column today):
 * - DELETED: User.deletedAt or Provider.deletedAt
 * - SUSPENDED: User.blocked
 * - BANNED: Provider.blocked (provider accounts)
 */
function resolveAccountStatus(user, provider = null) {
  if (!user) return null;
  if (user.deletedAt) return ACCOUNT_STATUS.DELETED;
  if (provider?.deletedAt) return ACCOUNT_STATUS.DELETED;
  if (user.blocked) return ACCOUNT_STATUS.SUSPENDED;
  if (provider?.blocked) return ACCOUNT_STATUS.BANNED;
  return ACCOUNT_STATUS.ACTIVE;
}

function messageForInactiveStatus(status) {
  switch (status) {
    case ACCOUNT_STATUS.DELETED:
      return "This account has been removed";
    case ACCOUNT_STATUS.SUSPENDED:
      return "This account has been suspended. Contact support.";
    case ACCOUNT_STATUS.BANNED:
      return "This account has been banned. Contact support.";
    case ACCOUNT_STATUS.DEACTIVATED:
      return "This account has been deactivated. Contact support.";
    default:
      return "Forbidden";
  }
}

function assertStatusActive(status) {
  if (!status || status === ACCOUNT_STATUS.ACTIVE) return;
  if (INACTIVE_STATUSES.has(status)) {
    throw new AppError(messageForInactiveStatus(status), 403);
  }
  throw new AppError("Forbidden", 403);
}

/** Only deny access for soft-deleted accounts (login + middleware). */
function assertAccountNotDeleted(status) {
  if (!status || status !== ACCOUNT_STATUS.DELETED) return;
  throw new AppError(messageForInactiveStatus(ACCOUNT_STATUS.DELETED), 403);
}

function assertCustomerNotBlocked(user) {
  if (!user?.blocked) return;
  throw new AppError(BLOCKED_ACTION_MESSAGE, 403);
}

function assertProviderNotBlocked(provider) {
  if (!provider?.blocked) return;
  throw new AppError(BLOCKED_ACTION_MESSAGE, 403);
}

function getBlockInfo(user, provider = null) {
  const accountStatus = resolveAccountStatus(user, provider);
  const blocked =
    Boolean(user?.blocked) || Boolean(provider?.blocked);
  const blockedReason =
    provider?.blocked && provider?.blockedReason
      ? String(provider.blockedReason)
      : user?.blocked && user?.blockedReason
        ? String(user.blockedReason)
        : null;
  return { blocked, blockedReason, accountStatus };
}

async function loadAccountForActor(actor) {
  const role = String(actor?.role || "").toUpperCase();
  const id = String(actor?.userId || actor?.id || "").trim();
  if (!id) {
    throw new AppError("Authentication required", 401);
  }

  if (role === "BRANCH_STAFF") {
    const branchUser = await prisma.branchUser.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!branchUser) {
      throw new AppError("Forbidden", 403);
    }
    return { kind: "branch_staff", branchUser };
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      blocked: true,
      blockedReason: true,
      deletedAt: true,
    },
  });
  if (!user) {
    throw new AppError("Forbidden", 403);
  }

  let provider = null;
  const effectiveRole = role || String(user.role || "").toUpperCase();
  if (effectiveRole === "PROVIDER" || user.role === "PROVIDER") {
    provider = await prisma.provider.findUnique({
      where: { userId: id },
      select: { blocked: true, blockedReason: true, deletedAt: true },
    });
  }

  return { kind: "user", user, provider };
}

async function assertAuthenticatedAccountActive(actor) {
  const record = await loadAccountForActor(actor);
  if (record.kind === "branch_staff") return;
  const status = resolveAccountStatus(record.user, record.provider);
  assertAccountNotDeleted(status);
}

module.exports = {
  ACCOUNT_STATUS,
  BLOCKED_ACTION_MESSAGE,
  resolveAccountStatus,
  messageForInactiveStatus,
  assertStatusActive,
  assertAccountNotDeleted,
  assertCustomerNotBlocked,
  assertProviderNotBlocked,
  getBlockInfo,
  loadAccountForActor,
  assertAuthenticatedAccountActive,
};
