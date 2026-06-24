const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const { ACTOR_TYPES } = require("../constants/auditActions");
const { inferActorType } = require("../utils/auditContext.util");

/**
 * @typedef {object} AuditOpts
 * @property {string} [userId]
 * @property {string} [actorType]
 * @property {string} [entityType]
 * @property {string} [entityId]
 * @property {object} [oldValue]
 * @property {object} [newValue]
 * @property {string} [ipAddress]
 * @property {string} [deviceFingerprint]
 * @property {object} [metadata]
 * @property {{ role?: string }} [actorUser]
 */

/**
 * Write a structured audit log entry. Non-blocking — never throws.
 * @param {string} action
 * @param {AuditOpts} [opts]
 */
async function logAudit(action, opts = {}) {
  const userId = opts.userId != null && opts.userId !== "" ? String(opts.userId) : null;
  const actorType =
    opts.actorType ||
    (opts.actorUser ? inferActorType(opts.actorUser) : userId ? ACTOR_TYPES.USER : ACTOR_TYPES.SYSTEM);

  let oldValue = opts.oldValue != null ? opts.oldValue : undefined;
  let newValue = opts.newValue != null ? opts.newValue : undefined;
  const metadata = opts.metadata != null ? opts.metadata : undefined;

  // Backward compat: merge metadata into newValue when structured values absent
  if (newValue === undefined && metadata !== undefined) {
    newValue = metadata;
  } else if (newValue !== undefined && metadata !== undefined) {
    newValue = { ...metadata, ...(typeof newValue === "object" && newValue ? newValue : {}) };
  }

  const entityType =
    opts.entityType != null && opts.entityType !== "" ? String(opts.entityType) : null;
  const entityId = opts.entityId != null && opts.entityId !== "" ? String(opts.entityId) : null;
  const ipAddress =
    opts.ipAddress != null && opts.ipAddress !== "" ? String(opts.ipAddress) : null;
  const deviceFingerprint =
    opts.deviceFingerprint != null && opts.deviceFingerprint !== ""
      ? String(opts.deviceFingerprint)
      : null;

  try {
    await prisma.auditLog.create({
      data: {
        id: randomUUID(),
        action: String(action),
        userId,
        actorType: String(actorType),
        entityType,
        entityId,
        oldValue: oldValue === undefined ? undefined : oldValue,
        newValue: newValue === undefined ? undefined : newValue,
        ipAddress,
        deviceFingerprint,
        metadata: metadata === undefined ? undefined : metadata,
      },
    });
  } catch (err) {
    console.error("[auditLog] failed", err);
  }
}

module.exports = { logAudit };
