const jobMeta = require("../services/jobMeta.service");

/**
 * Dedupe store material checkout rows by orderId (same as frontend material cards).
 */
function dedupeStoreOrders(storeOrders) {
  const seen = new Set();
  return (Array.isArray(storeOrders) ? storeOrders : []).filter((o) => {
    const id = String(o.orderId || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function isDeadMaterialBatch(metaOrder) {
  const r = String(metaOrder.materialBatchResolution || "");
  return r === "rejected_by_customer" || r === "cancelled_by_provider";
}

/**
 * Store orders still relevant for timeline / paid aggregate (exclude rejected or cancelled-but-not-dismissed rows).
 */
function activeStoreCheckoutOrders(meta) {
  const list = dedupeStoreOrders(meta.storeOrders).filter((o) => !isDeadMaterialBatch(o));
  return list;
}

/**
 * Aggregate: every **active** checkout batch must be materials-paid before we treat materials as fully paid.
 * No active store orders => nothing to wait on (legacy flows use other signals).
 */
function allStoreMaterialOrdersPaid(meta) {
  const list = activeStoreCheckoutOrders(meta);
  if (list.length === 0) return true;
  return list.every((o) => o.payment && o.payment.materialsPaid === true);
}

function deriveHasStartedFromMeta(safeMeta, jobRow) {
  if (safeMeta.hasStarted === true) return true;
  if (Boolean(jobRow.laborPaid) || Boolean(safeMeta.laborPaid)) return true;
  const mps = Array.isArray(safeMeta.materialPayments) ? safeMeta.materialPayments : [];
  if (mps.some((p) => String(p.status || "").toLowerCase() === "paid")) return true;
  const orders = activeStoreCheckoutOrders(safeMeta);
  if (orders.some((o) => o.payment && o.payment.materialsPaid === true)) return true;
  return false;
}

/**
 * Target progress step 0..5 (unified six-step timeline: Pending … Completed).
 * Derived index is combined with Math.max against stored progressStep — never moves backward.
 *
 * After the first service or material batch payment (hasStarted), step is at least 3 (In Progress)
 * until awaiting confirmation or completed — never back to payment step (2).
 */
function computeProgressStepFromMeta(meta, jobRow) {
  const safe = jobMeta.normalizeMeta(meta);
  const frontendStatus = safe.statusOverride || jobMeta.toFrontendStatus(jobRow.status, safe);

  if (frontendStatus === "CANCELLED" || frontendStatus === "REJECTED") {
    return 0;
  }

  if (safe.completionConfirmedByUser === true || frontendStatus === "COMPLETED") {
    return 5;
  }
  if (frontendStatus === "AWAITING_CONFIRMATION") {
    return 4;
  }
  if (frontendStatus === "DISPUTED") {
    return 4;
  }

  if (deriveHasStartedFromMeta(safe, jobRow)) {
    return 3;
  }

  if (frontendStatus === "PENDING") {
    return 0;
  }
  if (frontendStatus === "INSPECTED" || frontendStatus === "ASSIGNED") {
    return 1;
  }
  if (
    frontendStatus === "SERVICE_PRICE_SUBMITTED" ||
    frontendStatus === "SERVICE_PAID" ||
    frontendStatus === "MATERIALS_SUBMITTED" ||
    frontendStatus === "MATERIALS_PAID"
  ) {
    return 2;
  }
  return 2;
}

/**
 * Persists monotonic progress: only moves forward.
 */
function nextMonotonicProgressStep(meta, jobRow) {
  const safe = jobMeta.normalizeMeta(meta);
  const computed = computeProgressStepFromMeta(safe, jobRow);
  const prev = Number(safe.progressStep);
  const prevNorm = Number.isFinite(prev) && prev >= 0 ? prev : 0;
  return Math.max(prevNorm, computed);
}

module.exports = {
  dedupeStoreOrders,
  allStoreMaterialOrdersPaid,
  computeProgressStepFromMeta,
  nextMonotonicProgressStep,
  deriveHasStartedFromMeta,
};
