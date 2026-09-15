const { reconcileRecentPaystackSettlements } = require("../services/payments/paystack.settlementReconcile.service");

const ONE_HOUR_MS = 60 * 60 * 1000;

function cronDisabled() {
  const v = String(process.env.DISABLE_PAYSTACK_SETTLEMENT_RECONCILE_CRON || "").trim().toLowerCase();
  if (process.env.NODE_ENV === "development" && (v === "1" || v === "true" || v === "yes")) return true;
  return false;
}

async function processPaystackSettlementReconcile() {
  try {
    return await reconcileRecentPaystackSettlements({ source: "reconcile_job", notify: true });
  } catch (err) {
    console.warn("[paystackSettlementReconcile] tick failed", err?.message || err);
    return { skipped: true, reason: err?.message || "error" };
  }
}

function startPaystackSettlementReconcileJob() {
  if (cronDisabled()) {
    console.log("[paystackSettlementReconcile] cron disabled");
    return () => {};
  }
  const tick = () => {
    processPaystackSettlementReconcile().catch((err) => {
      console.error("[paystackSettlementReconcile] tick error", err);
    });
  };
  const id = setInterval(tick, ONE_HOUR_MS);
  if (typeof id.unref === "function") id.unref();
  return () => clearInterval(id);
}

module.exports = {
  startPaystackSettlementReconcileJob,
  processPaystackSettlementReconcile,
};
