/**
 * Account status revalidation tests.
 * Run: node tests/authAccountStatus.test.js
 */
require("dotenv").config();
const assert = require("assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  ACCOUNT_STATUS,
  resolveAccountStatus,
  assertStatusActive,
  assertAccountNotDeleted,
  assertCustomerNotBlocked,
  assertAuthenticatedAccountActive,
  BLOCKED_ACTION_MESSAGE,
} = require("../src/services/accountStatus.service");
const { authenticate } = require("../src/middleware/auth.middleware");
const AppError = require("../src/utils/AppError");

function testResolveAccountStatus() {
  assert.strictEqual(
    resolveAccountStatus({ blocked: false, deletedAt: null }),
    ACCOUNT_STATUS.ACTIVE
  );
  assert.strictEqual(
    resolveAccountStatus({ blocked: true, deletedAt: null }),
    ACCOUNT_STATUS.SUSPENDED
  );
  assert.strictEqual(
    resolveAccountStatus({ blocked: false, deletedAt: new Date() }),
    ACCOUNT_STATUS.DELETED
  );
  assert.strictEqual(
    resolveAccountStatus({ blocked: false, deletedAt: null }, { blocked: true, deletedAt: null }),
    ACCOUNT_STATUS.BANNED
  );
  assert.strictEqual(
    resolveAccountStatus({ blocked: false, deletedAt: null }, { blocked: false, deletedAt: new Date() }),
    ACCOUNT_STATUS.DELETED
  );
}

function testAssertStatusActive() {
  assert.throws(
    () => assertStatusActive(ACCOUNT_STATUS.SUSPENDED),
    (err) => err instanceof AppError && err.statusCode === 403
  );
  assert.throws(
    () => assertStatusActive(ACCOUNT_STATUS.BANNED),
    (err) => err instanceof AppError && err.statusCode === 403
  );
  assert.throws(
    () => assertStatusActive(ACCOUNT_STATUS.DEACTIVATED),
    (err) => err instanceof AppError && err.statusCode === 403
  );
  assert.throws(
    () => assertStatusActive(ACCOUNT_STATUS.DELETED),
    (err) => err instanceof AppError && err.statusCode === 403
  );
  assert.doesNotThrow(() => assertStatusActive(ACCOUNT_STATUS.ACTIVE));
}

function testAssertAccountNotDeleted() {
  assert.throws(
    () => assertAccountNotDeleted(ACCOUNT_STATUS.DELETED),
    (err) => err instanceof AppError && err.statusCode === 403
  );
  assert.doesNotThrow(() => assertAccountNotDeleted(ACCOUNT_STATUS.SUSPENDED));
  assert.doesNotThrow(() => assertAccountNotDeleted(ACCOUNT_STATUS.BANNED));
}

function testAssertCustomerNotBlocked() {
  assert.throws(
    () => assertCustomerNotBlocked({ blocked: true }),
    (err) => err instanceof AppError && err.statusCode === 403 && err.message === BLOCKED_ACTION_MESSAGE
  );
  assert.doesNotThrow(() => assertCustomerNotBlocked({ blocked: false }));
  assert.doesNotThrow(() => assertCustomerNotBlocked(null));
}

function signTestToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function runAuthenticateMiddleware(req) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    let body = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        body = payload;
        resolve({ statusCode, body });
        return this;
      },
    };
    authenticate(req, res, (err) => {
      if (err) {
        resolve({ err, statusCode: err.statusCode, body: { message: err.message } });
        return;
      }
      resolve({ statusCode, body });
    });
  });
}

async function runDbIntegrationTests() {
  if (!process.env.DATABASE_URL) {
    console.log("authAccountStatus.test.js: skip DB integration (DATABASE_URL not set)");
    return;
  }

  const prisma = require("../src/config/prisma");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `auth-status-test-${suffix}@example.com`;
  let userId = null;

  try {
    const hashed = await bcrypt.hash("TestPass123!", 12);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name: "Auth Status Test",
        role: "CUSTOMER",
      },
    });
    userId = user.id;
    const token = signTestToken(user);

    await assertAuthenticatedAccountActive({
      userId: user.id,
      role: user.role,
    });

    const activeReq = {
      headers: { authorization: `Bearer ${token}` },
    };
    const activeResult = await runAuthenticateMiddleware(activeReq);
    assert.ok(!activeResult.err, "active user should pass authenticate middleware");
    assert.ok(activeReq.user, "req.user should be set");

    await prisma.user.update({
      where: { id: userId },
      data: { blocked: true, blockedReason: "Test block reason" },
    });

    await assertAuthenticatedAccountActive({
      userId: user.id,
      role: user.role,
    });

    const blockedReq = {
      headers: { authorization: `Bearer ${token}` },
    };
    const blockedResult = await runAuthenticateMiddleware(blockedReq);
    assert.ok(!blockedResult.err, "blocked user should pass authenticate middleware");
    assert.ok(blockedReq.user, "req.user should be set for blocked user");

    await prisma.user.update({
      where: { id: userId },
      data: { blocked: false, deletedAt: new Date() },
    });

    await assert.rejects(
      () =>
        assertAuthenticatedAccountActive({
          userId: user.id,
          role: user.role,
        }),
      (err) => err instanceof AppError && err.statusCode === 403
    );

    const deletedReq = {
      headers: { authorization: `Bearer ${token}` },
    };
    const deletedResult = await runAuthenticateMiddleware(deletedReq);
    assert.strictEqual(deletedResult.statusCode, 403);
    assert.match(
      String(deletedResult.body?.message || deletedResult.err.message),
      /removed/i
    );
  } finally {
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  }
}

async function main() {
  testResolveAccountStatus();
  testAssertStatusActive();
  testAssertAccountNotDeleted();
  testAssertCustomerNotBlocked();
  await runDbIntegrationTests();
  console.log("authAccountStatus.test.js: all tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
