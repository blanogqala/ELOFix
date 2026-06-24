const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { hmacHash } = require("../utils/identityHash.util");
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES } = require("../constants/auditActions");
const { sendPasswordResetEmail } = require("./email.service");

const TOKEN_TTL_MS = 15 * 60 * 1000;
const GENERIC_FORGOT_MESSAGE =
  "If an account exists with that email, you will receive reset instructions shortly.";
const RESET_SUCCESS_MESSAGE = "Your password has been updated.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");
}

function normalizeEmail(email) {
  return String(email ?? "")
    .toLowerCase()
    .trim();
}

function isValidEmail(email) {
  return EMAIL_RE.test(email);
}

function emailDomain(email) {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(at + 1) : null;
}

function buildAuditMeta(meta = {}) {
  return {
    ipAddress: meta.ipAddress ?? meta.ip ?? null,
    deviceFingerprint: meta.deviceFingerprint ?? null,
    userAgent: meta.userAgent ?? null,
  };
}

function isEligibleForReset(user) {
  if (!user) {
    return { eligible: false, reason: "not_found" };
  }
  if (!user.password) {
    return { eligible: false, reason: "google_only" };
  }
  if (user.role === "CUSTOMER") {
    if (user.deletedAt) {
      return { eligible: false, reason: "deleted" };
    }
    if (user.blocked) {
      return { eligible: false, reason: "blocked" };
    }
  }
  return { eligible: true };
}

function generateRawToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashResetToken(rawToken) {
  return hmacHash(rawToken, "password_reset");
}

async function requestPasswordReset(email, meta = {}) {
  const normalized = normalizeEmail(email);
  const auditBase = buildAuditMeta(meta);

  if (!normalized || !isValidEmail(normalized)) {
    await logAudit(AUDIT_ACTIONS.AUTH_PASSWORD_RESET_REQUESTED, {
      ...auditBase,
      entityType: ENTITY_TYPES.USER,
      newValue: {
        skipped: true,
        reason: "invalid_email",
        emailDomain: null,
        userAgent: auditBase.userAgent,
      },
    });
    return { message: GENERIC_FORGOT_MESSAGE };
  }

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: {
      id: true,
      email: true,
      password: true,
      role: true,
      blocked: true,
      deletedAt: true,
    },
  });

  const eligibility = isEligibleForReset(user);

  if (!eligibility.eligible) {
    await logAudit(AUDIT_ACTIONS.AUTH_PASSWORD_RESET_REQUESTED, {
      ...auditBase,
      userId: user?.id,
      entityType: ENTITY_TYPES.USER,
      entityId: user?.id || null,
      newValue: {
        skipped: true,
        reason: eligibility.reason,
        emailDomain: emailDomain(normalized),
        userAgent: auditBase.userAgent,
      },
    });
    return { message: GENERIC_FORGOT_MESSAGE };
  }

  const rawToken = generateRawToken();
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: tokenHash,
        expiresAt,
      },
    }),
  ]);

  const resetUrl = `${getFrontendUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
  await sendPasswordResetEmail({ to: user.email, resetUrl });

  await logAudit(AUDIT_ACTIONS.AUTH_PASSWORD_RESET_REQUESTED, {
    ...auditBase,
    userId: user.id,
    entityType: ENTITY_TYPES.USER,
    entityId: user.id,
    newValue: {
      skipped: false,
      emailDomain: emailDomain(normalized),
      userAgent: auditBase.userAgent,
    },
  });

  return { message: GENERIC_FORGOT_MESSAGE };
}

async function resetPassword(body = {}, meta = {}) {
  const rawToken = String(body.token ?? "").trim();
  const newPassword = body.newPassword ?? body.password;
  const auditBase = buildAuditMeta(meta);

  if (!rawToken) {
    await logAudit(AUDIT_ACTIONS.AUTH_PASSWORD_RESET_FAILED, {
      ...auditBase,
      entityType: ENTITY_TYPES.USER,
      newValue: { reason: "missing_token", userAgent: auditBase.userAgent },
    });
    throw new AppError("Invalid or expired reset link. Please request a new one.", 400);
  }

  if (!newPassword || String(newPassword).length < 8) {
    await logAudit(AUDIT_ACTIONS.AUTH_PASSWORD_RESET_FAILED, {
      ...auditBase,
      entityType: ENTITY_TYPES.USER,
      newValue: { reason: "invalid_password", userAgent: auditBase.userAgent },
    });
    throw new AppError("New password must be at least 8 characters", 400);
  }

  const tokenHash = hashResetToken(rawToken);
  const now = new Date();

  const tokenRow = await prisma.passwordResetToken.findFirst({
    where: {
      token: tokenHash,
      used: false,
      expiresAt: { gt: now },
    },
    select: { id: true, userId: true },
  });

  if (!tokenRow) {
    await logAudit(AUDIT_ACTIONS.AUTH_PASSWORD_RESET_FAILED, {
      ...auditBase,
      entityType: ENTITY_TYPES.USER,
      newValue: { reason: "invalid_or_expired", userAgent: auditBase.userAgent },
    });
    throw new AppError("Invalid or expired reset link. Please request a new one.", 400);
  }

  const hashedPassword = await bcrypt.hash(String(newPassword), 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: tokenRow.userId },
      data: { password: hashedPassword },
    }),
    prisma.passwordResetToken.update({
      where: { id: tokenRow.id },
      data: { used: true },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: tokenRow.userId, used: false },
      data: { used: true },
    }),
  ]);

  await logAudit(AUDIT_ACTIONS.AUTH_PASSWORD_RESET_COMPLETED, {
    ...auditBase,
    userId: tokenRow.userId,
    entityType: ENTITY_TYPES.USER,
    entityId: tokenRow.userId,
    newValue: { userAgent: auditBase.userAgent },
  });

  return { message: RESET_SUCCESS_MESSAGE };
}

module.exports = {
  requestPasswordReset,
  resetPassword,
  GENERIC_FORGOT_MESSAGE,
  RESET_SUCCESS_MESSAGE,
  TOKEN_TTL_MS,
  hashResetToken,
  generateRawToken,
  isEligibleForReset,
  isValidEmail,
  normalizeEmail,
};
