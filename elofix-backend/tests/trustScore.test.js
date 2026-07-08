/**
 * Trust score unit tests (no DB).
 * Run: node tests/trustScore.test.js
 */
const assert = require("assert");
const {
  reasonToLabel,
  sanitizeHistoryForProvider,
  stripDoublePenaltyEntries,
  recomputeTrustMetricsFromHistory,
  rebuildHistoryScoreChain,
} = require("../src/utils/trustScoreHistory.util");

function testReasonToLabel() {
  assert.strictEqual(reasonToLabel("duplicate_registration"), "Duplicate registration detected");
  assert.strictEqual(reasonToLabel("full_refund"), "Full refund issued");
  assert.strictEqual(reasonToLabel("unknown_reason"), "unknown reason");
}

function testSanitizeHistoryForProvider() {
  const history = [
    {
      reason: "duplicate_registration",
      delta: -25,
      scoreAfter: 75,
      at: "2026-01-01T10:00:00.000Z",
      scoreBefore: 100,
      internal: true,
    },
    {
      reason: "job_completed",
      delta: 2,
      scoreAfter: 77,
      at: "2026-01-02T10:00:00.000Z",
    },
  ];
  const sanitized = sanitizeHistoryForProvider(history, 15);
  assert.strictEqual(sanitized.length, 2);
  assert.strictEqual(sanitized[0].reason, "job_completed");
  assert.strictEqual(sanitized[0].label, "Job completed successfully");
  assert.strictEqual(sanitized[0].delta, 2);
  assert.strictEqual(sanitized[0].scoreAfter, 77);
  assert.strictEqual(sanitized[0].internal, undefined);
}

function testStripDoublePenaltyEntries() {
  const at = "2026-06-01T12:00:00.000Z";
  const history = [
    { reason: "fraud_alert", delta: -20, at },
    { reason: "duplicate_registration", delta: -25, at },
    { reason: "fraud_alert", delta: -20, at: "2026-06-01T12:00:00.500Z" },
    { reason: "fake_documentation", delta: -50, at: "2026-06-01T12:00:00.500Z" },
    { reason: "job_completed", delta: 2, at: "2026-06-02T12:00:00.000Z" },
  ];
  const cleaned = stripDoublePenaltyEntries(history);
  assert.strictEqual(cleaned.length, 3);
  assert.ok(cleaned.every((e) => e.reason !== "fraud_alert"));
  assert.ok(cleaned.some((e) => e.reason === "duplicate_registration"));
  assert.ok(cleaned.some((e) => e.reason === "fake_documentation"));
  assert.ok(cleaned.some((e) => e.reason === "job_completed"));
}

function testRecomputeTrustMetricsFromHistory() {
  const at = "2026-06-01T12:00:00.000Z";
  const history = [
    { reason: "duplicate_registration", delta: -25, at },
    { reason: "full_refund", delta: -25, at: "2026-06-02T12:00:00.000Z", disputeResolution: true },
    { reason: "job_completed", delta: 2, at: "2026-06-03T12:00:00.000Z", rating: 5 },
  ];
  const metrics = recomputeTrustMetricsFromHistory(history);
  assert.strictEqual(metrics.score, 52);
  assert.strictEqual(metrics.disputeCount, 1);
  assert.strictEqual(metrics.refundCount, 1);
  assert.strictEqual(metrics.completedJobs, 1);
  assert.strictEqual(metrics.positiveReviews, 1);
}

function testRebuildHistoryScoreChain() {
  const cleaned = [
    { reason: "duplicate_registration", delta: -25, at: "2026-06-01T12:00:00.000Z" },
    { reason: "job_completed", delta: 2, at: "2026-06-02T12:00:00.000Z" },
  ];
  const rebuilt = rebuildHistoryScoreChain(cleaned);
  assert.strictEqual(rebuilt[0].scoreBefore, 100);
  assert.strictEqual(rebuilt[0].scoreAfter, 75);
  assert.strictEqual(rebuilt[1].scoreBefore, 75);
  assert.strictEqual(rebuilt[1].scoreAfter, 77);
}

testReasonToLabel();
testSanitizeHistoryForProvider();
testStripDoublePenaltyEntries();
testRecomputeTrustMetricsFromHistory();
testRebuildHistoryScoreChain();
console.log("trustScore.test.js: OK");
