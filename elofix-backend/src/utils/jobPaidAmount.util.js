const jobMeta = require("../services/jobMeta.service");

function roundMoney(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Paid material batches from job meta. */
function paidMaterialAmountFromMeta(meta) {
  if (!meta || typeof meta !== "object") return 0;
  let sum = 0;
  const mps = Array.isArray(meta.materialPayments) ? meta.materialPayments : [];
  mps.forEach((p) => {
    if (p && p.status === "paid" && p.amount != null) {
      sum += Number(p.amount) || 0;
    }
  });
  return sum;
}

/**
 * Paid labor from job meta + row.
 * Courier delivery fees are stored on servicePrice / Job columns (not servicePayment) when paid via DeliveryRequest.
 */
function paidLaborAmountFromMeta(meta, jobRow = null) {
  const safe = meta && typeof meta === "object" ? meta : {};
  const sp = safe.servicePayment;
  if (sp && sp.status === "paid" && sp.amount != null) {
    return Number(sp.amount) || 0;
  }
  const laborPaid = Boolean(jobRow?.laborPaid) || Boolean(safe.laborPaid);
  if (!laborPaid) return 0;
  if (safe.servicePrice?.amount != null) {
    const amt = Number(safe.servicePrice.amount);
    if (Number.isFinite(amt) && amt > 0) return amt;
  }
  if (jobRow?.totalPrice != null) {
    const amt = Number(jobRow.totalPrice);
    if (Number.isFinite(amt) && amt > 0) return amt;
  }
  if (jobRow?.price != null) {
    const amt = Number(jobRow.price);
    if (Number.isFinite(amt) && amt > 0) return amt;
  }
  return 0;
}

/** Total customer-paid amount for one job (labor + materials). */
function paidAmountFromJob(jobRow) {
  const meta = jobMeta.normalizeMeta(jobRow?.meta);
  return roundMoney(paidLaborAmountFromMeta(meta, jobRow) + paidMaterialAmountFromMeta(meta));
}

/** Best-effort paidAt for labor revenue bucketing (analytics). */
function laborPaidAtFromJob(jobRow) {
  const meta = jobMeta.normalizeMeta(jobRow?.meta);
  const sp = meta.servicePayment;
  if (sp && sp.status === "paid" && sp.paidAt) {
    return sp.paidAt;
  }
  const laborPaid = Boolean(jobRow?.laborPaid) || Boolean(meta.laborPaid);
  if (!laborPaid || paidLaborAmountFromMeta(meta, jobRow) <= 0) return null;
  if (meta.servicePrice?.submittedAt) return meta.servicePrice.submittedAt;
  if (jobRow?.createdAt) return new Date(jobRow.createdAt).toISOString();
  return null;
}

function dayKey(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Revenue = paid labor + paid material batches, bucketed by paidAt date (UTC day).
 * @param {object[]} jobRows - Job rows with meta + financial columns
 * @param {string[]} dayKeys - YYYY-MM-DD keys in range
 */
function aggregateRevenueFromJobs(jobRows, dayKeys) {
  const laborByDay = Object.fromEntries(dayKeys.map((k) => [k, 0]));
  const materialByDay = Object.fromEntries(dayKeys.map((k) => [k, 0]));

  (Array.isArray(jobRows) ? jobRows : []).forEach((jobRow) => {
    const meta = jobMeta.normalizeMeta(jobRow?.meta);
    const laborAmt = paidLaborAmountFromMeta(meta, jobRow);
    if (laborAmt > 0) {
      const paidAt = laborPaidAtFromJob(jobRow);
      if (paidAt) {
        const k = dayKey(new Date(paidAt));
        if (laborByDay[k] !== undefined) {
          laborByDay[k] += laborAmt;
        }
      }
    }
    const mps = Array.isArray(meta.materialPayments) ? meta.materialPayments : [];
    mps.forEach((p) => {
      if (p && p.status === "paid" && p.paidAt != null && p.amount != null) {
        const k = dayKey(new Date(p.paidAt));
        if (materialByDay[k] !== undefined) {
          materialByDay[k] += Number(p.amount) || 0;
        }
      }
    });
  });

  return dayKeys.map((date) => ({
    date,
    amount: roundMoney(laborByDay[date] + materialByDay[date]),
  }));
}

module.exports = {
  roundMoney,
  paidMaterialAmountFromMeta,
  paidLaborAmountFromMeta,
  paidAmountFromJob,
  laborPaidAtFromJob,
  aggregateRevenueFromJobs,
};
