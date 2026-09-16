/**
 * Paystack settlement reconcile job — immediate startup tick + 15-minute interval.
 * Does not wait on timers.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const rec = require("../src/services/payments/paystack.settlementReconcile.service");
const job = require("../src/jobs/paystackSettlementReconcile.job");

async function main() {
  assert.strictEqual(job.PAYSTACK_SETTLEMENT_RECONCILE_INTERVAL_MS, 15 * 60 * 1000);

  const orig = rec.reconcileRecentPaystackSettlements;
  let calls = 0;
  rec.reconcileRecentPaystackSettlements = async () => {
    calls += 1;
    return { skipped: false, settlements: 1, linked: 1, changed: 1 };
  };

  let intervalMs = null;
  let scheduledFn = null;
  const fakeTimer = {
    unref() {},
  };

  try {
    const stop = job.startPaystackSettlementReconcileJob({
      setInterval: (fn, ms) => {
        scheduledFn = fn;
        intervalMs = ms;
        return fakeTimer;
      },
      clearInterval: () => {},
    });

    assert.strictEqual(calls, 1, "reconcile must run immediately on startup");
    assert.strictEqual(intervalMs, job.PAYSTACK_SETTLEMENT_RECONCILE_INTERVAL_MS);
    assert.strictEqual(typeof scheduledFn, "function");
    stop();

    const mapped = require("../src/services/payments/payoutTransparency.util");
    assert.strictEqual(mapped.mapPaystackSettlementApiStatus("success"), "SETTLED");
    assert.strictEqual(mapped.mapPaystackSettlementApiStatus("successful"), "SETTLED");
    assert.strictEqual(mapped.mapPaystackSettlementApiStatus("processing"), "PROCESSING");
    assert.strictEqual(mapped.mapPaystackSettlementApiStatus("pending"), "PENDING");
    assert.strictEqual(mapped.mapPaystackSettlementApiStatus("failed"), "FAILED");
    assert.strictEqual(mapped.mapPaystackSettlementApiStatus("reversed"), "REVERSED");
    assert.strictEqual(mapped.mapPaystackSettlementApiStatus("paid"), null);

    console.log("paystack.settlementReconcile.job.test.js: OK");
  } finally {
    rec.reconcileRecentPaystackSettlements = orig;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
