const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { normalizePhone } = require("../utils/phoneNormalization.util");
const { hashSaId, hashCompanyRegistration, hashBankAccount } = require("../utils/identityHash.util");
const { validateSaId } = require("../utils/saIdValidation.util");
const bankCrypto = require("../utils/bankCrypto");
const fraudAlert = require("./fraudAlert.service");
const providerTrustScore = require("./providerTrustScore.service");

const DUPLICATE_PHONE_MESSAGE =
  "This phone number is already associated with an EloFix account.";

async function findActiveUserByPhoneNormalized(phoneNormalized, excludeUserId = null) {
  if (!phoneNormalized) return null;
  return prisma.user.findFirst({
    where: {
      phoneNormalized,
      deletedAt: null,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true, name: true, email: true, role: true },
  });
}

async function assertPhoneAvailable(phone, excludeUserId = null, context = {}) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    if (phone != null && String(phone).trim()) {
      throw new AppError("Invalid phone number format", 400);
    }
    return null;
  }

  const existing = await findActiveUserByPhoneNormalized(normalized, excludeUserId);
  if (existing) {
    await fraudAlert.createAlert({
      alertType: "DUPLICATE_PHONE",
      description: `Duplicate phone registration attempt: ${normalized}`,
      userId: context.attemptUserId || excludeUserId || null,
      providerId: context.providerId || null,
      metadata: { phoneNormalized: normalized, existingUserId: existing.id },
      applyTrustPenalty: Boolean(context.providerId),
    });
    if (context.attemptUserId && context.attemptUserId !== existing.id) {
      await fraudAlert.createAlert({
        alertType: "FLAGGED_CUSTOMER",
        description: `User flagged for duplicate phone attempt`,
        userId: context.attemptUserId,
        metadata: { phoneNormalized: normalized },
        applyTrustPenalty: false,
      });
    }
    throw new AppError(DUPLICATE_PHONE_MESSAGE, 409);
  }
  return normalized;
}

async function findProviderBySaIdHash(saIdNumberHash, excludeProviderId = null) {
  if (!saIdNumberHash) return null;
  return prisma.provider.findFirst({
    where: {
      saIdNumberHash,
      approved: true,
      deletedAt: null,
      ...(excludeProviderId ? { id: { not: excludeProviderId } } : {}),
    },
    select: { id: true, userId: true, businessName: true },
  });
}

async function assertSaIdAvailable(saIdNumber, providerId, providerProfileId = null) {
  const digits = String(saIdNumber ?? "").replace(/\D/g, "");
  if (!digits) {
    throw new AppError("SA ID number is required", 400);
  }
  if (!validateSaId(digits)) {
    throw new AppError("Invalid South African ID number", 400);
  }

  const hash = hashSaId(digits);
  const existing = await findProviderBySaIdHash(hash, providerProfileId || providerId);
  if (existing) {
    await fraudAlert.createAlert({
      alertType: "DUPLICATE_SA_ID",
      description: `Duplicate SA ID detected for provider ${providerId}`,
      providerId: providerProfileId || providerId,
      metadata: { existingProviderId: existing.id, existingUserId: existing.userId },
    });
    await providerTrustScore.onDuplicateRegistration(providerProfileId || providerId);
    throw new AppError(
      "This ID number is already associated with a verified EloFix provider account.",
      409
    );
  }
  return { hash, encrypted: bankCrypto.encryptField(digits) };
}

async function findProviderByCompanyHash(companyHash, excludeProviderId = null) {
  if (!companyHash) return null;
  return prisma.provider.findFirst({
    where: {
      companyRegistrationHash: companyHash,
      deletedAt: null,
      ...(excludeProviderId ? { id: { not: excludeProviderId } } : {}),
    },
    select: { id: true, userId: true, businessName: true, approved: true },
  });
}

async function checkCompanyRegistration(companyRegNumber, providerProfileId) {
  const normalized = String(companyRegNumber ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-/]/g, "");
  if (!normalized) {
    throw new AppError("Company registration number is required", 400);
  }

  const hash = hashCompanyRegistration(normalized);
  const existing = await findProviderByCompanyHash(hash, providerProfileId);
  if (existing) {
    await prisma.provider.update({
      where: { id: providerProfileId },
      data: { fraudReviewStatus: "PENDING_REVIEW" },
    });
    await fraudAlert.createAlert({
      alertType: "DUPLICATE_COMPANY_REG",
      description: `Duplicate company registration: ${normalized}`,
      providerId: providerProfileId,
      metadata: { existingProviderId: existing.id, companyRegistrationNumber: normalized },
    });
    await providerTrustScore.onDuplicateRegistration(providerProfileId);
    return { duplicate: true, hash, normalized };
  }
  return { duplicate: false, hash, normalized };
}

async function checkBankAccountDuplicate(bankName, branchCode, accountNumber, providerProfileId) {
  const hash = hashBankAccount(bankName, branchCode, accountNumber);
  const existing = await prisma.providerWithdrawalProfile.findFirst({
    where: {
      bankAccountHash: hash,
      providerId: { not: providerProfileId },
    },
    include: { provider: { select: { id: true, userId: true, businessName: true } } },
  });

  if (existing) {
    await fraudAlert.createAlert({
      alertType: "DUPLICATE_BANK_ACCOUNT",
      description: `Bank account already linked to another provider`,
      providerId: providerProfileId,
      metadata: {
        existingProviderId: existing.providerId,
        existingUserId: existing.provider?.userId,
      },
    });
    await providerTrustScore.onDuplicateRegistration(providerProfileId);
    return { duplicate: true, hash };
  }
  return { duplicate: false, hash };
}

async function checkDocumentHashDuplicate(fileHash, providerProfileId) {
  if (!fileHash) return false;

  const providers = await prisma.provider.findMany({
    where: {
      id: { not: providerProfileId },
      deletedAt: null,
      documents: { not: null },
    },
    select: { id: true, documents: true, approved: true },
  });

  for (const p of providers) {
    const docs = p.documents && typeof p.documents === "object" ? p.documents : {};
    for (const key of ["idDoc", "companyReg", "proofOfAddress"]) {
      const entry = docs[key];
      if (entry?.fileHash === fileHash && entry?.status === "approved") {
        await fraudAlert.createAlert({
          alertType: "FAKE_DOCUMENTATION",
          description: `Duplicate document file hash detected (${key})`,
          providerId: providerProfileId,
          metadata: { existingProviderId: p.id, docType: key, fileHash },
        });
        await providerTrustScore.onFakeDocumentation(providerProfileId);
        return true;
      }
    }
  }
  return false;
}

async function assertProviderApprovalAllowed(profile) {
  if (profile.fraudReviewStatus === "PENDING_REVIEW") {
    throw new AppError(
      "Provider is in fraud review queue due to duplicate company registration. Clear review before approval.",
      400
    );
  }
  if (profile.fraudReviewStatus === "REJECTED") {
    throw new AppError("Provider fraud review was rejected. Cannot approve.", 400);
  }
}

module.exports = {
  DUPLICATE_PHONE_MESSAGE,
  findActiveUserByPhoneNormalized,
  assertPhoneAvailable,
  assertSaIdAvailable,
  findProviderBySaIdHash,
  checkCompanyRegistration,
  checkBankAccountDuplicate,
  checkDocumentHashDuplicate,
  assertProviderApprovalAllowed,
};
