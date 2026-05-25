const AppError = require("./AppError");

function actorRole(actor) {
  return String(actor?.role || "").toUpperCase();
}

function actorUserId(actor) {
  return actor?.userId != null ? String(actor.userId) : "";
}

function assertAdmin(actor, message = "Admin access required") {
  if (actorRole(actor) !== "ADMIN") {
    throw new AppError(message, 403);
  }
}

function resolveScopedUserId(actor, requestedUserId) {
  const tokenUserId = actorUserId(actor);
  const effectiveUserId =
    requestedUserId !== undefined && requestedUserId !== null && String(requestedUserId).trim() !== ""
      ? String(requestedUserId)
      : tokenUserId;

  if (!effectiveUserId) {
    throw new AppError("User context is required", 400);
  }
  if (actorRole(actor) !== "ADMIN" && effectiveUserId !== tokenUserId) {
    throw new AppError("Forbidden", 403);
  }
  return effectiveUserId;
}

function assertJobCustomer(job, actor, message = "Only the customer can perform this action", options = {}) {
  if (options.allowAdmin && actorRole(actor) === "ADMIN") return;
  if (actorRole(actor) !== "CUSTOMER" || String(job?.customerId || "") !== actorUserId(actor)) {
    throw new AppError(message, 403);
  }
}

function assertJobProvider(job, actor, message = "Only the assigned provider can perform this action", options = {}) {
  if (options.allowAdmin && actorRole(actor) === "ADMIN") return;
  if (actorRole(actor) !== "PROVIDER" || String(job?.providerId || "") !== actorUserId(actor)) {
    throw new AppError(message, 403);
  }
}

function assertJobCustomerOrProvider(job, actor, message = "Forbidden", options = {}) {
  if (options.allowAdmin !== false && actorRole(actor) === "ADMIN") return;
  const isCustomer = actorRole(actor) === "CUSTOMER" && String(job?.customerId || "") === actorUserId(actor);
  const isProvider = actorRole(actor) === "PROVIDER" && String(job?.providerId || "") === actorUserId(actor);
  if (!isCustomer && !isProvider) {
    throw new AppError(message, 403);
  }
}

function assertMaterialOrderCustomer(row, actor, message = "Only the customer can modify this order", options = {}) {
  if (options.allowAdmin && actorRole(actor) === "ADMIN") return;
  if (actorRole(actor) !== "CUSTOMER" || String(row?.userId || "") !== actorUserId(actor)) {
    throw new AppError(message, 403);
  }
}

module.exports = {
  actorRole,
  actorUserId,
  assertAdmin,
  resolveScopedUserId,
  assertJobCustomer,
  assertJobProvider,
  assertJobCustomerOrProvider,
  assertMaterialOrderCustomer,
};
