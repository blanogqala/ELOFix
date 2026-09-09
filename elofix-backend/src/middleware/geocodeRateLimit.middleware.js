const { createIpRateLimiter } = require("./ipRateLimit.middleware");

const geocodeRateLimit = createIpRateLimiter({
  windowMs: 60_000,
  max: 30,
  message: "Too many geocoding requests. Please try again shortly.",
});

module.exports = { geocodeRateLimit };
