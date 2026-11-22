/**
 * A labor checkout can be captured after the job is already cancelled:
 * the customer pays, then cancels while the intent is still pending,
 * and the gateway webhook arrives later.
 * That capture must be refunded. It must not mark the job paid or
 * replace the cancelled status.
 *
 * A job that was already paid (including a customer forfeit or a
 * dispute refund) is not this case — laborPaid stays true there.
 */

function metaObject(meta) {
  return meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
}

function laborPaymentWasApplied(job, meta) {
  if (!job) return false;
  return Boolean(job.laborPaid) || Boolean(metaObject(meta).laborPaid);
}

function jobMarkedCancelled(job, meta) {
  if (!job) return false;
  if (String(job.status || "").toUpperCase() === "CANCELLED") return true;
  return String(metaObject(meta).statusOverride || "").toUpperCase() === "CANCELLED";
}

/**
 * True when this labor capture has not been applied and the job is cancelled.
 * @param {object|null|undefined} job
 * @param {object|object[]|null|undefined} metas job.meta and/or a fresh meta read
 */
function unpaidCancelledLaborJob(job, metas) {
  if (!job) return false;
  const list = (Array.isArray(metas) ? metas : [metas]).map(metaObject);
  if (laborPaymentWasApplied(job, null)) return false;
  if (list.some((meta) => Boolean(meta.laborPaid))) return false;
  if (String(job.status || "").toUpperCase() === "CANCELLED") return true;
  return list.some((meta) => jobMarkedCancelled(job, meta));
}

/** Gateway refund outcomes that mean this capture will not be settled again. */
function capturedRefundRetrySucceeded(result) {
  if (!result || typeof result !== "object") return false;
  if (result.ok || result.pending) return true;
  const msg = String(result.message || "");
  return /no_paid_intent|nothing_left_to_refund/i.test(msg);
}

module.exports = {
  laborPaymentWasApplied,
  jobMarkedCancelled,
  unpaidCancelledLaborJob,
  capturedRefundRetrySucceeded,
};
