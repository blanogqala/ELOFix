const settlementReconcile = require("../services/payments/paystack.settlementReconcile.service");

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function cronDisabled() {
  const v = String(process.env.DISABLE_PAYSTACK_SETTLEMENT_RECONCILE_CRON || "").trim().toLowerCase();
  if (process.env.NODE_ENV === "development" && (v === "1" || v === "true" || v === "yes")) return true;
  return false;
}

function logReconcileResult(result) {
  const settlements = Number(result?.settlements || 0);
  const linked = Number(result?.linked || 0);
  const changed = Number(result?.changed || 0);
  if (result?.skipped) {
    console.log(
      `[paystackSettlementReconcile] completed skipped=true reason=${result.reason || "unknown"} settlements=${settlements} linked=${linked} changed=${changed}`
    );
    return;
  }
  console.log(
    `[paystackSettlementReconcile] completed settlements=${settlements} linked=${linked} changed=${changed}`
  );
}

async function processPaystackSettlementReconcile() {
  try {
    const result = await settlementReconcile.reconcileRecentPaystackSettlements({
      source: "reconcile_job",
      notify: true,
    });
    logReconcileResult(result);
    return result;
  } catch (err) {
    console.warn("[paystackSettlementReconcile] tick failed", err?.message || err);
    return { skipped: true, reason: err?.message || "error" };
  }
}

/**
 * Starts READ/RECONCILE-only Paystack settlement sync.
 * Runs once immediately after listen, then every 15 minutes.
 * Never charges, transfers, refunds, or creates subaccounts.
 */
function startPaystackSettlementReconcileJob(deps = {}) {
  if (cronDisabled()) {
    console.log("[paystackSettlementReconcile] cron disabled");
    return () => {};
  }
  const schedule = typeof deps.setInterval === "function" ? deps.setInterval : setInterval;
  const tick = () => {
    processPaystackSettlementReconcile().catch((err) => {
      console.error("[paystackSettlementReconcile] tick error", err);
    });
  };
  tick();
  const id = schedule(tick, FIFTEEN_MINUTES_MS);
  if (id && typeof id.unref === "function") id.unref();
  return () => {
    if (typeof deps.clearInterval === "function") deps.clearInterval(id);
    else clearInterval(id);
  };
}

module.exports = {
  startPaystackSettlementReconcileJob,
  processPaystackSettlementReconcile,
  PAYSTACK_SETTLEMENT_RECONCILE_INTERVAL_MS: FIFTEEN_MINUTES_MS,
};
