const { roundMoney } = require("./jobPaidAmount.util");
const { enrichJob, normalizeMeta } = require("../services/jobMeta.service");
const { isDeadOrRefundedForRemaining } = require("./providerEarningsSummary.util");

function sumJobFinancials(jobs) {
  let totalEarnings = 0;
  let releasedByPlatform = 0;
  let remainingInEscrow = 0;

  for (const job of jobs) {
    const e = enrichJob(job, normalizeMeta(job.meta));
    const providerAmount = Number(e.providerAmount);
    const releasedAmount = Number(e.releasedAmount);
    const remainingAmount = Number(e.remainingAmount);
    const refundDetails = e.refundDetails || {};
    const escrow = Number(refundDetails.escrowApplied) || 0;
    const clawback = Number(refundDetails.clawbackApplied) || 0;
    const debt = Number(refundDetails.providerDebtAdded) || 0;
    const netLaborRefunded =
      Number(refundDetails.cumulativeCustomerNet) ||
      Number(refundDetails.customerNet) ||
      escrow + clawback + debt;
    const deadForRemaining = isDeadOrRefundedForRemaining({
      workflowStatus: e.status,
      status: e.status,
      refundStatus: e.refundStatus,
      refundAmount: e.refundAmount,
      refundDetails,
      clawbackFromReleased: clawback,
    });

    if (Number.isFinite(providerAmount) && providerAmount >= 0) {
      totalEarnings += Math.max(0, providerAmount - netLaborRefunded);
    }
    if (Number.isFinite(releasedAmount) && releasedAmount >= 0) {
      releasedByPlatform += Math.max(0, releasedAmount - clawback - debt);
    }
    if (deadForRemaining) {
      continue;
    }
    if (Number.isFinite(remainingAmount) && remainingAmount >= 0) {
      remainingInEscrow += remainingAmount;
    } else {
      const net = Number.isFinite(providerAmount) && providerAmount >= 0 ? providerAmount : 0;
      const rel = Number.isFinite(releasedAmount) && releasedAmount >= 0 ? releasedAmount : 0;
      remainingInEscrow += Math.max(0, net - rel);
    }
  }

  return {
    totalEarnings: roundMoney(totalEarnings),
    releasedByPlatform: roundMoney(releasedByPlatform),
    remainingInEscrow: roundMoney(remainingInEscrow),
  };
}

module.exports = {
  sumJobFinancials,
};
