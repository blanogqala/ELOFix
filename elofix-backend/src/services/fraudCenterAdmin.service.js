const prisma = require("../config/prisma");
const { getTrustLevel } = require("../utils/trustLevel.util");
const deviceIntelligence = require("./deviceIntelligence.service");
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES } = require("../constants/auditActions");

async function getDuplicatePhones() {
  const users = await prisma.user.findMany({
    where: { phoneNormalized: { not: null }, deletedAt: null },
    select: { id: true, name: true, email: true, phone: true, phoneNormalized: true, role: true, createdAt: true },
    orderBy: { phoneNormalized: "asc" },
  });

  const groups = {};
  for (const u of users) {
    const key = u.phoneNormalized;
    if (!groups[key]) groups[key] = [];
    groups[key].push(u);
  }

  return Object.entries(groups)
    .filter(([, list]) => list.length > 1)
    .map(([phoneNormalized, accounts]) => ({ phoneNormalized, accounts, count: accounts.length }));
}

async function getDuplicateIds() {
  const rows = await prisma.provider.findMany({
    where: { saIdNumberHash: { not: null }, deletedAt: null },
    select: {
      id: true,
      userId: true,
      businessName: true,
      approved: true,
      saIdNumberHash: true,
      fraudReviewStatus: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  });

  const groups = {};
  for (const p of rows) {
    const key = p.saIdNumberHash;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  return Object.entries(groups)
    .filter(([, list]) => list.length > 1)
    .map(([hash, providers]) => ({ saIdNumberHash: hash, providers, count: providers.length }));
}

async function getDuplicateCompanies() {
  const rows = await prisma.provider.findMany({
    where: { companyRegistrationHash: { not: null }, deletedAt: null },
    select: {
      id: true,
      userId: true,
      businessName: true,
      companyRegistrationNumber: true,
      fraudReviewStatus: true,
      approved: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const groups = {};
  for (const p of rows) {
    const key = p.companyRegistrationHash;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  const duplicates = Object.entries(groups)
    .filter(([, list]) => list.length > 1)
    .map(([hash, providers]) => ({ companyRegistrationHash: hash, providers, count: providers.length }));

  const reviewQueue = rows.filter((p) => p.fraudReviewStatus === "PENDING_REVIEW");

  return { duplicates, reviewQueue };
}

async function getDuplicateBanks() {
  const rows = await prisma.providerWithdrawalProfile.findMany({
    where: { bankAccountHash: { not: null } },
    include: {
      provider: {
        select: {
          id: true,
          userId: true,
          businessName: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  const groups = {};
  for (const r of rows) {
    const key = r.bankAccountHash;
    if (!groups[key]) groups[key] = [];
    groups[key].push({
      providerId: r.providerId,
      bankName: r.bankName,
      accountHolder: r.accountHolder,
      provider: r.provider,
    });
  }

  return Object.entries(groups)
    .filter(([, list]) => list.length > 1)
    .map(([hash, accounts]) => ({ bankAccountHash: hash, accounts, count: accounts.length }));
}

async function getHighRiskProviders() {
  const rows = await prisma.providerTrustScore.findMany({
    where: { score: { lt: 40 } },
    orderBy: { score: "asc" },
    include: {
      provider: {
        select: {
          id: true,
          userId: true,
          businessName: true,
          approved: true,
          blocked: true,
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
      },
    },
  });

  return rows.map((r) => ({
    providerId: r.providerId,
    userId: r.provider.userId,
    score: r.score,
    trustLevel: getTrustLevel(r.score),
    disputeCount: r.disputeCount,
    refundCount: r.refundCount,
    completedJobs: r.completedJobs,
    provider: r.provider,
  }));
}

async function getFlaggedCustomers() {
  const alerts = await prisma.fraudAlert.findMany({
    where: {
      alertType: { in: ["FLAGGED_CUSTOMER", "DUPLICATE_PHONE"] },
      status: { in: ["OPEN", "UNDER_REVIEW"] },
      userId: { not: null },
    },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, role: true, blocked: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const byUser = {};
  for (const a of alerts) {
    if (!a.userId) continue;
    if (!byUser[a.userId]) {
      byUser[a.userId] = { user: a.user, alerts: [] };
    }
    byUser[a.userId].alerts.push(a);
  }
  return Object.values(byUser);
}

async function updateProviderFraudReview(userId, { status, adminId }) {
  const profile = await prisma.provider.findUnique({ where: { userId: String(userId) } });
  if (!profile) throw new Error("Provider not found");

  const valid = ["CLEARED", "REJECTED"];
  const next = String(status || "").toUpperCase();
  if (!valid.includes(next)) throw new Error("Invalid fraud review status");

  const updated = await prisma.provider.update({
    where: { id: profile.id },
    data: { fraudReviewStatus: next },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  await logAudit(AUDIT_ACTIONS.ADMIN_FRAUD_REVIEWED, {
    userId: adminId || null,
    actorType: "ADMIN",
    entityType: ENTITY_TYPES.PROVIDER,
    entityId: profile.id,
    oldValue: { fraudReviewStatus: profile.fraudReviewStatus },
    newValue: { fraudReviewStatus: next },
  });

  return updated;
}

module.exports = {
  getDuplicatePhones,
  getDuplicateIds,
  getDuplicateCompanies,
  getDuplicateBanks,
  getHighRiskProviders,
  getFlaggedCustomers,
  listSuspiciousDevices: deviceIntelligence.listSuspiciousDevices,
  getDeviceDetail: deviceIntelligence.getDeviceDetail,
  updateProviderFraudReview,
};
