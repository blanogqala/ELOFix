/**
 * Password reset tests (unit + optional DB integration).
 * Run: node tests/passwordReset.test.js
 */
require("dotenv").config();
const assert = require("assert");
const bcrypt = require("bcryptjs");
const {
  GENERIC_FORGOT_MESSAGE,
  TOKEN_TTL_MS,
  hashResetToken,
  generateRawToken,
  isEligibleForReset,
  isValidEmail,
  normalizeEmail,
  requestPasswordReset,
  resetPassword,
} = require("../src/services/passwordReset.service");

function testEmailHelpers() {
  assert.strictEqual(normalizeEmail("  Test@Example.COM "), "test@example.com");
  assert.strictEqual(isValidEmail("user@example.com"), true);
  assert.strictEqual(isValidEmail("not-an-email"), false);
}

function testTokenHelpers() {
  const raw = generateRawToken();
  assert.ok(raw.length >= 32);
  const hash1 = hashResetToken(raw);
  const hash2 = hashResetToken(raw);
  assert.strictEqual(hash1, hash2);
  assert.notStrictEqual(hashResetToken("other"), hash1);
  assert.strictEqual(TOKEN_TTL_MS, 15 * 60 * 1000);
}

function testEligibility() {
  assert.deepStrictEqual(isEligibleForReset(null), { eligible: false, reason: "not_found" });
  assert.deepStrictEqual(isEligibleForReset({ password: null, role: "CUSTOMER" }), {
    eligible: false,
    reason: "google_only",
  });
  assert.deepStrictEqual(
    isEligibleForReset({ password: "x", role: "CUSTOMER", deletedAt: new Date(), blocked: false }),
    { eligible: false, reason: "deleted" }
  );
  assert.deepStrictEqual(
    isEligibleForReset({ password: "x", role: "CUSTOMER", deletedAt: null, blocked: true }),
    { eligible: false, reason: "blocked" }
  );
  assert.deepStrictEqual(
    isEligibleForReset({ password: "x", role: "PROVIDER", deletedAt: null, blocked: false }),
    { eligible: true }
  );
}

async function testForgotPasswordGenericResponse() {
  const known = await requestPasswordReset("admin@elofix.com", { ip: "127.0.0.1" });
  const unknown = await requestPasswordReset("no-such-user-xyz@example.com", { ip: "127.0.0.1" });
  assert.strictEqual(known.message, GENERIC_FORGOT_MESSAGE);
  assert.strictEqual(unknown.message, GENERIC_FORGOT_MESSAGE);
}

async function runDbIntegrationTests() {
  const prisma = require("../src/config/prisma");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `pwd-reset-test-${suffix}@example.com`;
  const googleEmail = `pwd-reset-google-${suffix}@example.com`;
  let userId = null;
  let googleUserId = null;

  try {
    const hashed = await bcrypt.hash("OldPass123!", 12);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name: "Reset Test User",
        role: "CUSTOMER",
      },
    });
    userId = user.id;

    const googleUser = await prisma.user.create({
      data: {
        email: googleEmail,
        password: null,
        name: "Google User",
        role: "CUSTOMER",
        authProvider: "GOOGLE",
      },
    });
    googleUserId = googleUser.id;

    await requestPasswordReset(email, { ip: "127.0.0.1" });
    await requestPasswordReset(googleEmail, { ip: "127.0.0.1" });

    const userTokens = await prisma.passwordResetToken.count({ where: { userId } });
    const googleTokens = await prisma.passwordResetToken.count({ where: { userId: googleUserId } });
    assert.strictEqual(userTokens, 1, "eligible user should get one token row");
    assert.strictEqual(googleTokens, 0, "google-only user should not get a token row");

    const rawToken = generateRawToken();
    const tokenHash = hashResetToken(rawToken);
    const expiredAt = new Date(Date.now() - 60_000);
    await prisma.passwordResetToken.create({
      data: {
        userId,
        token: tokenHash,
        expiresAt: expiredAt,
      },
    });

    let expiredFailed = false;
    try {
      await resetPassword({ token: rawToken, newPassword: "NewPass123!" }, { ip: "127.0.0.1" });
    } catch (err) {
      expiredFailed = err.statusCode === 400;
    }
    assert.strictEqual(expiredFailed, true, "expired token should fail");

    const validRaw = generateRawToken();
    const validHash = hashResetToken(validRaw);
    const validRow = await prisma.passwordResetToken.create({
      data: {
        userId,
        token: validHash,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    const result = await resetPassword({ token: validRaw, newPassword: "NewPass456!" }, { ip: "127.0.0.1" });
    assert.strictEqual(result.message, "Your password has been updated.");

    const usedRow = await prisma.passwordResetToken.findUnique({ where: { id: validRow.id } });
    assert.strictEqual(usedRow.used, true);

    let secondUseFailed = false;
    try {
      await resetPassword({ token: validRaw, newPassword: "AnotherPass1!" }, { ip: "127.0.0.1" });
    } catch (err) {
      secondUseFailed = err.statusCode === 400;
    }
    assert.strictEqual(secondUseFailed, true, "token should be one-time use");

    const updatedUser = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
    const matchesNew = await bcrypt.compare("NewPass456!", updatedUser.password);
    assert.strictEqual(matchesNew, true);

    const { AUDIT_ACTIONS } = require("../src/constants/auditActions");
    const completedAudit = await prisma.auditLog.findFirst({
      where: {
        userId,
        action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET_COMPLETED,
      },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(completedAudit, "password reset completion should be audited");
    assert.strictEqual(completedAudit.ipAddress, "127.0.0.1", "audit should capture request IP");
  } finally {
    if (userId) {
      await prisma.passwordResetToken.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    if (googleUserId) {
      await prisma.passwordResetToken.deleteMany({ where: { userId: googleUserId } });
      await prisma.user.delete({ where: { id: googleUserId } }).catch(() => {});
    }
  }
}

async function main() {
  testEmailHelpers();
  testTokenHelpers();
  testEligibility();

  if (!process.env.DATABASE_URL) {
    console.log("passwordReset.test.js: unit tests OK (DATABASE_URL not set; skipping DB integration)");
    return;
  }

  try {
    await testForgotPasswordGenericResponse();
    await runDbIntegrationTests();
    console.log("passwordReset.test.js: OK");
  } catch (err) {
    console.error("passwordReset.test.js failed:", err);
    process.exit(1);
  } finally {
    const prisma = require("../src/config/prisma");
    await prisma.$disconnect().catch(() => {});
  }
}

main();
