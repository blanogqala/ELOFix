const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const { logAudit } = require("./auditLog.service");
const notificationEvents = require("./notificationEvents.service");
const providerTrustScore = require("./providerTrustScore.service");

const ALERT_SEVERITY_DEFAULTS = {
  DUPLICATE_PHONE: "HIGH",
  DUPLICATE_SA_ID: "HIGH",
  DUPLICATE_COMPANY_REG: "HIGH",
  DUPLICATE_BANK_ACCOUNT: "HIGH",
  SUSPICIOUS_DEVICE: "HIGH",
  HIGH_RISK_PROVIDER: "MEDIUM",
  FLAGGED_CUSTOMER: "MEDIUM",
  SUSPICIOUS_LOGIN: "MEDIUM",
  FAKE_DOCUMENTATION: "CRITICAL",
};

async function createAlert({
  alertType,
  description,
  userId = null,
  providerId = null,
  severity = null,
  metadata = null,
  applyTrustPenalty = true,
}) {
  const type = String(alertType);
  const row = await prisma.fraudAlert.create({
    data: {
      id: randomUUID(),
      alertType: type,
      description: String(description || ""),
      userId: userId || null,
      providerId: providerId || null,
      severity: severity || ALERT_SEVERITY_DEFAULTS[type] || "MEDIUM",
      status: "OPEN",
      metadata: metadata || undefined,
    },
  });

  if (providerId && applyTrustPenalty) {
    try {
      await providerTrustScore.onFraudAlert(providerId);
    } catch (err) {
      console.error("[fraudAlert] trust penalty failed", err);
    }
  }

  try {
    await logAudit("fraud_alert_created", userId, {
      alertId: row.id,
      alertType: type,
      providerId,
      severity: row.severity,
    });
  } catch (_) {
    /* audit optional */
  }

  notificationEvents.notifyAdminFraudAlert(row).catch(() => {});

  return row;
}

async function updateAlertStatus(alertId, { status, reviewedBy, notes }) {
  const valid = ["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"];
  const nextStatus = String(status || "").toUpperCase();
  if (!valid.includes(nextStatus)) {
    throw new Error(`Invalid fraud alert status: ${status}`);
  }

  const data = {
    status: nextStatus,
    reviewedBy: reviewedBy || null,
    reviewedAt: reviewedBy ? new Date() : undefined,
  };
  if (notes != null) {
    const existing = await prisma.fraudAlert.findUnique({ where: { id: alertId } });
    const meta = existing?.metadata && typeof existing.metadata === "object" ? { ...existing.metadata } : {};
    meta.reviewNotes = String(notes);
    data.metadata = meta;
  }

  return prisma.fraudAlert.update({
    where: { id: alertId },
    data,
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, role: true } },
      provider: {
        select: {
          id: true,
          userId: true,
          businessName: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
}

async function getAlertById(alertId) {
  return prisma.fraudAlert.findUnique({
    where: { id: alertId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, role: true, blocked: true } },
      provider: {
        select: {
          id: true,
          userId: true,
          businessName: true,
          approved: true,
          fraudReviewStatus: true,
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
      },
    },
  });
}

async function listAlerts({ status, severity, alertType, limit = 50, offset = 0 } = {}) {
  const where = {};
  if (status) where.status = String(status).toUpperCase();
  if (severity) where.severity = String(severity).toUpperCase();
  if (alertType) where.alertType = String(alertType).toUpperCase();

  const [items, total] = await Promise.all([
    prisma.fraudAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(limit) || 50, 200),
      skip: Math.max(Number(offset) || 0, 0),
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        provider: {
          select: {
            id: true,
            userId: true,
            businessName: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
    prisma.fraudAlert.count({ where }),
  ]);

  return { items, total };
}

async function getSummaryCounts() {
  const [
    duplicatePhones,
    duplicateIds,
    duplicateCompanies,
    duplicateBanks,
    suspiciousDevices,
    highRiskProviders,
    flaggedCustomers,
    fraudAlerts,
  ] = await Promise.all([
    prisma.fraudAlert.count({
      where: { alertType: "DUPLICATE_PHONE", status: { in: ["OPEN", "UNDER_REVIEW"] } },
    }),
    prisma.fraudAlert.count({
      where: { alertType: "DUPLICATE_SA_ID", status: { in: ["OPEN", "UNDER_REVIEW"] } },
    }),
    prisma.fraudAlert.count({
      where: { alertType: "DUPLICATE_COMPANY_REG", status: { in: ["OPEN", "UNDER_REVIEW"] } },
    }),
    prisma.fraudAlert.count({
      where: { alertType: "DUPLICATE_BANK_ACCOUNT", status: { in: ["OPEN", "UNDER_REVIEW"] } },
    }),
    prisma.fraudAlert.count({
      where: { alertType: "SUSPICIOUS_DEVICE", status: { in: ["OPEN", "UNDER_REVIEW"] } },
    }),
    prisma.providerTrustScore.count({ where: { score: { lt: 40 } } }),
    prisma.fraudAlert.count({
      where: {
        alertType: "FLAGGED_CUSTOMER",
        status: { in: ["OPEN", "UNDER_REVIEW"] },
      },
    }),
    prisma.fraudAlert.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
  ]);

  return {
    duplicatePhones,
    duplicateIds,
    duplicateCompanies,
    duplicateBanks,
    suspiciousDevices,
    highRiskProviders,
    flaggedCustomers,
    fraudAlerts,
  };
}

module.exports = {
  createAlert,
  updateAlertStatus,
  getAlertById,
  listAlerts,
  getSummaryCounts,
  ALERT_SEVERITY_DEFAULTS,
};
