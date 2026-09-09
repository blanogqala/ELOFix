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
  clientKey,
  shouldBypassAuthRateLimit,
  resolveTrustProxySetting,
  applyTrustProxy,
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
  limiter.stop();
}

async function testSameAndDifferentIps() {
  const limiter = createIpRateLimiter({ windowMs: 60_000, max: 10 });
  const a = { headers: { "x-forwarded-for": "9.9.9.9" }, ip: "203.0.113.10" };
  const b = { headers: {}, ip: "203.0.113.11" };
  await runLimiter(limiter, a);
  await runLimiter(limiter, a);
  await runLimiter(limiter, b);
  assert.strictEqual(limiter.getBucketCount(), 2, "different IPs receive separate buckets");
  assert.strictEqual(clientKey(a), "203.0.113.10", "same real client IP uses req.ip");
  assert.notStrictEqual(clientKey(a), "9.9.9.9", "spoofed X-Forwarded-For is not used without Express trust");
  limiter.stop();
}

async function testExpiredBucketsRemoved() {
  const limiter = createIpRateLimiter({ windowMs: 25, max: 5 });
  for (let i = 0; i < 8; i++) {
    await runLimiter(limiter, { headers: {}, ip: `198.51.100.${i}` });
  }
  assert.ok(limiter.getBucketCount() >= 8);
  await new Promise((r) => setTimeout(r, 40));
  limiter.sweepExpired();
  assert.strictEqual(limiter.getBucketCount(), 0, "expired buckets are removed");
  limiter.stop();
}

async function testLoginHttp() {
  resetAuthRateLimits();
  const prevE2e = process.env.ELOFIX_E2E_FULL_STACK;
  const prevDisable = process.env.ELOFIX_AUTH_RATE_LIMIT_DISABLED;
  delete process.env.ELOFIX_E2E_FULL_STACK;
  delete process.env.ELOFIX_AUTH_RATE_LIMIT_DISABLED;
  try {
    const req = { headers: { "x-forwarded-for": "198.51.100.9" }, ip: "198.51.100.9" };
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(await runLimiter(authLoginRateLimit, req), null);
    }
    const blocked = await runLimiter(authLoginRateLimit, req);
    assert.ok(blocked instanceof AppError);
    assert.strictEqual(blocked.statusCode, 429);
    assert.match(blocked.message, /login/i);
  } finally {
    if (prevE2e === undefined) delete process.env.ELOFIX_E2E_FULL_STACK;
    else process.env.ELOFIX_E2E_FULL_STACK = prevE2e;
    if (prevDisable === undefined) delete process.env.ELOFIX_AUTH_RATE_LIMIT_DISABLED;
    else process.env.ELOFIX_AUTH_RATE_LIMIT_DISABLED = prevDisable;
  }
}

async function testProductionNeverBypassesLoopback() {
  const prev = process.env.NODE_ENV;
  const prevDisable = process.env.ELOFIX_AUTH_RATE_LIMIT_DISABLED;
  const prevE2e = process.env.ELOFIX_E2E_FULL_STACK;
  process.env.NODE_ENV = "production";
  process.env.ELOFIX_AUTH_RATE_LIMIT_DISABLED = "true";
  process.env.ELOFIX_E2E_FULL_STACK = "1";
  try {
    const req = { headers: {}, ip: "127.0.0.1" };
    assert.strictEqual(shouldBypassAuthRateLimit(req), false);
  } finally {
    process.env.NODE_ENV = prev;
    if (prevDisable === undefined) delete process.env.ELOFIX_AUTH_RATE_LIMIT_DISABLED;
    else process.env.ELOFIX_AUTH_RATE_LIMIT_DISABLED = prevDisable;
    if (prevE2e === undefined) delete process.env.ELOFIX_E2E_FULL_STACK;
    else process.env.ELOFIX_E2E_FULL_STACK = prevE2e;
  }
}

async function testDevE2eBypass() {
  const prev = process.env.NODE_ENV;
  const prevE2e = process.env.ELOFIX_E2E_FULL_STACK;
  process.env.NODE_ENV = "development";
  process.env.ELOFIX_E2E_FULL_STACK = "1";
  try {
    assert.strictEqual(shouldBypassAuthRateLimit({ headers: {}, ip: "8.8.8.8" }), true);
  } finally {
    process.env.NODE_ENV = prev;
    if (prevE2e === undefined) delete process.env.ELOFIX_E2E_FULL_STACK;
    else process.env.ELOFIX_E2E_FULL_STACK = prevE2e;
  }
}

async function testTrustProxySetting() {
  assert.strictEqual(resolveTrustProxySetting({ NODE_ENV: "development" }), false);
  assert.strictEqual(resolveTrustProxySetting({ NODE_ENV: "production" }), 1);
  assert.strictEqual(resolveTrustProxySetting({ NODE_ENV: "production", TRUST_PROXY: "false" }), false);
  assert.strictEqual(resolveTrustProxySetting({ NODE_ENV: "production", TRUST_PROXY: "2" }), 2);
  const fakeApp = { settings: {}, set(k, v) { this.settings[k] = v; }, get(k) { return this.settings[k]; } };
  assert.strictEqual(applyTrustProxy(fakeApp, { NODE_ENV: "production" }), 1);
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
  const prevTrust = app.get("trust proxy");
  app.set("trust proxy", 1);
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
    app.set("trust proxy", prevTrust);
    await h.close();
    resetAuthRateLimits();
    if (prevE2e === undefined) delete process.env.ELOFIX_E2E_FULL_STACK;
    else process.env.ELOFIX_E2E_FULL_STACK = prevE2e;
    if (prevDisable === undefined) delete process.env.ELOFIX_AUTH_RATE_LIMIT_DISABLED;
    else process.env.ELOFIX_AUTH_RATE_LIMIT_DISABLED = prevDisable;
  }
}

async function testTrustedProxyHttpIp() {
  if (!process.env.DATABASE_URL) {
    console.log("authRateLimit.test.js: skip trusted-proxy HTTP (DATABASE_URL not set)");
    return;
  }
  const express = require("express");
  const limiter = createIpRateLimiter({ windowMs: 60_000, max: 2, message: "Too many requests. Please try again shortly." });
  const app = express();
  app.set("trust proxy", 1);
  app.use(limiter);
  app.get("/ping", (req, res) => res.json({ ip: req.ip }));
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({ message: err.message || "error" });
  });
  const { listenApp, httpRequest } = require("./helpers/httpServer");
  const h = await listenApp(app);
  try {
    const a = await httpRequest(h.baseUrl, "GET", "/ping", { headers: { "x-forwarded-for": "203.0.113.50" } });
    assert.strictEqual(a.status, 200);
    assert.ok(String(a.body.ip).includes("203.0.113.50"), "trusted proxy mode resolves originating IP");
    await httpRequest(h.baseUrl, "GET", "/ping", { headers: { "x-forwarded-for": "203.0.113.50" } });
    const blocked = await httpRequest(h.baseUrl, "GET", "/ping", { headers: { "x-forwarded-for": "203.0.113.50" } });
    assert.strictEqual(blocked.status, 429);
  } finally {
    limiter.stop();
    await h.close();
  }
}

async function run() {
  await testSharedLimiter();
  await testSameAndDifferentIps();
  await testExpiredBucketsRemoved();
  await testLoginHttp();
  await testProductionNeverBypassesLoopback();
  await testDevE2eBypass();
  await testTrustProxySetting();
  await testLoginHttpRoute();
  await testTrustedProxyHttpIp();
  console.log("authRateLimit.test.js: all passed");
}

const { runTestMain } = require("./helpers/shutdown");

runTestMain(run);
