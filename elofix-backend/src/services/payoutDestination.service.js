const bankCrypto = require("../utils/bankCrypto");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const {
  marketplaceSettlementEnabled,
  settlementCapableGateway,
} = require("./payments/paymentConfig");
const { normalizeProvider, GATEWAYS } = require("./payments/gatewayRegistry");
const {
  isPaystackSubaccountCode,
  safePaystackSubaccountCode,
  isPaystackRecipientUsableInCurrentMode,
  MARKETPLACE_SPLIT_KINDS,
} = require("./payments/paystack.payload");

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
  const mapped = mapRefreshedGatewayStatus(result.status);
  return mapped.verificationStatus || "PENDING_VERIFICATION";
}

/**
 * Central Paystack/gateway status mapping for payout-destination refresh.
 * Only an authoritative gateway VERIFIED response may promote local VERIFIED.
 */
function mapRefreshedGatewayStatus(gatewayStatus) {
  const raw = String(gatewayStatus || "").toUpperCase();
  if (raw === "VERIFIED" || raw === "SETTLED" || raw === "COMPLETE" || raw === "COMPLETED") {
    return { verificationStatus: "VERIFIED", gatewayProfileStatus: "VERIFIED" };
  }
  if (raw === "DEACTIVATED") {
    return {
      verificationStatus: null,
      gatewayProfileStatus: "DEACTIVATED",
      preserveVerification: true,
      claimVerified: false,
    };
  }
  if (raw === "FAILED" || raw === "REJECTED") {
    return { verificationStatus: "REJECTED", gatewayProfileStatus: "REJECTED" };
  }
  return { verificationStatus: "PENDING_VERIFICATION", gatewayProfileStatus: "PENDING" };
}

const SAFE_GATEWAY_PAYLOAD_KEYS = [
  "subaccount_code",
  "percentage_charge",
  "active",
  "is_verified",
  "paystackBankCode",
  "bank_code",
];
const UNSAFE_GATEWAY_PAYLOAD_KEY =
  /^(account_number|accountNumber|authorization|authorization_code|secret|secret_key)$/i;

function isPresentPayloadValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function stripUnsafeGatewayPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    if (UNSAFE_GATEWAY_PAYLOAD_KEY.test(String(key || ""))) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Merge status-lookup metadata into the stored payload.
 * Never erase existing safe fields because GET returned a smaller body.
 * Never relabel stored domain=test to domain=live (or the reverse).
 */
function mergeSafeGatewayProfilePayload(existing, incoming) {
  const prev = stripUnsafeGatewayPayload(existing);
  const next = stripUnsafeGatewayPayload(incoming);
  const merged = { ...prev };
  for (const key of SAFE_GATEWAY_PAYLOAD_KEYS) {
    if (isPresentPayloadValue(next[key])) merged[key] = next[key];
  }
  const storedDomain = String(prev.domain || "").trim().toLowerCase();
  const incomingDomain = String(next.domain || "").trim().toLowerCase();
  if (storedDomain === "test" || storedDomain === "live") {
    merged.domain = storedDomain;
  } else if (incomingDomain === "test" || incomingDomain === "live") {
    merged.domain = incomingDomain;
  }
  return merged;
}

function paystackStatusLookupAllowed(profile) {
  if (normalizeProvider(profile?.gatewayProvider) !== "PAYSTACK") {
    return { ok: true };
  }
  if (!isPaystackSubaccountCode(profile?.gatewayRecipientId)) {
    return { ok: false, message: "invalid_subaccount_code" };
  }
  if (!isPaystackRecipientUsableInCurrentMode(profile)) {
    return { ok: false, message: "paystack_recipient_not_usable_in_current_mode" };
  }
  return { ok: true };
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

function profileRecipientOwnedByGateway(profile, gw) {
  if (!profile?.gatewayRecipientId) return false;
  const stored = normalizeProvider(profile.gatewayProvider);
  const selected = normalizeProvider(gw?.name);
  return Boolean(stored && selected && stored === selected);
}

/**
 * Same-gateway Paystack updates are only safe when the stored recipient domain
 * matches the current PAYSTACK_MODE. Cross-domain ACCT_ codes must be created
 * as new subaccounts — never PUT with the other environment's secret.
 */
function shouldUpdateExistingRecipient(profile, gw) {
  if (!profileRecipientOwnedByGateway(profile, gw)) return false;
  if (normalizeProvider(gw?.name) === "PAYSTACK") {
    return isPaystackRecipientUsableInCurrentMode(profile);
  }
  return true;
}

function gatewayOwningStoredRecipient(profile) {
  if (!profile?.gatewayProvider || !profile?.gatewayRecipientId) return null;
  const key = normalizeProvider(profile.gatewayProvider);
  if (!key || !GATEWAYS[key]) return null;
  return GATEWAYS[key];
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

function isRecipientValidForGateway(gw, recipientId) {
  const id = String(recipientId || "").trim();
  if (!id) return false;
  if (normalizeProvider(gw?.name) === "PAYSTACK") {
    return isPaystackSubaccountCode(id);
  }
  return true;
}

/**
 * Never persist a foreign recipient as the new gateway's destination.
 * Same-gateway updates may reuse the existing owned recipient.
 */
function recipientIdToPersist(gw, result, profile) {
  const incoming = String(result?.recipientId || "").trim();
  if (incoming) {
    return isRecipientValidForGateway(gw, incoming) ? incoming : null;
  }
  if (shouldUpdateExistingRecipient(profile, gw) && isRecipientValidForGateway(gw, profile.gatewayRecipientId)) {
    return profile.gatewayRecipientId;
  }
  return null;
}

async function callGatewayRegister(gw, profile, scope, entityId) {
  const payload = buildDestinationPayload(profile, scope, entityId);
  if (shouldUpdateExistingRecipient(profile, gw) && typeof gw.updatePayoutDestination === "function") {
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
  if (normalizeProvider(gw?.name) === "PAYSTACK" && !isPaystackRecipientUsableInCurrentMode(profile)) {
    return {
      supported: true,
      ok: true,
      skipped: true,
      message: "cross_domain_recipient_not_deactivated",
    };
  }
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
  const persistId = recipientIdToPersist(gw, result, profile);
  const sameOwner = profileRecipientOwnedByGateway(profile, gw);

  if (!result?.supported || !persistId) {
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
    gatewayRecipientId: persistId,
    gatewayProfileStatus: result.status || "PENDING",
    gatewayProfilePayload: result.data || null,
    isActive: true,
    deactivatedAt: null,
  });

  return {
    verificationStatus,
    gatewaySettlementSupported: true,
    recipientId: persistId,
    sameOwner,
  };
}

async function deactivatePayoutDestination({ scope, entityId, profile: profileIn }) {
  if (!SCOPES.has(scope)) throw new AppError("Invalid payout scope", 400);
  const profile = profileIn || (await loadProfile(scope, entityId));
  if (!profile) return { deactivated: false };

  const gw = gatewayOwningStoredRecipient(profile);
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
    const unresolvedPaystackPayouts = provider
      ? await prisma.paymentIntent.count({
          where: {
            recipientUserId: provider.userId,
            state: "PAID",
            provider: "PAYSTACK",
            kind: { in: [...MARKETPLACE_SPLIT_KINDS] },
            payoutSettlementStatus: { in: ["PENDING", "PROCESSING", "FAILED"] },
          },
        })
      : 0;
    if (unresolvedPaystackPayouts > 0) {
      return {
        canRemove: false,
        removeBlockedReason: "Bank details cannot be changed while a Paystack payout is still processing.",
      };
    }

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

/**
 * Paystack split-at-charge bookkeeping. Does not require bank verification.
 * Fail-closed on recipient ownership or persisted split contradiction.
 */
async function assertPaystackSplitBookkeepingReady({ scope, entityId, intent }) {
  if (!SCOPES.has(scope)) throw new AppError("Invalid payout scope", 400);
  if (normalizeProvider(intent?.provider) !== "PAYSTACK") {
    return { ready: false, reason: "not_paystack_intent" };
  }
  const profile = await loadProfile(scope, entityId);
  if (!profile || profile.isActive === false) {
    return { ready: false, reason: "Payout profile not configured or inactive" };
  }
  if (normalizeProvider(profile.gatewayProvider) !== "PAYSTACK") {
    return { ready: false, reason: "Paystack recipient ownership required" };
  }
  if (!isPaystackSubaccountCode(profile.gatewayRecipientId)) {
    return { ready: false, reason: "Paystack recipient is not configured" };
  }
  if (!isPaystackRecipientUsableInCurrentMode(profile)) {
    return { ready: false, reason: "Paystack recipient domain does not match PAYSTACK_MODE" };
  }
  const payload =
    intent?.gatewayPayload && typeof intent.gatewayPayload === "object" && !Array.isArray(intent.gatewayPayload)
      ? intent.gatewayPayload
      : {};
  const evidenceCode = safePaystackSubaccountCode(payload.subaccount || payload.subaccount_code);
  if (evidenceCode && evidenceCode.toUpperCase() !== String(profile.gatewayRecipientId).toUpperCase()) {
    return { ready: false, contradiction: true, reason: "subaccount_mismatch" };
  }
  return { ready: true, profile };
}

function refreshFailureResult(profile, message) {
  return {
    verificationStatus: profile?.verificationStatus || "NOT_CONFIGURED",
    gatewayProfileStatus: profile?.gatewayProfileStatus || null,
    gatewayRecipientId: profile?.gatewayRecipientId || null,
    refreshed: false,
    queried: false,
    refreshError: message || "payout_status_lookup_failed",
    profile: profile || null,
  };
}

async function getPayoutDestinationStatus({ scope, entityId }) {
  if (!SCOPES.has(scope)) throw new AppError("Invalid payout scope", 400);
  const profile = await loadProfile(scope, entityId);
  if (!profile?.gatewayRecipientId) return { supported: false, status: null, queried: false };
  const gw = gatewayOwningStoredRecipient(profile);
  if (!gw || typeof gw.getPayoutDestinationStatus !== "function") {
    return { supported: false, status: null, message: "owning_gateway_unavailable", queried: false };
  }
  const allowed = paystackStatusLookupAllowed(profile);
  if (!allowed.ok) {
    return { supported: false, status: null, message: allowed.message, queried: false };
  }
  const result = await gw.getPayoutDestinationStatus(profile.gatewayRecipientId);
  return { ...result, queried: true };
}

/**
 * Server-authoritative payout destination status reconciliation.
 * GET-only for Paystack. Never creates or updates a subaccount.
 */
async function refreshPayoutDestinationStatus({ scope, entityId }) {
  if (!SCOPES.has(scope)) throw new AppError("Invalid payout scope", 400);
  const profile = await loadProfile(scope, entityId);
  if (!profile || profile.isActive === false) {
    return refreshFailureResult(profile, profile ? "profile_inactive" : "profile_missing");
  }
  if (!profile.gatewayRecipientId) {
    return refreshFailureResult(profile, "missing_recipient");
  }
  const gw = gatewayOwningStoredRecipient(profile);
  if (!gw || typeof gw.getPayoutDestinationStatus !== "function") {
    return refreshFailureResult(profile, "owning_gateway_unavailable");
  }
  const allowed = paystackStatusLookupAllowed(profile);
  if (!allowed.ok) {
    return refreshFailureResult(profile, allowed.message);
  }

  let result;
  try {
    result = await gw.getPayoutDestinationStatus(profile.gatewayRecipientId);
  } catch (err) {
    return {
      ...refreshFailureResult(profile, err.message || "payout_status_lookup_failed"),
      queried: true,
    };
  }

  if (!result?.supported || !result.status) {
    return {
      ...refreshFailureResult(profile, result?.message || "payout_status_lookup_failed"),
      queried: true,
    };
  }

  const mapped = mapRefreshedGatewayStatus(result.status);
  let verificationStatus = mapped.verificationStatus;
  if (mapped.preserveVerification) {
    verificationStatus =
      String(profile.verificationStatus) === "VERIFIED"
        ? "PENDING_VERIFICATION"
        : profile.verificationStatus || "PENDING_VERIFICATION";
  }
  const gatewayProfileStatus = mapped.gatewayProfileStatus;
  const mergedPayload = mergeSafeGatewayProfilePayload(profile.gatewayProfilePayload, result.data);
  const unchanged =
    String(profile.verificationStatus) === String(verificationStatus) &&
    String(profile.gatewayProfileStatus || "") === String(gatewayProfileStatus || "") &&
    JSON.stringify(profile.gatewayProfilePayload || null) === JSON.stringify(mergedPayload || null);

  const updated = unchanged
    ? profile
    : await updateProfile(scope, entityId, {
        verificationStatus,
        gatewayProfileStatus,
        gatewayProfilePayload: mergedPayload,
      });

  return {
    verificationStatus,
    gatewayProfileStatus,
    gatewayRecipientId: profile.gatewayRecipientId,
    refreshed: true,
    queried: true,
    unchanged: Boolean(unchanged),
    profile: updated,
  };
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
  profileRecipientOwnedByGateway,
  shouldUpdateExistingRecipient,
  gatewayOwningStoredRecipient,
  registerPayoutDestination,
  deactivatePayoutDestination,
  getPayoutDestinationStatus,
  refreshPayoutDestinationStatus,
  mapRefreshedGatewayStatus,
  mergeSafeGatewayProfilePayload,
  paystackStatusLookupAllowed,
  canDeactivatePayoutProfile,
  assertSettlementDestinationReady,
  assertPaystackSplitBookkeepingReady,
  recipientIdToPersist,
  toMaskedAdminProfile,
  listPendingVerificationProfiles,
};
