const bankCrypto = require("../utils/bankCrypto");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const {
  marketplaceSettlementEnabled,
  settlementCapableGateway,
} = require("./payments/paymentConfig");

const SCOPES = new Set(["provider", "branch"]);
const MATERIAL_FIELDS = ["bankName", "accountHolder", "accountNumber", "branchCode", "accountType"];

function gatewaySettlementSupported() {
  return Boolean(marketplaceSettlementEnabled() && settlementCapableGateway());
}

function normalizePlain(value) {
  return String(value ?? "").trim();
}

function profilePlainFields(profile) {
  if (!profile) return null;
  return {
    bankName: normalizePlain(profile.bankName),
    accountHolder: normalizePlain(profile.accountHolder),
    accountNumber: normalizePlain(
      bankCrypto.isEncryptedStored(profile.accountNumber)
        ? bankCrypto.decryptField(profile.accountNumber)
        : profile.accountNumber
    ),
    branchCode: normalizePlain(
      bankCrypto.isEncryptedStored(profile.branchCode)
        ? bankCrypto.decryptField(profile.branchCode)
        : profile.branchCode
    ),
    accountType: normalizePlain(profile.accountType).toUpperCase() || null,
  };
}

function incomingPlainFields(incoming) {
  return {
    bankName: normalizePlain(incoming.bankName),
    accountHolder: normalizePlain(incoming.accountHolder),
    accountNumber: normalizePlain(incoming.accountNumber),
    branchCode: normalizePlain(incoming.branchCode),
    accountType: normalizePlain(incoming.accountType).toUpperCase() || null,
  };
}

/**
 * Compare bankName, holder, account, branchCode, accountType.
 */
function detectMaterialBankChange(existing, incomingPlain) {
  if (!existing) return true;
  const current = profilePlainFields(existing);
  const next = incomingPlainFields(incomingPlain);
  for (const field of MATERIAL_FIELDS) {
    const a = field === "accountType" ? current[field] || null : current[field];
    const b = field === "accountType" ? next[field] || null : next[field];
    if (a !== b) return true;
  }
  return false;
}

function mapGatewayVerificationStatus(result) {
  if (!result?.supported) return "PENDING_VERIFICATION";
  const raw = String(result.status || "").toUpperCase();
  if (raw === "VERIFIED" || raw === "SETTLED" || raw === "COMPLETE" || raw === "COMPLETED") {
    return "VERIFIED";
  }
  if (raw === "FAILED" || raw === "REJECTED") return "REJECTED";
  return "PENDING_VERIFICATION";
}

function gatewayNotConfiguredStatus() {
  return marketplaceSettlementEnabled() ? "AUTOMATIC_SETTLEMENT_UNAVAILABLE" : "GATEWAY_NOT_CONFIGURED";
}

async function loadProfile(scope, entityId) {
  if (scope === "provider") {
    return prisma.providerWithdrawalProfile.findUnique({ where: { providerId: String(entityId) } });
  }
  if (scope === "branch") {
    return prisma.branchWithdrawalProfile.findUnique({ where: { branchId: String(entityId) } });
  }
  throw new AppError("Invalid payout scope", 400);
}

async function updateProfile(scope, entityId, data) {
  if (scope === "provider") {
    return prisma.providerWithdrawalProfile.update({
      where: { providerId: String(entityId) },
      data,
    });
  }
  if (scope === "branch") {
    return prisma.branchWithdrawalProfile.update({
      where: { branchId: String(entityId) },
      data,
    });
  }
  throw new AppError("Invalid payout scope", 400);
}

function buildDestinationPayload(profile, scope, entityId) {
  const plain = profilePlainFields(profile);
  return {
    scope,
    entityId: String(entityId),
    bankName: plain.bankName,
    accountHolder: plain.accountHolder,
    accountNumber: plain.accountNumber,
    branchCode: plain.branchCode,
    accountType: plain.accountType,
    branchId: scope === "branch" ? String(entityId) : undefined,
    providerId: scope === "provider" ? String(entityId) : undefined,
  };
}

async function callGatewayRegister(gw, profile, scope, entityId) {
  const payload = buildDestinationPayload(profile, scope, entityId);
  if (profile.gatewayRecipientId && typeof gw.updatePayoutDestination === "function") {
    return gw.updatePayoutDestination(profile.gatewayRecipientId, payload);
  }
  if (typeof gw.createPayoutDestination === "function") {
    return gw.createPayoutDestination(payload);
  }
  if (scope === "branch" && typeof gw.createBranchPayoutDestination === "function") {
    return gw.createBranchPayoutDestination(payload);
  }
  return { supported: false, message: "Gateway payout destination API unavailable" };
}

async function callGatewayDeactivate(gw, profile) {
  if (!profile?.gatewayRecipientId) return { supported: true, ok: true };
  if (typeof gw.deactivatePayoutDestination === "function") {
    return gw.deactivatePayoutDestination(profile.gatewayRecipientId);
  }
  return { supported: false, message: "Gateway deactivation not supported" };
}

/**
 * Register or refresh payout destination with gateway.
 */
async function registerPayoutDestination({ scope, entityId }) {
  if (!SCOPES.has(scope)) throw new AppError("Invalid payout scope", 400);
  const profile = await loadProfile(scope, entityId);
  if (!profile || profile.isActive === false) {
    return { verificationStatus: "NOT_CONFIGURED", gatewaySettlementSupported: gatewaySettlementSupported() };
  }

  const gw = settlementCapableGateway();
  if (!gw) {
    const verificationStatus =
      profile.bankName && profile.accountHolder ? "PENDING_VERIFICATION" : "NOT_CONFIGURED";
    await updateProfile(scope, entityId, {
      verificationStatus,
      gatewayProfileStatus: gatewayNotConfiguredStatus(),
    });
    return { verificationStatus, gatewaySettlementSupported: false };
  }

  const result = await callGatewayRegister(gw, profile, scope, entityId);

  if (!result?.supported) {
    await updateProfile(scope, entityId, {
      verificationStatus: "PENDING_VERIFICATION",
      gatewayProfileStatus: result?.status || "UNSUPPORTED",
      gatewayProfilePayload: result?.data || { message: result?.message },
    });
    return { verificationStatus: "PENDING_VERIFICATION", gatewaySettlementSupported: false };
  }

  const verificationStatus = mapGatewayVerificationStatus(result);
  await updateProfile(scope, entityId, {
    verificationStatus,
    gatewayProvider: gw.name,
    gatewayRecipientId: result.recipientId || profile.gatewayRecipientId || null,
    gatewayProfileStatus: result.status || "PENDING",
    gatewayProfilePayload: result.data || null,
    isActive: true,
    deactivatedAt: null,
  });

  return {
    verificationStatus,
    gatewaySettlementSupported: true,
    recipientId: result.recipientId || profile.gatewayRecipientId,
  };
}

async function deactivatePayoutDestination({ scope, entityId, profile: profileIn }) {
  if (!SCOPES.has(scope)) throw new AppError("Invalid payout scope", 400);
  const profile = profileIn || (await loadProfile(scope, entityId));
  if (!profile) return { deactivated: false };

  const gw = settlementCapableGateway();
  if (gw && profile.gatewayRecipientId) {
    const result = await callGatewayDeactivate(gw, profile);
    if (result?.supported === false && profile.gatewayRecipientId) {
      throw new AppError(
        result.message || "Could not deactivate payout destination at payment gateway",
        409
      );
    }
  }

  await updateProfile(scope, entityId, {
    isActive: false,
    deactivatedAt: new Date(),
    gatewayProfileStatus: profile.gatewayRecipientId ? "DEACTIVATED" : profile.gatewayProfileStatus,
  });

  return { deactivated: true };
}

async function canDeactivatePayoutProfile({ scope, entityId }) {
  if (!SCOPES.has(scope)) throw new AppError("Invalid payout scope", 400);
  const profile = await loadProfile(scope, entityId);
  if (!profile || profile.isActive === false) {
    return { canRemove: false, removeBlockedReason: "No active payout profile" };
  }

  if (scope === "provider") {
    const providerAccountService = require("./providerAccount.service");
    const ledger = await providerAccountService.getLedgerSummary(String(entityId));
    if (Number(ledger.refundDebtOwed) > 0) {
      return {
        canRemove: false,
        removeBlockedReason: "Outstanding refund debt must be cleared before removing bank details",
      };
    }

    const provider = await prisma.provider.findUnique({
      where: { id: String(entityId) },
      select: { userId: true },
    });
    const pendingIntents = provider
      ? await prisma.paymentIntent.count({
          where: {
            recipientUserId: provider.userId,
            state: "PAID",
            providerPayoutStatus: "PARTIAL",
          },
        })
      : 0;
    if (pendingIntents > 0) {
      return {
        canRemove: false,
        removeBlockedReason: "Pending provider settlements must complete before removing bank details",
      };
    }

    if (
      profile.verificationStatus === "PENDING_VERIFICATION" &&
      profile.gatewayRecipientId &&
      profile.gatewayProfileStatus &&
      !["GATEWAY_NOT_CONFIGURED", "AUTOMATIC_SETTLEMENT_UNAVAILABLE", "UNSUPPORTED", "DEACTIVATED"].includes(
        String(profile.gatewayProfileStatus)
      )
    ) {
      return {
        canRemove: false,
        removeBlockedReason: "Bank verification is in progress — wait for gateway confirmation or try again later",
      };
    }
  }

  if (scope === "branch") {
    const pendingOrders = await prisma.materialOrder.count({
      where: {
        branchId: String(entityId),
        paymentStatus: "paid",
        settlementStatus: { in: ["PENDING", "PROCESSING", "FAILED"] },
      },
    });
    if (pendingOrders > 0) {
      return {
        canRemove: false,
        removeBlockedReason: "Pending or failed branch settlements must be resolved before removing bank details",
      };
    }
  }

  return { canRemove: true };
}

async function assertSettlementDestinationReady({ scope, entityId }) {
  if (!SCOPES.has(scope)) throw new AppError("Invalid payout scope", 400);
  const profile = await loadProfile(scope, entityId);

  if (!profile || profile.isActive === false) {
    return { ready: false, reason: "Payout profile not configured or inactive" };
  }
  if (String(profile.verificationStatus) !== "VERIFIED") {
    return { ready: false, reason: "Payout profile not verified for settlement" };
  }

  if (marketplaceSettlementEnabled()) {
    if (!profile.gatewayRecipientId) {
      return { ready: false, reason: "Gateway recipient not configured" };
    }
    const activeStatuses = new Set(["VERIFIED", "ACTIVE", "PENDING"]);
    const gwStatus = String(profile.gatewayProfileStatus || "").toUpperCase();
    if (gwStatus && !activeStatuses.has(gwStatus) && gwStatus !== "PENDING_VERIFICATION") {
      return { ready: false, reason: "Gateway payout profile is not active" };
    }
  }

  return { ready: true, profile };
}

function toMaskedAdminProfile(profile, scope, entityId) {
  if (!profile) return null;
  return {
    scope,
    entityId: String(entityId),
    bankName: profile.bankName,
    accountHolder: profile.accountHolder,
    accountType: profile.accountType || null,
    accountNumberMasked: bankCrypto.maskAccountNumber(profile.accountNumber),
    branchCodeMasked: bankCrypto.maskBranchCode(profile.branchCode),
    verificationStatus: profile.verificationStatus || "NOT_CONFIGURED",
    gatewaySettlementProfile: {
      status: profile.gatewayProfileStatus || null,
      provider: profile.gatewayProvider || null,
      recipientConfigured: Boolean(profile.gatewayRecipientId),
    },
    isActive: profile.isActive !== false,
    deactivatedAt:
      profile.deactivatedAt instanceof Date ? profile.deactivatedAt.toISOString() : profile.deactivatedAt || null,
    updatedAt: profile.updatedAt instanceof Date ? profile.updatedAt.toISOString() : String(profile.updatedAt),
  };
}

async function listPendingVerificationProfiles() {
  const [providers, branches] = await Promise.all([
    prisma.providerWithdrawalProfile.findMany({
      where: {
        isActive: true,
        verificationStatus: { in: ["PENDING_VERIFICATION", "ACTION_REQUIRED", "REJECTED"] },
      },
      include: { provider: { select: { id: true, businessName: true, userId: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.branchWithdrawalProfile.findMany({
      where: {
        isActive: true,
        verificationStatus: { in: ["PENDING_VERIFICATION", "ACTION_REQUIRED", "REJECTED"] },
      },
      include: { branch: { select: { id: true, name: true, supplierId: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);

  return {
    providers: providers.map((p) => ({
      ...toMaskedAdminProfile(p, "provider", p.providerId),
      businessName: p.provider?.businessName || null,
      providerUserId: p.provider?.userId || null,
    })),
    branches: branches.map((b) => ({
      ...toMaskedAdminProfile(b, "branch", b.branchId),
      branchName: b.branch?.name || null,
      supplierId: b.branch?.supplierId || null,
    })),
  };
}

module.exports = {
  SCOPES,
  gatewaySettlementSupported,
  detectMaterialBankChange,
  profilePlainFields,
  registerPayoutDestination,
  deactivatePayoutDestination,
  canDeactivatePayoutProfile,
  assertSettlementDestinationReady,
  toMaskedAdminProfile,
  listPendingVerificationProfiles,
};
