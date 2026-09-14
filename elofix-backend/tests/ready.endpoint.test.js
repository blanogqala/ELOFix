/**
 * /health and /ready probes.
 * Run: node tests/ready.endpoint.test.js
 */
require("dotenv").config();
const assert = require("assert");
const { listenApp, httpRequest } = require("./helpers/httpServer");
const { setRealtimeInitialized } = require("../src/utils/realtimeState.util");
const { setAppInitialized } = require("../src/services/readiness.service");

if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "test-file-access-secret-key";

async function run() {
  setRealtimeInitialized(false);
  const app = require("../src/app");
  const h = await listenApp(app);
  try {
    const health = await httpRequest(h.baseUrl, "GET", "/health");
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.ok, true);

    const notReady = await httpRequest(h.baseUrl, "GET", "/ready");
    const text = JSON.stringify(notReady.body);
    assert.ok(!text.includes("postgres://"));
    assert.ok(!text.toLowerCase().includes("jwt"));
    assert.ok(!/password|secret|access_key/i.test(text));
    assert.ok(notReady.body.checks);
    assert.strictEqual(notReady.body.checks.realtime, "not_ready");
    assert.ok(notReady.body.checks.storage === "ok" || notReady.body.checks.storage === "invalid");
    assert.strictEqual(notReady.status, 503);
    assert.strictEqual(notReady.body.status, "unavailable");

    setRealtimeInitialized(true);
    const ready = await httpRequest(h.baseUrl, "GET", "/ready");
    assert.ok(ready.body.checks.realtime === "ok");
    if (process.env.DATABASE_URL && ready.body.checks.storage === "ok" && ready.body.checks.config === "ok") {
      assert.strictEqual(ready.status, 200);
      assert.strictEqual(ready.body.checks.database, "ok");
      assert.strictEqual(ready.body.status, "ready");
    } else {
      assert.strictEqual(ready.status, 503);
    }
  } finally {
    setRealtimeInitialized(false);
    await h.close();
  }

  const readiness = require("../src/services/readiness.service");
  const prisma = require("../src/config/prisma");
  const original = prisma.$queryRaw;
  prisma.$queryRaw = async () => {
    throw new Error("db down");
  };
  try {
    setRealtimeInitialized(true);
    const down = await readiness.getReadiness();
    assert.strictEqual(down.httpStatus, 503);
    assert.strictEqual(down.body.checks.database, "unavailable");
    assert.ok(!JSON.stringify(down.body).includes("db down"));
  } finally {
    prisma.$queryRaw = original;
    setRealtimeInitialized(false);
    setAppInitialized(true);
  }

  const prevCors = {
    NODE_ENV: process.env.NODE_ENV,
    FRONTEND_URL: process.env.FRONTEND_URL,
    FRONTEND_BASE_URL: process.env.FRONTEND_BASE_URL,
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
  };
  process.env.NODE_ENV = "production";
  delete process.env.FRONTEND_URL;
  delete process.env.FRONTEND_BASE_URL;
  delete process.env.CORS_ALLOWED_ORIGINS;
  try {
    setRealtimeInitialized(true);
    const missingOrigins = await readiness.getReadiness();
    assert.strictEqual(missingOrigins.body.checks.config, "invalid");
    assert.strictEqual(missingOrigins.httpStatus, 503);
  } finally {
    process.env.NODE_ENV = prevCors.NODE_ENV;
    if (prevCors.FRONTEND_URL == null) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = prevCors.FRONTEND_URL;
    if (prevCors.FRONTEND_BASE_URL == null) delete process.env.FRONTEND_BASE_URL;
    else process.env.FRONTEND_BASE_URL = prevCors.FRONTEND_BASE_URL;
    if (prevCors.CORS_ALLOWED_ORIGINS == null) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = prevCors.CORS_ALLOWED_ORIGINS;
    setRealtimeInitialized(false);
  }

  console.log("ready.endpoint.test.js: all passed");
}

const { runTestMain } = require("./helpers/shutdown");

runTestMain(run);
