const providerAccountService = require("../services/providerAccount.service");

async function getBalance(req, res) {
  const data = await providerAccountService.getProviderBalance(req.user.userId);
  res.json({ success: true, ...data });
}

async function getEarnings(req, res) {
  const data = await providerAccountService.getProviderEarnings(req.user.userId);
  res.json({ success: true, ...data });
}

async function getEarningJob(req, res) {
  const data = await providerAccountService.getProviderEarningJob(req.user.userId, req.params.jobId);
  res.json({ success: true, ...data });
}

async function getWithdrawalProfile(req, res) {
  const data = await providerAccountService.getWithdrawalProfile(req.user.userId);
  res.json({ success: true, ...data });
}

async function putWithdrawalProfile(req, res) {
  const data = await providerAccountService.upsertWithdrawalProfile(req.user.userId, req.body || {});
  res.json({ success: true, ...data });
}

async function getWithdrawals(req, res) {
  const data = await providerAccountService.listProviderWithdrawals(req.user.userId);
  res.json({ success: true, ...data });
}

async function postWithdraw(req, res) {
  const data = await providerAccountService.requestWithdrawal(
    req.user.userId,
    req.body || {},
    req.financialIdempotencyKey,
    req.financialRequestHash,
    req.financialIdempotencyRoute
  );
  res.status(201).json({ success: true, ...data });
}

module.exports = {
  getBalance,
  getEarnings,
  getEarningJob,
  getWithdrawalProfile,
  putWithdrawalProfile,
  getWithdrawals,
  postWithdraw,
};
