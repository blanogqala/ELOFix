const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");

/**
 * @param {string} action
 * @param {{ userId?: string | null, metadata?: object | null }} [opts]
 */
async function logAudit(action, opts = {}) {
  const userId = opts.userId != null && opts.userId !== "" ? String(opts.userId) : null;
  const metadata = opts.metadata != null ? opts.metadata : undefined;
  try {
    await prisma.auditLog.create({
      data: {
        id: randomUUID(),
        action: String(action),
        userId,
        metadata: metadata === undefined ? undefined : metadata,
      },
    });
  } catch (err) {
    console.error("[auditLog] failed", err);
  }
}

module.exports = { logAudit };
