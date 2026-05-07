const branchService = require("../services/branch.service");
const branchUserService = require("../services/branchUser.service");

async function listBranches(req, res) {
  const branches = await branchService.listBranchesForSupplierUser(req.user.userId);
  res.json({ success: true, branches });
}

async function createBranch(req, res) {
  const branch = await branchService.createBranchForSupplierUser(req.user.userId, req.body || {});
  res.status(201).json({ success: true, branch });
}

async function getBranch(req, res) {
  const branch = await branchService.getBranchForSupplierUser(req.user.userId, req.params.branchId);
  res.json({ success: true, branch });
}

async function deleteBranch(req, res) {
  await branchService.deleteBranchForSupplierUser(req.user.userId, req.params.branchId);
  res.json({ success: true });
}

async function patchBranch(req, res) {
  const branch = await branchService.updateBranchForSupplierUser(
    req.user.userId,
    req.params.branchId,
    req.body || {}
  );
  res.json({ success: true, branch });
}

async function listBranchUsers(req, res) {
  const users = await branchUserService.listBranchUsers(req.user.userId, req.params.branchId);
  res.json({ success: true, users });
}

async function createBranchUser(req, res) {
  const user = await branchUserService.createBranchUser(req.user.userId, req.params.branchId, req.body || {});
  res.status(201).json({ success: true, user });
}

async function patchBranchUser(req, res) {
  const user = await branchUserService.updateBranchUserForSupplier(
    req.user.userId,
    req.params.branchId,
    req.params.branchUserId,
    req.body || {}
  );
  res.json({ success: true, user });
}

async function deleteBranchUser(req, res) {
  await branchUserService.deleteBranchUserForSupplier(
    req.user.userId,
    req.params.branchId,
    req.params.branchUserId
  );
  res.json({ success: true });
}

module.exports = {
  listBranches,
  getBranch,
  createBranch,
  patchBranch,
  deleteBranch,
  listBranchUsers,
  createBranchUser,
  patchBranchUser,
  deleteBranchUser,
};
