const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES } = require("../constants/auditActions");
const {
  UPLOAD_CATEGORIES,
  LIMITS_PER_HOUR,
  WINDOW_MS,
  CATEGORY_LABELS,
  hourWindowKey,
  getLimitForCategory,
} = require("../constants/uploadRateLimit.constants");
const { getRequestAuditContext } = require("../utils/auditContext.util");
const fraudAlert = require("./fraudAlert.service");

const VIOLATION_ALERT_THRESHOLD = Number(process.env.UPLOAD_RATE_VIOLATION_ALERT_THRESHOLD || 3);
const VIOLATION_LOOKBACK_HOURS = Number(process.env.UPLOAD_RATE_VIOLATION_LOOKBACK_HOURS || 24);

async function resolveProviderIdForUser(userId) {
  const row = await prisma.provider.findUnique({
    where: { userId: String(userId) },
    select: { id: true },
  });
  return row?.id || null;
}

async function recordViolation(userId, category, limit, count, req) {
  const auditCtx = getRequestAuditContext(req);

  await prisma.uploadRateViolation.create({
    data: {
      id: randomUUID(),
      userId: String(userId),
      category: String(category),
      limit: Number(limit),
      count: Number(count),
    },
  });

  await logAudit(AUDIT_ACTIONS.UPLOAD_RATE_LIMITED, {
    userId: String(userId),
    entityType: ENTITY_TYPES.USER,
    entityId: String(userId),
    ipAddress: auditCtx.ipAddress,
    deviceFingerprint: auditCtx.deviceFingerprint,
    newValue: {
      category,
      limit,
      count,
      windowKey: hourWindowKey(),
    },
  });

  const since = new Date(Date.now() - VIOLATION_LOOKBACK_HOURS * 60 * 60 * 1000);
  const violationCount = await prisma.uploadRateViolation.count({
    where: {
      userId: String(userId),
      createdAt: { gte: since },
    },
  });

  if (violationCount < VIOLATION_ALERT_THRESHOLD) return;

  const existingAlert = await prisma.fraudAlert.findFirst({
    where: {
      userId: String(userId),
      alertType: "UPLOAD_RATE_ABUSE",
      status: { in: ["OPEN", "UNDER_REVIEW"] },
      createdAt: { gte: since },
    },
  });
  if (existingAlert) return;

  const providerId = await resolveProviderIdForUser(userId);
  await fraudAlert.createAlert({
    alertType: "UPLOAD_RATE_ABUSE",
    description: `User exceeded upload rate limits ${violationCount} time(s) in ${VIOLATION_LOOKBACK_HOURS}h (latest: ${CATEGORY_LABELS[category] || category})`,
    userId: String(userId),
    providerId,
    severity: "HIGH",
    metadata: {
      violationCount,
      lookbackHours: VIOLATION_LOOKBACK_HOURS,
      latestCategory: category,
      latestLimit: limit,
      latestCount: count,
    },
    applyTrustPenalty: Boolean(providerId),
  });

  await logAudit(AUDIT_ACTIONS.UPLOAD_RATE_VIOLATION, {
    userId: String(userId),
    entityType: ENTITY_TYPES.USER,
    entityId: String(userId),
    ipAddress: auditCtx.ipAddress,
    deviceFingerprint: auditCtx.deviceFingerprint,
    newValue: {
      violationCount,
      threshold: VIOLATION_ALERT_THRESHOLD,
      category,
    },
  });
}

/**
 * Atomically consume one upload slot for the current UTC hour window.
 */
async function consumeUploadSlot(userId, category, opts = {}) {
  const uid = String(userId || "").trim();
  if (!uid) {
    throw new AppError("Authentication required", 401);
  }

  const limit = getLimitForCategory(category);
  const windowKey = hourWindowKey();
  const label = CATEGORY_LABELS[category] || category;

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.uploadRateBucket.findUnique({
      where: {
        userId_category_windowKey: {
          userId: uid,
          category,
          windowKey,
        },
      },
    });

    const currentCount = existing?.count ?? 0;
    if (currentCount >= limit) {
      return { allowed: false, count: currentCount, limit };
    }

    const nextCount = currentCount + 1;
    if (existing) {
      await tx.uploadRateBucket.update({
        where: { id: existing.id },
        data: { count: nextCount },
      });
    } else {
      await tx.uploadRateBucket.create({
        data: {
          id: randomUUID(),
          userId: uid,
          category,
          windowKey,
          count: nextCount,
        },
      });
    }

    return { allowed: true, count: nextCount, limit };
  });

  if (!result.allowed) {
    await recordViolation(uid, category, result.limit, result.count, opts.req);
    throw new AppError(
      `Upload limit reached (${result.limit} ${label} per hour). Try again later.`,
      429,
      "E_UPLOAD_RATE_LIMIT"
    );
  }

  const auditCtx = getRequestAuditContext(opts.req);
  await logAudit(AUDIT_ACTIONS.UPLOAD_RECORDED, {
    userId: uid,
    entityType: ENTITY_TYPES.USER,
    entityId: uid,
    ipAddress: auditCtx.ipAddress,
    deviceFingerprint: auditCtx.deviceFingerprint,
    newValue: {
      category,
      count: result.count,
      limit: result.limit,
      remaining: Math.max(0, result.limit - result.count),
      windowKey,
    },
  });

  return result;
}

module.exports = {
  UPLOAD_CATEGORIES,
  LIMITS_PER_HOUR,
  WINDOW_MS,
  hourWindowKey,
  consumeUploadSlot,
};
