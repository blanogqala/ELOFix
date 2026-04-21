const providerService = require("../services/provider.service");
const adminAnalyticsService = require("../services/adminAnalytics.service");

async function listProviders(req, res) {
  const providers = await providerService.listProviders({
    category: req.query.category,
    forAdmin: true,
  });
  res.json({ success: true, providers });
}

async function approveProvider(req, res) {
  const provider = await providerService.approveProviderByUserId(req.params.userId);
  res.json({ success: true, provider });
}

async function rejectProvider(req, res) {
  const reason = req.body?.reason || req.body?.rejectionReason;
  const provider = await providerService.rejectProviderByUserId(req.params.userId, reason);
  res.json({ success: true, provider });
}

async function blockProvider(req, res) {
  const provider = await providerService.blockProviderByUserId(req.params.userId);
  res.json({ success: true, provider });
}

async function unblockProvider(req, res) {
  const provider = await providerService.unblockProviderByUserId(req.params.userId);
  res.json({ success: true, provider });
}

async function deleteProvider(req, res) {
  const provider = await providerService.softDeleteProviderByUserId(req.params.userId);
  res.json({ success: true, provider });
}

async function approveProviderDocument(req, res) {
  const docType = String(req.params.docType || "").trim();
  const provider = await providerService.approveProviderDocumentByUserId(req.params.userId, docType);
  res.json({ success: true, provider });
}

async function getAnalytics(req, res) {
  const data = await adminAnalyticsService.getAnalytics(req.query || {});
  res.json({ success: true, ...data });
}

async function rejectProviderDocument(req, res) {
  const docType = String(req.params.docType || "").trim();
  const feedback = req.body?.feedback ?? req.body?.reason ?? "";
  const provider = await providerService.rejectProviderDocumentByUserId(
    req.params.userId,
    docType,
    feedback
  );
  res.json({ success: true, provider });
}

module.exports = {
  listProviders,
  getAnalytics,
  approveProvider,
  rejectProvider,
  approveProviderDocument,
  rejectProviderDocument,
  blockProvider,
  unblockProvider,
  deleteProvider,
};
