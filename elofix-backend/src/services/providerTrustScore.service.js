const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const { getTrustLevel, isHighRisk } = require("../utils/trustLevel.util");

const SCORE_MIN = 0;
const SCORE_MAX = 100;

const DELTAS = {
  DUPLICATE_REGISTRATION: -25,
  REFUND_REQUEST: -10,
  FULL_REFUND: -25,
  DISPUTE_LOST: -15,
  FRAUD_ALERT: -20,
  SUSPICIOUS_LOGIN: -10,
  FAKE_DOCUMENTATION: -50,
  VERIFIED_ID: 10,
  VERIFIED_COMPANY: 10,
  VERIFIED_BANK: 10,
  JOB_COMPLETED: 2,
  FIVE_STAR_REVIEW: 3,
  MONTH_NO_COMPLAINTS: 5,
  COMPLETED_RATING_4: 2,
};

const APPLIED_ONCE_REASONS = new Set([
  "verified_id",
  "verified_company",
  "verified_bank",
]);

async function getOrCreateTrustScore(providerProfileId) {
  const pid = String(providerProfileId || "").trim();
  if (!pid) return null;
  let row = await prisma.providerTrustScore.findUnique({ where: { providerId: pid } });
  if (!row) {
    row = await prisma.providerTrustScore.create({
      data: { id: randomUUID(), providerId: pid, score: 100, history: [] },
    });
  }
  return row;
}

function clampScore(n) {
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(n)));
}

function hasAppliedOnce(history, reason) {
  return Array.isArray(history) && history.some((e) => e.reason === reason);
}

async function applyDelta(providerProfileId, reason, delta, metadata = {}) {
  const pid = String(providerProfileId || "").trim();
  if (!pid || !Number.isFinite(delta) || delta === 0) return null;

  const row = await getOrCreateTrustScore(pid);
  if (APPLIED_ONCE_REASONS.has(reason) && hasAppliedOnce(row.history, reason)) {
    return row;
  }

  const prev = row.score;
  const next = clampScore(prev + delta);
  const entry = {
    id: randomUUID(),
    reason: String(reason),
    delta,
    scoreBefore: prev,
    scoreAfter: next,
    at: new Date().toISOString(),
    ...metadata,
  };
  const history = Array.isArray(row.history) ? [...row.history, entry] : [entry];
  const updates = {
    score: next,
    lastCalculatedAt: new Date(),
    history,
  };

  if (reason === "dispute_lost") updates.disputeCount = { increment: 1 };
  if (reason === "full_refund" || reason === "partial_refund" || reason === "refund_request") {
    updates.refundCount = { increment: 1 };
  }
  if (reason === "job_completed") updates.completedJobs = { increment: 1 };
  if (reason === "positive_review" || reason === "five_star_review") {
    updates.positiveReviews = { increment: 1 };
  }

  return prisma.providerTrustScore.update({
    where: { providerId: pid },
    data: updates,
  });
}

async function onDuplicateRegistration(providerProfileId) {
  return applyDelta(providerProfileId, "duplicate_registration", DELTAS.DUPLICATE_REGISTRATION);
}

async function onFraudAlert(providerProfileId) {
  return applyDelta(providerProfileId, "fraud_alert", DELTAS.FRAUD_ALERT);
}

async function onFakeDocumentation(providerProfileId) {
  return applyDelta(providerProfileId, "fake_documentation", DELTAS.FAKE_DOCUMENTATION);
}

async function onSuspiciousLogin(providerProfileId) {
  return applyDelta(providerProfileId, "suspicious_login", DELTAS.SUSPICIOUS_LOGIN);
}

async function onVerifiedId(providerProfileId) {
  return applyDelta(providerProfileId, "verified_id", DELTAS.VERIFIED_ID);
}

async function onVerifiedCompany(providerProfileId) {
  return applyDelta(providerProfileId, "verified_company", DELTAS.VERIFIED_COMPANY);
}

async function onVerifiedBank(providerProfileId) {
  return applyDelta(providerProfileId, "verified_bank", DELTAS.VERIFIED_BANK);
}

async function onMonthWithoutComplaints(providerProfileId) {
  return applyDelta(providerProfileId, "month_no_complaints", DELTAS.MONTH_NO_COMPLAINTS);
}

async function onDisputeLost(providerProfileId) {
  return applyDelta(providerProfileId, "dispute_lost", DELTAS.DISPUTE_LOST);
}

async function onRefundResolved(providerProfileId, kind) {
  const delta = kind === "FULL_REFUND" ? DELTAS.FULL_REFUND : DELTAS.REFUND_REQUEST;
  const reason = kind === "FULL_REFUND" ? "full_refund" : "refund_request";
  return applyDelta(providerProfileId, reason, delta);
}

async function onJobCompleted(providerProfileId, rating) {
  const r = Number(rating);
  let delta = DELTAS.JOB_COMPLETED;
  if (r >= 5) delta += DELTAS.FIVE_STAR_REVIEW - DELTAS.JOB_COMPLETED;

  const pid = String(providerProfileId || "").trim();
  if (!pid) return null;
  const row = await getOrCreateTrustScore(pid);
  const prev = row.score;
  const next = clampScore(prev + delta);
  const entry = {
    id: randomUUID(),
    reason: "job_completed",
    delta,
    scoreBefore: prev,
    scoreAfter: next,
    at: new Date().toISOString(),
    rating: r || null,
  };
  const history = Array.isArray(row.history) ? [...row.history, entry] : [entry];
  const data = {
    score: next,
    completedJobs: { increment: 1 },
    lastCalculatedAt: new Date(),
    history,
  };
  if (r >= 4) data.positiveReviews = { increment: 1 };
  return prisma.providerTrustScore.update({
    where: { providerId: pid },
    data,
  });
}

function buildRecommendations(scoreRow, provider) {
  const recs = [];
  const docs = provider?.documents && typeof provider.documents === "object" ? provider.documents : {};

  if (docs.idDoc?.status !== "approved") {
    recs.push("Complete ID verification to improve your trust score.");
  }
  if (docs.companyReg?.status !== "approved") {
    recs.push("Verify your company registration documents.");
  }
  if (!provider?.bankVerifiedAt && !provider?.withdrawalProfile) {
    recs.push("Add and verify your bank account for payouts.");
  }
  if ((scoreRow?.disputeCount || 0) > 0) {
    recs.push("Resolve open disputes to restore customer confidence.");
  }
  if ((scoreRow?.refundCount || 0) > 0) {
    recs.push("Minimize refund requests by delivering quality service.");
  }
  if ((scoreRow?.score ?? 100) < 75) {
    recs.push("Complete more successful jobs and earn 5-star reviews.");
  }
  if (provider?.fraudReviewStatus === "PENDING_REVIEW") {
    recs.push("Your account is under fraud review. Contact support if needed.");
  }
  return recs;
}

async function getTrustScoreForProviderProfile(providerProfileId, providerExtra = null) {
  const row = await getOrCreateTrustScore(providerProfileId);
  if (!row) return null;

  let provider = providerExtra;
  if (!provider) {
    provider = await prisma.provider.findUnique({
      where: { id: providerProfileId },
      select: {
        documents: true,
        bankVerifiedAt: true,
        fraudReviewStatus: true,
        withdrawalProfile: { select: { id: true } },
      },
    });
  }

  const level = getTrustLevel(row.score);
  return {
    score: row.score,
    trustLevel: level,
    disputeCount: row.disputeCount,
    refundCount: row.refundCount,
    completedJobs: row.completedJobs,
    positiveReviews: row.positiveReviews,
    lastCalculatedAt: row.lastCalculatedAt.toISOString(),
    recommendations: buildRecommendations(row, provider),
    isHighRisk: isHighRisk(row.score),
  };
}

async function getTrustScoreByUserId(providerUserId) {
  const p = await prisma.provider.findUnique({
    where: { userId: String(providerUserId) },
    select: {
      id: true,
      documents: true,
      bankVerifiedAt: true,
      fraudReviewStatus: true,
      withdrawalProfile: { select: { id: true } },
    },
  });
  if (!p) return null;
  return getTrustScoreForProviderProfile(p.id, p);
}

async function getPublicTrustSummary(providerProfileId) {
  const row = await getOrCreateTrustScore(providerProfileId);
  if (!row) return null;
  const level = getTrustLevel(row.score);
  return {
    trustScore: row.score,
    trustLevel: level,
    completedJobs: row.completedJobs,
    positiveReviews: row.positiveReviews,
  };
}

module.exports = {
  getOrCreateTrustScore,
  getTrustScoreForProviderProfile,
  getTrustScoreByUserId,
  getPublicTrustSummary,
  onDuplicateRegistration,
  onFraudAlert,
  onFakeDocumentation,
  onSuspiciousLogin,
  onVerifiedId,
  onVerifiedCompany,
  onVerifiedBank,
  onMonthWithoutComplaints,
  onDisputeLost,
  onRefundResolved,
  onJobCompleted,
  buildRecommendations,
  isHighRisk,
  DELTAS,
};
