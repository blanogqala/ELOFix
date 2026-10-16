/**
 * Browser return polling must not resurrect a webhook-settled payment as PROCESSING.
 * Run: node tests/returnProcessingClaim.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  claimReturnProcessing,
  returnProcessingClaimWhere,
} = require("../src/services/payments/returnProcessingClaim");

function memoryDb(initial) {
  const row = { ...initial };
  return {
    row,
    paymentIntent: {
      async updateMany({ where, data }) {
        const allowed = where?.state?.in || [];
        if (where?.id !== row.id || !allowed.includes(row.state)) {
          return { count: 0 };
        }
        row.state = data.state;
        return { count: 1 };
      },
    },
  };
}

async function testPaidChargeIsNotReopened() {
  const db = memoryDb({ id: "pi-paid", state: "PAID" });
  const result = await claimReturnProcessing(db, "pi-paid");
  assert.strictEqual(result.count, 0);
  assert.strictEqual(db.row.state, "PAID");
}

async function testFailedAndCancelledStayTerminal() {
  for (const state of ["FAILED", "CANCELLED"]) {
    const db = memoryDb({ id: "pi-term", state });
    const result = await claimReturnProcessing(db, "pi-term");
    assert.strictEqual(result.count, 0);
    assert.strictEqual(db.row.state, state);
  }
}

async function testPendingBecomesProcessing() {
  const db = memoryDb({ id: "pi-open", state: "PENDING" });
  const result = await claimReturnProcessing(db, "pi-open");
  assert.strictEqual(result.count, 1);
  assert.strictEqual(db.row.state, "PROCESSING");
  const again = await claimReturnProcessing(db, "pi-open");
  assert.strictEqual(again.count, 1);
  assert.strictEqual(db.row.state, "PROCESSING");
}

function testClaimWhereOnlyOpenStates() {
  const where = returnProcessingClaimWhere(" pi-1 ");
  assert.strictEqual(where.id, "pi-1");
  assert.deepStrictEqual(where.state.in, ["PENDING", "PROCESSING"]);
}

function testConfirmReturnUsesClaim() {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "payments", "paymentIntent.service.js"),
    "utf8"
  );
  const start = src.indexOf("async function confirmPaymentReturn");
  const end = src.indexOf("async function adminForceSettle");
  assert.ok(start >= 0 && end > start, "confirmPaymentReturn source missing");
  const fn = src.slice(start, end);
  assert.ok(fn.includes("claimReturnProcessing(prisma, intent.id)"));
  assert.ok(!fn.includes("paymentIntent.update("), "return poll must not update payment state by id");
}

async function main() {
  await testPaidChargeIsNotReopened();
  await testFailedAndCancelledStayTerminal();
  await testPendingBecomesProcessing();
  testClaimWhereOnlyOpenStates();
  testConfirmReturnUsesClaim();
  console.log("returnProcessingClaim.test.js ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
