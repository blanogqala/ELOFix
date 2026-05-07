const branchService = require("../services/branch.service");

async function listNearby(req, res) {
  const branches = await branchService.listBranchesForLocation(req.query || {});
  res.json({ success: true, branches });
}

module.exports = {
  listNearby,
};
