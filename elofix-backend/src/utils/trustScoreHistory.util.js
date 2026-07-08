const SCORE_MIN = 0;
const SCORE_MAX = 100;

const APPLIED_ONCE_REASONS = new Set([
  "verified_id",
  "verified_company",
  "verified_bank",
]);

const REASON_LABELS = {
  duplicate_registration: "Duplicate registration detected",
  fraud_alert: "Fraud alert",
  fake_documentation: "Fake or duplicate documentation detected",
  suspicious_login: "Suspicious login detected",
  full_refund: "Full refund issued",
  partial_refund: "Partial refund issued",
  refund_request: "Partial refund issued",
  dispute_lost: "Dispute lost",
  job_completed: "Job completed successfully",
  verified_id: "ID verification approved",
  verified_company: "Company registration verified",
  verified_bank: "Bank account verified",
  month_no_complaints: "Month without complaints",
  positive_review: "Positive customer review",
  five_star_review: "Five-star review",
};

const DOUBLE_PENALTY_PAIR_REASONS = new Set(["duplicate_registration", "fake_documentation"]);

function clampScore(n) {
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(n)));
}

function reasonToLabel(reason) {
  const key = String(reason || "").trim();
  if (REASON_LABELS[key]) return REASON_LABELS[key];
  return key.replace(/_/g, " ");
}

function sanitizeHistoryForProvider(history, limit = 15) {
  const entries = Array.isArray(history) ? history : [];
  return [...entries]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit)
    .map((e) => ({
      reason: String(e.reason || ""),
      label: reasonToLabel(e.reason),
      delta: Number(e.delta) || 0,
      scoreAfter: Number(e.scoreAfter) ?? 0,
      at: String(e.at || ""),
    }));
}

function stripDoublePenaltyEntries(history) {
  if (!Array.isArray(history) || history.length === 0) return [];

  const toRemove = new Set();
  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    if (entry?.reason !== "fraud_alert") continue;

    const at = new Date(entry.at).getTime();
    if (!Number.isFinite(at)) continue;

    for (let j = 0; j < history.length; j++) {
      if (i === j) continue;
      const other = history[j];
      if (!DOUBLE_PENALTY_PAIR_REASONS.has(other?.reason)) continue;
      const otherAt = new Date(other.at).getTime();
      if (Number.isFinite(otherAt) && Math.abs(at - otherAt) <= 1000) {
        toRemove.add(i);
        break;
      }
    }
  }

  return history.filter((_, i) => !toRemove.has(i));
}

function recomputeTrustMetricsFromHistory(history) {
  const sorted = [...(Array.isArray(history) ? history : [])].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
  const appliedOnce = new Set();
  let score = 100;
  let disputeCount = 0;
  let refundCount = 0;
  let completedJobs = 0;
  let positiveReviews = 0;

  for (const entry of sorted) {
    const reason = String(entry?.reason || "");
    const delta = Number(entry?.delta) || 0;
    if (!reason || delta === 0) continue;
    if (APPLIED_ONCE_REASONS.has(reason) && appliedOnce.has(reason)) continue;

    score = clampScore(score + delta);
    if (APPLIED_ONCE_REASONS.has(reason)) appliedOnce.add(reason);

    if (reason === "dispute_lost") disputeCount += 1;
    if (reason === "full_refund" || reason === "partial_refund" || reason === "refund_request") {
      refundCount += 1;
    }
    if (entry.disputeResolution) disputeCount += 1;
    if (reason === "job_completed") completedJobs += 1;
    if (reason === "positive_review" || reason === "five_star_review") positiveReviews += 1;
    if (reason === "job_completed" && Number(entry.rating) >= 4) positiveReviews += 1;
  }

  return { score, disputeCount, refundCount, completedJobs, positiveReviews };
}

function rebuildHistoryScoreChain(history) {
  const sorted = [...(Array.isArray(history) ? history : [])].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
  const appliedOnce = new Set();
  let score = 100;
  const rebuilt = [];

  for (const entry of sorted) {
    const reason = String(entry?.reason || "");
    const delta = Number(entry?.delta) || 0;
    if (!reason || delta === 0) continue;
    if (APPLIED_ONCE_REASONS.has(reason) && appliedOnce.has(reason)) continue;

    const scoreBefore = score;
    score = clampScore(score + delta);
    if (APPLIED_ONCE_REASONS.has(reason)) appliedOnce.add(reason);

    rebuilt.push({
      ...entry,
      scoreBefore,
      scoreAfter: score,
    });
  }

  return rebuilt;
}

module.exports = {
  REASON_LABELS,
  reasonToLabel,
  sanitizeHistoryForProvider,
  stripDoublePenaltyEntries,
  recomputeTrustMetricsFromHistory,
  rebuildHistoryScoreChain,
};
