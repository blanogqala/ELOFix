/**
 * Provider earnings card totals: net clawback/debt; remaining on live jobs only.
 * Run: node tests/providerEarningsSummary.util.test.js
 */
require("dotenv").config();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}
const assert = require("assert");
const {
  isDeadOrRefundedForRemaining,
  netProviderShareRecorded,
  remainingShareForSummary,
  sumProviderShareTotals,
} = require("../src/utils/providerEarningsSummary.util");

function testCancelledClawbackNetsToZero() {
  const cancelled = {
    workflowStatus: "CANCELLED",
    providerShareRecorded: 372,
    providerShareRemaining: 372,
    clawbackFromReleased: 372,
    refundStatus: "processed",
    refundAmount: 372,
  };
  assert.strictEqual(isDeadOrRefundedForRemaining(cancelled), true);
  assert.strictEqual(netProviderShareRecorded(cancelled), 0);
  assert.strictEqual(remainingShareForSummary(cancelled), 0);
}

function testLiveJobKeepsRecordedAndRemaining() {
  const live = {
    workflowStatus: "IN_PROGRESS",
    providerShareRecorded: 558,
    providerShareRemaining: 558,
    clawbackFromReleased: 0,
  };
  assert.strictEqual(isDeadOrRefundedForRemaining(live), false);
  assert.strictEqual(netProviderShareRecorded(live), 558);
  assert.strictEqual(remainingShareForSummary(live), 558);
}

function testSummaryExcludesCancelledFromCards() {
  const totals = sumProviderShareTotals([
    {
      workflowStatus: "CANCELLED",
      providerShareRecorded: 372,
      providerShareRemaining: 372,
      clawbackFromReleased: 372,
      refundStatus: "processed",
    },
    {
      workflowStatus: "IN_PROGRESS",
      providerShareRecorded: 558,
      providerShareRemaining: 558,
      clawbackFromReleased: 0,
    },
    {
      workflowStatus: "COMPLETED",
      providerShareRecorded: 325.5,
      providerShareRemaining: 0,
      clawbackFromReleased: 0,
    },
  ]);
  assert.strictEqual(totals.totalProviderShareRecorded, 883.5);
  assert.strictEqual(totals.totalProviderShareRemaining, 558);
}

function testDebtReducesRecorded() {
  const row = {
    workflowStatus: "CANCELLED",
    providerShareRecorded: 372,
    providerShareRemaining: 0,
    clawbackFromReleased: 0,
    providerRefundDebt: 372,
    refundStatus: "recorded",
  };
  assert.strictEqual(netProviderShareRecorded(row), 0);
}

function run() {
  testCancelledClawbackNetsToZero();
  testLiveJobKeepsRecordedAndRemaining();
  testSummaryExcludesCancelledFromCards();
  testDebtReducesRecorded();
  console.log("providerEarningsSummary.util.test.js: all passed (4/4)");
}

run();
