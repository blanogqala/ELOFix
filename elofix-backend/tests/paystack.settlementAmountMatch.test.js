/**
 * Pure settlement-amount fallback matcher. No Paystack live calls.
 * Run: node tests/paystack.settlementAmountMatch.test.js
 */
const assert = require("assert");
const match = require("../src/services/payments/paystack.settlementAmountMatch");
const { splitCommission, computeExpectedBankSettlement, toCents } = require("../src/services/payments/money.util");

function row(id, netCents, paidAt) {
  return { intent: { id }, netCents, paidAt: new Date(paidAt) };
}

{
  assert.strictEqual(match.integerSubunits(4368), 4368);
  assert.strictEqual(match.integerSubunits("4368"), 4368);
  assert.strictEqual(match.integerSubunits(43.68), null);
  assert.strictEqual(match.integerSubunits(-1), null);
  const fields = match.settlementFinancialFields({
    effective_amount: 4368,
    total_amount: 5000,
    total_fees: 282,
    total_processed: 4650,
  });
  assert.strictEqual(fields.effectiveAmount, 4368);
  assert.strictEqual(match.settlementMatchAmountSubunits({ effective_amount: 4368, total_amount: 5000 }), 4368);
  assert.strictEqual(match.settlementMatchAmountSubunits({ total_amount: 4368 }), 4368);
}

{
  const split = splitCommission(50);
  assert.strictEqual(toCents(split.commissionAmount), 350);
  assert.strictEqual(toCents(split.recipientAmount), 4650);
  const net = computeExpectedBankSettlement(46.5, 2.82);
  assert.strictEqual(toCents(net.expectedBankSettlementAmount), 4368);
  assert.strictEqual(
    match.recipientNetCents({
      expectedBankSettlementAmount: 43.68,
      recipientAmount: 46.5,
      processorFeeAmount: 2.82,
    }),
    4368
  );
  assert.strictEqual(
    match.recipientNetCents({
      expectedBankSettlementAmount: null,
      recipientAmount: 46.5,
      processorFeeAmount: 2.82,
    }),
    4368
  );
  assert.strictEqual(
    match.recipientNetCents({
      expectedBankSettlementAmount: null,
      recipientAmount: 46.5,
      processorFeeAmount: null,
    }),
    null
  );
  assert.strictEqual(
    match.recipientNetCents({
      kind: "JOB_STORE_ORDER",
      expectedBankSettlementAmount: null,
      recipientAmount: 0,
      processorFeeAmount: 2.82,
      materialOrder: { supplierEarning: 46.5 },
    }),
    4368
  );
  assert.strictEqual(
    match.recipientNetCents({
      kind: "JOB_STORE_ORDER",
      expectedBankSettlementAmount: null,
      recipientAmount: 0,
      processorFeeAmount: 2.82,
      materialOrder: { supplierEarning: 0 },
    }),
    null
  );
}

{
  const single = match.evaluateSettlementAmountMatch(
    [row("a", 4368, "2026-09-10T10:00:00.000Z"), row("b", 9300, "2026-09-11T10:00:00.000Z")],
    4368
  );
  assert.strictEqual(single.matchingStrategy, "settlement_amount_single");
  assert.deepStrictEqual(single.matchedIntents.map((r) => r.intent.id), ["a"]);
}

{
  const batch = match.evaluateSettlementAmountMatch(
    [row("a", 4368, "2026-09-10T10:00:00.000Z"), row("b", 9300, "2026-09-11T10:00:00.000Z")],
    13668
  );
  assert.strictEqual(batch.matchingStrategy, "settlement_amount_batch");
  assert.deepStrictEqual(batch.matchedIntents.map((r) => r.intent.id), ["a", "b"]);
}

{
  const mismatch = match.evaluateSettlementAmountMatch(
    [row("a", 4368, "2026-09-10T10:00:00.000Z"), row("b", 9300, "2026-09-11T10:00:00.000Z")],
    10000
  );
  assert.strictEqual(mismatch.matchingStrategy, "none");
  assert.strictEqual(mismatch.matchedIntents.length, 0);
}

{
  const tied = match.evaluateSettlementAmountMatch(
    [row("a", 4368, "2026-09-10T10:00:00.000Z"), row("b", 4368, "2026-09-10T10:00:00.000Z")],
    4368
  );
  assert.strictEqual(tied.ambiguous, true);
}

{
  const chronological = match.evaluateSettlementAmountMatch(
    [row("a", 4368, "2026-09-10T10:00:00.000Z"), row("b", 4368, "2026-09-11T10:00:00.000Z")],
    4368
  );
  assert.strictEqual(chronological.matchingStrategy, "settlement_amount_single");
  assert.deepStrictEqual(chronological.matchedIntents.map((r) => r.intent.id), ["a"]);
}

{
  const conflict = match.evaluateSettlementAmountMatch(
    [
      row("a", 4368, "2026-09-10T10:00:00.000Z"),
      row("b", 9300, "2026-09-11T10:00:00.000Z"),
      row("c", 13668, "2026-09-12T10:00:00.000Z"),
    ],
    13668
  );
  assert.strictEqual(conflict.ambiguous, true);
}

{
  const sorted = match.sortSettlementsOldestFirst([
    { id: "new", settlement_date: "2026-09-16" },
    { id: "old", settlement_date: "2026-09-15" },
  ]);
  assert.deepStrictEqual(sorted.map((r) => r.id), ["old", "new"]);
}

{
  assert.strictEqual(match.paidAtNotAfterSettlement("2026-09-10", "2026-09-15"), true);
  assert.strictEqual(match.paidAtNotAfterSettlement("2026-09-16", "2026-09-15"), false);
  assert.strictEqual(match.paidAtNotAfterSettlement("2026-09-15T23:00:00.000Z", "2026-09-15T00:00:00.000Z"), true);
}

console.log("paystack.settlementAmountMatch.test.js: all passed");
