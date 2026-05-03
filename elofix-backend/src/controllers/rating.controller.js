const materialOrderRatingService = require("../services/materialOrderRating.service");

async function postMaterialOrderRating(req, res) {
  const customerUserId = req.user?.userId;
  const body = req.body || {};
  const payload = await materialOrderRatingService.createMaterialOrderRating({
    orderId: body.orderId,
    customerUserId,
    rating: body.rating,
    comment: body.comment,
  });
  res.json({ success: true, rating: payload });
}

module.exports = { postMaterialOrderRating };
