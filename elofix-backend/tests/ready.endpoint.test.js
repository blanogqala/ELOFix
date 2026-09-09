/**
 * /health and /ready probes.
 * Run: node tests/ready.endpoint.test.js
 */
require("dotenv").config();
const assert = require("assert");
const { listenApp, httpRequest } = require("./helpers/httpServer");

if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "test-file-access-secret-key";

async function run() {
  const app = require("../src/app");
  const h = await listenApp(app);
  try {
    const health = await httpRequest(h.baseUrl, "GET", "/health");
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.ok, true);

    const ready = await httpRequest(h.baseUrl, "GET", "/ready");
    const text = JSON.stringify(ready.body);
    assert.ok(!text.includes("postgres://"));
    assert.ok(!text.toLowerCase().includes("jwt"));
    assert.ok(!/password|secret|access_key/i.test(text));
    assert.ok(ready.body.checks);
    assert.ok(ready.body.status === "ready" || ready.body.status === "unavailable");
    if (process.env.DATABASE_URL) {
      assert.strictEqual(ready.status, 200);
      assert.strictEqual(ready.body.checks.database, "ok");
    } else {
      assert.strictEqual(ready.status, 503);
      assert.strictEqual(ready.body.checks.database, "unavailable");
    }
  } finally {
    await h.close();
  }

  const readiness = require("../src/services/readiness.service");
  const prisma = require("../src/config/prisma");
  const original = prisma.$queryRaw;
  prisma.$queryRaw = async () => {
    throw new Error("db down");
  };
  try {
    const down = await readiness.getReadiness();
    assert.strictEqual(down.httpStatus, 503);
    assert.strictEqual(down.body.checks.database, "unavailable");
    assert.ok(!JSON.stringify(down.body).includes("db down"));
  } finally {
    prisma.$queryRaw = original;
  }

  console.log("ready.endpoint.test.js: all passed");
}

const { runTestMain } = require("./helpers/shutdown");

runTestMain(run);
