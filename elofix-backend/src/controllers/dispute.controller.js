const jobDisputeService = require("../services/jobDispute.service");

async function listDisputes(req, res) {
  const result = await jobDisputeService.listDisputesForActor(
    req.user.userId,
    req.user.role,
    { status: req.query.status, requestedResolution: req.query.requestedResolution }
  );
  res.json({ success: true, ...result });
}

async function getDispute(req, res) {
  const dispute = await jobDisputeService.getDisputeById(req.params.id, req.user.userId, req.user.role);
  res.json({ success: true, dispute });
}

async function openJobDispute(req, res) {
  const dispute = await jobDisputeService.openDispute(req.params.id, req.user.userId, req.body || {});
  res.json({ success: true, dispute });
}

async function addMessage(req, res) {
  const dispute = await jobDisputeService.addDisputeMessage(
    req.params.id,
    req.user.userId,
    req.user.role,
    req.body?.body,
    req.body?.attachments
  );
  res.json({ success: true, dispute });
}

async function addProviderEvidence(req, res) {
  const dispute = await jobDisputeService.addProviderEvidence(req.params.id, req.user.userId, req.body || {});
  res.json({ success: true, dispute });
}

async function addEvidence(req, res) {
  const dispute = await jobDisputeService.addDisputeEvidence(
    req.params.id,
    req.user.userId,
    req.user.role,
    req.body || {}
  );
  res.json({ success: true, dispute });
}

async function getProviderDisputeStats(req, res) {
  const stats = await jobDisputeService.getProviderDisputeStats(req.user.userId);
  res.json({ success: true, stats });
}

module.exports = {
  listDisputes,
  getDispute,
  openJobDispute,
  addMessage,
  addProviderEvidence,
  addEvidence,
  getProviderDisputeStats,
};
