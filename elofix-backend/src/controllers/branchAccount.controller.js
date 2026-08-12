const branchAccountService = require("../services/branchAccount.service");

async function getBalance(req, res) {
  const data = await branchAccountService.getBranchBalance(req.user, req.params.branchId);
  res.json({ success: true, ...data });
}

async function getWithdrawalProfile(req, res) {
  const data = await branchAccountService.getWithdrawalProfile(req.user, req.params.branchId);
  res.json({ success: true, ...data });
}

async function putWithdrawalProfile(req, res) {
  const data = await branchAccountService.upsertWithdrawalProfile(
    req.user,
    req.params.branchId,
    req.body || {}
  );
  res.json({ success: true, ...data });
}

async function putWithdrawalProfileReplace(req, res) {
  const data = await branchAccountService.replaceWithdrawalProfile(
    req.user,
    req.params.branchId,
    req.body || {}
  );
  res.json({ success: true, ...data });
}

async function deleteWithdrawalProfile(req, res) {
  const data = await branchAccountService.deactivateWithdrawalProfile(req.user, req.params.branchId);
  res.json({ success: true, ...data });
}

async function postWithdraw(req, res) {
  const data = await branchAccountService.requestWithdrawal(
    req.user,
    req.params.branchId,
    req.body || {},
    req.financialIdempotencyKey,
    req.financialRequestHash,
    req.financialIdempotencyRoute
  );
  res.status(201).json({ success: true, ...data });
}

async function getWithdrawals(req, res) {
  const data = await branchAccountService.listBranchWithdrawals(req.user, req.params.branchId, {
    from: req.query.from,
    to: req.query.to,
  });
  res.json({ success: true, ...data });
}

async function getOrgBranchWithdrawals(req, res) {
  const data = await branchAccountService.listSupplierOrgBranchWithdrawalsForPortal(req.user, {
    from: req.query.from,
    to: req.query.to,
    branchId: req.query.branchId,
  });
  res.json({ success: true, ...data });
}

module.exports = {
  getBalance,
  getWithdrawalProfile,
  putWithdrawalProfile,
  putWithdrawalProfileReplace,
  deleteWithdrawalProfile,
  postWithdraw,
  getWithdrawals,
  getOrgBranchWithdrawals,
};
