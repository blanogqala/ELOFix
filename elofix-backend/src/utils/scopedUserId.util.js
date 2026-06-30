const AppError = require("./AppError");

/**
 * Resolve the effective userId for a request.
 * ADMIN may target another user; all other roles are forced to their own userId.
 */
function resolveScopedUserId(req, requestedUserId) {
  const actorId = String(req.user?.userId || "").trim();
  if (!actorId) {
    throw new AppError("Unauthorized", 401);
  }
  const requested = requestedUserId != null ? String(requestedUserId).trim() : "";
  if (String(req.user?.role || "").toUpperCase() === "ADMIN") {
    return requested || actorId;
  }
  if (requested && requested !== actorId) {
    throw new AppError("Forbidden", 403);
  }
  return actorId;
}

module.exports = { resolveScopedUserId };
