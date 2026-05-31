const AppError = require("../utils/AppError");
const providerService = require("../services/provider.service");
const providerReviewService = require("../services/providerReview.service");

async function resolveTargetProviderUserId(req) {
  const resolved = await providerService.resolveProviderUserIdFromRouteParam(req.params.id);
  if (!resolved) {
    throw new AppError("Provider not found", 404);
  }
  if (req.user.role !== "ADMIN" && resolved !== req.user.userId) {
    throw new AppError("Forbidden", 403);
  }
  return resolved;
}

async function listProviders(req, res) {
  const providers = await providerService.listProviders({
    category: req.query.category,
    forAdmin: false,
    nearCity: req.query.city || req.query.nearCity,
  });
  res.json({ success: true, providers });
}

async function getProvider(req, res) {
  const provider = await providerService.getPublicProviderById(req.params.id);
  res.json({ success: true, provider });
}

async function listProviderReviews(req, res) {
  const result = await providerReviewService.listProviderReviews(req.params.id, {
    limit: req.query.limit,
    offset: req.query.offset,
  });
  res.json({ success: true, ...result });
}

async function updateProviderScoped(req, res) {
  const userId = await resolveTargetProviderUserId(req);
  const provider = await providerService.updateProviderForUser(userId, req.body || {});
  res.json({ success: true, provider });
}

async function uploadDocumentScoped(req, res) {
  const userId = await resolveTargetProviderUserId(req);
  if (!req.file) {
    throw new AppError("File is required", 400);
  }
  const docType = String(req.params.docType || "").trim();
  const provider = await providerService.saveDocumentFromUpload(userId, docType, req.file);
  res.json({ success: true, provider });
}

async function uploadAvatarScoped(req, res) {
  const userId = await resolveTargetProviderUserId(req);
  if (!req.file) {
    throw new AppError("File is required", 400);
  }
  const provider = await providerService.saveAvatarFromUpload(userId, req.file);
  res.json({ success: true, provider });
}

async function uploadWorkPostImageScoped(req, res) {
  const userId = await resolveTargetProviderUserId(req);
  if (!req.file) {
    throw new AppError("File is required", 400);
  }
  const result = await providerService.publicUrlFromUploadedFile(userId, req.file);
  res.json({ success: true, url: result.url });
}

module.exports = {
  listProviders,
  getProvider,
  listProviderReviews,
  updateProviderScoped,
  uploadDocumentScoped,
  uploadAvatarScoped,
  uploadWorkPostImageScoped,
};
