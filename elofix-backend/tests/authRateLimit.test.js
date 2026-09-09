/**
 * Auth / contact IP rate-limit tests.
 * Run: node tests/authRateLimit.test.js
 */
require("dotenv").config();
const assert = require("assert");
const {
  createIpRateLimiter,
  resetAuthRateLimits,
  authLoginRateLimit,
} = require("../src/middleware/ipRateLimit.middleware");
const AppError = require("../src/utils/AppError");

function runLimiter(limiter, req) {
  return new Promise((resolve) => {
    limiter(req, {}, (err) => resolve(err || null));
  });
}

async function testSharedLimiter() {
  const limiter = createIpRateLimiter({
    windowMs: 60_000,
    max: 2,
    message: "Too many requests. Please try again shortly.",
  });
  const req = { headers: {}, ip: "203.0.113.10" };
  assert.strictEqual(await runLimiter(limiter, req), null);
  assert.strictEqual(await runLimiter(limiter, req), null);
  const blocked = await runLimiter(limiter, req);
  assert.ok(blocked instanceof AppError);
  assert.strictEqual(blocked.statusCode, 429);
  assert.strictEqual(blocked.message, "Too many requests. Please try again shortly.");
}

async function testLoginHttp() {
  resetAuthRateLimits();
  const req = { headers: { "x-forwarded-for": "198.51.100.9" }, ip: "198.51.100.9" };
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(await runLimiter(authLoginRateLimit, req), null);
  }
  const blocked = await runLimiter(authLoginRateLimit, req);
  assert.ok(blocked instanceof AppError);
  assert.strictEqual(blocked.statusCode, 429);
  assert.match(blocked.message, /login/i);
}

async function testProductionNeverBypassesLoopback() {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const { shouldBypassAuthRateLimit } = require("../src/middleware/ipRateLimit.middleware");
    const req = { headers: {}, ip: "127.0.0.1" };
    assert.strictEqual(shouldBypassAuthRateLimit(req), false);
  } finally {
    process.env.NODE_ENV = prev;
  }
}

async function testLoginHttpRoute() {
  if (!process.env.DATABASE_URL) {
    console.log("authRateLimit.test.js: skip HTTP login 429 (DATABASE_URL not set)");
    return;
  }
  const prevE2e = process.env.ELOFIX_E2E_FULL_STACK;
  const prevDisable = process.env.ELOFIX_AUTH_RATE_LIMIT_DISABLED;
  delete process.env.ELOFIX_E2E_FULL_STACK;
  delete process.env.ELOFIX_AUTH_RATE_LIMIT_DISABLED;
  resetAuthRateLimits();
  const app = require("../src/app");
  const { listenApp, httpRequest } = require("./helpers/httpServer");
  const h = await listenApp(app);
  try {
    const payload = { email: "no-such-rate-limit@example.com", password: "WrongPass1!" };
    let last = null;
    for (let i = 0; i < 6; i++) {
      last = await httpRequest(h.baseUrl, "POST", "/api/auth/login", {
        json: payload,
        headers: { "x-forwarded-for": "198.51.100.9" },
      });
    }
    assert.strictEqual(last.status, 429);
    assert.ok(last.body && typeof last.body.message === "string");
    assert.ok(!String(last.body.message).includes("stack"));
  } finally {
    await h.close();
    resetAuthRateLimits();
    if (prevE2e === undefined) delete process.env.ELOFIX_E2E_FULL_STACK;
    else process.env.ELOFIX_E2E_FULL_STACK = prevE2e;
    if (prevDisable === undefined) delete process.env.ELOFIX_AUTH_RATE_LIMIT_DISABLED;
    else process.env.ELOFIX_AUTH_RATE_LIMIT_DISABLED = prevDisable;
  }
}

async function run() {
  await testSharedLimiter();
  await testLoginHttp();
  await testProductionNeverBypassesLoopback();
  await testLoginHttpRoute();
  console.log("authRateLimit.test.js: all passed");
}

const { runTestMain } = require("./helpers/shutdown");

runTestMain(run);
