const RETURN_PROCESSING_FROM = ["PENDING", "PROCESSING"];

/**
 * Only a still-open checkout may be marked PROCESSING from the browser return poll.
 * A Paystack webhook can commit PAID, FAILED, or CANCELLED between the poll's read
 * and its write. An unconditional update by id puts a settled charge back to PROCESSING,
 * so the success page never observes PAID and settlement matching that requires PAID skips it.
 */
function returnProcessingClaimWhere(intentId) {
  return {
    id: String(intentId || "").trim(),
    state: { in: RETURN_PROCESSING_FROM },
  };
}

async function claimReturnProcessing(db, intentId) {
  return db.paymentIntent.updateMany({
    where: returnProcessingClaimWhere(intentId),
    data: { state: "PROCESSING" },
  });
}

module.exports = {
  RETURN_PROCESSING_FROM,
  returnProcessingClaimWhere,
  claimReturnProcessing,
};
