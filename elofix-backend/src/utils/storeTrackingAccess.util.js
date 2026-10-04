/**
 * Store-delivery GPS writes are limited to the supplier org and its branch staff.
 * The public tracking token is a view secret, not a permission to publish location.
 */

function roleMayPublishStoreGps(role) {
  const r = String(role || "").toUpperCase();
  return r === "SUPPLIER" || r === "BRANCH_STAFF";
}

function redactGpsWriteCredential(order, role) {
  if (!order || typeof order !== "object") return order;
  if (roleMayPublishStoreGps(role) || String(role || "").toUpperCase() === "ADMIN") {
    return order;
  }
  if (!Object.prototype.hasOwnProperty.call(order, "activeTrackingToken")) return order;
  const next = { ...order };
  delete next.activeTrackingToken;
  return next;
}

module.exports = {
  roleMayPublishStoreGps,
  redactGpsWriteCredential,
};
