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
  const customerLocation = {
    metro: req.query.metro,
    city: req.query.city,
    area: req.query.area,
    suburb: req.query.suburb,
  };
  const providers = await providerService.listProviders({
    category: req.query.category,
    forAdmin: false,
    nearCity: req.query.city || req.query.nearCity,
    customerLocation,
    customerLat: req.query.lat,
    customerLng: req.query.lng,
  });
  res.json({ success: true, providers });
}

async function getProvider(req, res) {
  const provider = await providerService.getProviderById(req.params.id);
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

async function listCompletedProjects(req, res) {
  const userId = await providerService.resolveProviderUserIdFromRouteParam(req.params.id);
  if (!userId) throw new AppError("Provider not found", 404);
  const jobCompletionEvidence = require("../services/jobCompletionEvidence.service");
  const projects = await jobCompletionEvidence.listVerifiedByProviderUserId(userId, req.query.limit);
  const ratings = projects.filter((p) => p.rating != null).map((p) => p.rating);
  const averageRating =
    ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
  res.json({
    success: true,
    projects,
    averageRating: Math.round(averageRating * 10) / 10,
    jobsCompleted: projects.length,
  });
}

module.exports = {
  listProviders,
  getProvider,
  listProviderReviews,
  listCompletedProjects,
  updateProviderScoped,
  uploadDocumentScoped,
  uploadAvatarScoped,
  uploadWorkPostImageScoped,
};
