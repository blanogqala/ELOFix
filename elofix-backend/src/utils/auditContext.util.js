const { ACTOR_TYPES } = require("../constants/auditActions");

function getClientIp(req) {
  if (!req) return null;
  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded) {
    const first = String(forwarded).split(",")[0].trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || null;
}

/**
 * Extract audit context from an Express request.
 * @param {import('express').Request} [req]
 * @param {{ deviceFingerprint?: string }} [extra]
 */
function getRequestAuditContext(req, extra = {}) {
  const bodyFp = req?.body?.deviceFingerprint;
  const headerFp = req?.headers?.["x-device-fingerprint"];
  const deviceFingerprint =
    extra.deviceFingerprint ||
    (bodyFp ? String(bodyFp).trim() : null) ||
    (headerFp ? String(headerFp).trim() : null) ||
    null;

  return {
    ipAddress: getClientIp(req),
    userAgent: req?.headers?.["user-agent"] || null,
    deviceFingerprint: deviceFingerprint || null,
  };
}

/**
 * @param {{ role?: string } | null | undefined} user
 */
function inferActorType(user) {
  const role = String(user?.role || "").toUpperCase();
  if (role === "ADMIN") return ACTOR_TYPES.ADMIN;
  if (role === "BRANCH_STAFF") return ACTOR_TYPES.BRANCH_STAFF;
  if (role === "SYSTEM") return ACTOR_TYPES.SYSTEM;
  return ACTOR_TYPES.USER;
}

/**
 * @param {import('express').Request} req
 */
function getAdminAuditContext(req) {
  const ctx = getRequestAuditContext(req);
  return {
    ...ctx,
    userId: req.user?.userId || null,
    actorType: ACTOR_TYPES.ADMIN,
  };
}

module.exports = { getClientIp, getRequestAuditContext, inferActorType, getAdminAuditContext };
