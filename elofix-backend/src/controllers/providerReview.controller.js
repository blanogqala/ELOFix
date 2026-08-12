const providerReviewService = require("../services/providerReview.service");

async function createReview(req, res) {
  const review = await providerReviewService.createProviderReview({
    jobId: req.body?.jobId,
    customerUserId: req.user.userId,
    rating: req.body?.rating,
    comment: req.body?.comment,
    images: req.body?.images,
    videos: req.body?.videos,
  });
  res.status(201).json({ success: true, review });
}

async function listReviewsForProvider(req, res) {
  const result = await providerReviewService.listProviderReviews(req.params.id, {
    limit: req.query.limit,
    offset: req.query.offset,
  });
  res.json({ success: true, ...result });
}

module.exports = { createReview, listReviewsForProvider };
