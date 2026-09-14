/**
 * Socket.IO authorization + CORS + JWT handshake.
 * Run: node tests/socketIo.authorization.test.js
 */
require("dotenv").config();
const assert = require("assert");
const http = require("http");
const jwt = require("jsonwebtoken");
const { attachSocketIo } = require("../src/socket/attachSocketIo");
const { setRealtimeInitialized, isRealtimeInitialized } = require("../src/utils/realtimeState.util");
const { getReadiness } = require("../src/services/readiness.service");

if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "test-socket-auth-secret-key";

function loadClient() {
  try {
    return require("socket.io-client");
  } catch {
    throw new Error("socket.io-client is required for socketIo.authorization.test.js");
  }
}

function tokenFor(sub, role, extra = {}) {
  return jwt.sign({ sub, role, ...extra }, process.env.JWT_SECRET);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function connectClient(url, opts = {}) {
  const { io } = loadClient();
  return io(url, {
    path: "/socket.io",
    transports: ["polling", "websocket"],
    reconnection: false,
    timeout: 8000,
    forceNew: true,
    ...opts,
  });
}

function waitConnected(socket, ms = 8000) {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }
    const timer = setTimeout(() => reject(new Error("connect timeout")), ms);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitConnectError(socket, ms = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("expected connect_error")), ms);
    socket.once("connect", () => {
      clearTimeout(timer);
      reject(new Error("connected but expected rejection"));
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      resolve(err);
    });
  });
}

function firstSocket(io) {
  const sockets = [...io.sockets.sockets.values()];
  assert.ok(sockets.length >= 1, "expected a connected socket");
  return sockets[sockets.length - 1];
}

async function withServer(trackingService, fn) {
  const prevFrontend = process.env.FRONTEND_URL;
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "https://elofix.co.za";
  const server = http.createServer((_req, res) => {
    res.end("ok");
  });
  const { io } = attachSocketIo(server, { trackingService });
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const clients = [];
  try {
    await fn({
      io,
      origin,
      client(opts) {
        const c = connectClient(origin, opts);
        clients.push(c);
        return c;
      },
    });
  } finally {
    for (const c of clients) {
      try {
        c.removeAllListeners();
        c.disconnect();
        c.close();
      } catch {
        /* ignore */
      }
    }
    await new Promise((resolve) => {
      io.close(() => resolve());
    });
    await new Promise((resolve) => server.close(() => resolve()));
    setRealtimeInitialized(false);
    process.env.FRONTEND_URL = prevFrontend;
    process.env.NODE_ENV = prevNodeEnv;
  }
}

function mockTracking(overrides = {}) {
  const calls = { persistDriver: 0, persistDelivery: 0 };
  return {
    calls,
    canUserAccessOrderRoom: async () => false,
    canUserPostDriverLocation: async () => false,
    canUserPostDeliveryRequestLocation: async () => false,
    persistAndEmitDriverLocation: async () => {
      calls.persistDriver++;
    },
    persistAndEmitDeliveryRequestLocation: async () => {
      calls.persistDelivery++;
    },
    ...overrides,
  };
}

async function testRealtimeReadinessAroundInit() {
  setRealtimeInitialized(false);
  const before = await getReadiness();
  assert.strictEqual(before.body.checks.realtime, "not_ready");
  assert.notStrictEqual(before.body.checks.realtime, "ok");

  await withServer(mockTracking(), async () => {
    assert.strictEqual(isRealtimeInitialized(), true);
    const after = await getReadiness();
    assert.strictEqual(after.body.checks.realtime, "ok");
  });

  assert.strictEqual(isRealtimeInitialized(), false);
  const again = await getReadiness();
  assert.strictEqual(again.body.checks.realtime, "not_ready");
}

async function testJwtAppliedOnConnect() {
  await withServer(mockTracking(), async ({ io, client }) => {
    const t = tokenFor("user-1", "CUSTOMER");
    const c = client({ auth: { token: t } });
    await waitConnected(c);
    const s = firstSocket(io);
    assert.strictEqual(s.userId, "user-1");
    assert.strictEqual(s.userRole, "CUSTOMER");
  });
}

async function testInvalidTokenRejected() {
  await withServer(mockTracking(), async ({ client }) => {
    const c = client({ auth: { token: "not-a-jwt" } });
    await waitConnectError(c);
  });
}

async function testUnauthorizedUserRoomJoinRejected() {
  await withServer(mockTracking(), async ({ io, client }) => {
    const c = client({ auth: { token: tokenFor("user-1", "CUSTOMER") } });
    await waitConnected(c);
    c.emit("join", "user-2");
    await wait(150);
    const s = firstSocket(io);
    assert.ok(!s.rooms.has("user-2"));
    assert.ok(!s.rooms.has("admin"));
  });
}

async function testPayloadRoleCannotGrantAdmin() {
  await withServer(mockTracking(), async ({ io, client }) => {
    const c = client({ auth: { token: tokenFor("user-1", "CUSTOMER") } });
    await waitConnected(c);
    c.emit("join", { userId: "user-1", role: "ADMIN" });
    await wait(150);
    const s = firstSocket(io);
    assert.ok(s.rooms.has("user-1"));
    assert.ok(!s.rooms.has("admin"));
  });
}

async function testAdminJoinUsesJwtRole() {
  await withServer(mockTracking(), async ({ io, client }) => {
    const c = client({ auth: { token: tokenFor("admin-1", "ADMIN") } });
    await waitConnected(c);
    c.emit("join", "admin-1");
    await wait(150);
    const s = firstSocket(io);
    assert.ok(s.rooms.has("admin-1"));
    assert.ok(s.rooms.has("admin"));
  });
}

async function testUnauthorizedOrderJoinRejected() {
  const tracking = mockTracking({
    canUserAccessOrderRoom: async () => false,
  });
  await withServer(tracking, async ({ io, client }) => {
    const c = client({ auth: { token: tokenFor("user-1", "CUSTOMER") } });
    await waitConnected(c);
    c.emit("order:join", "order-secret");
    await wait(150);
    const s = firstSocket(io);
    assert.ok(!s.rooms.has("order-secret"));
  });
}

async function testAuthorizedOrderJoinSucceeds() {
  const tracking = mockTracking({
    canUserAccessOrderRoom: async (userId, role, orderId) =>
      userId === "user-1" && String(role) === "CUSTOMER" && orderId === "order-ok",
  });
  await withServer(tracking, async ({ io, client }) => {
    const c = client({ auth: { token: tokenFor("user-1", "CUSTOMER") } });
    await waitConnected(c);
    c.emit("order:join", "order-ok");
    await wait(150);
    const s = firstSocket(io);
    assert.ok(s.rooms.has("order-ok"));
  });
}

async function testUnauthorizedLocationPublishRejected() {
  const tracking = mockTracking();
  await withServer(tracking, async ({ client }) => {
    const c = client({ auth: { token: tokenFor("user-1", "CUSTOMER") } });
    await waitConnected(c);
    c.emit("update_location", {
      orderId: "order-1",
      lat: -26.2,
      lng: 28.0,
      role: "PROVIDER",
      userId: "courier-1",
    });
    await wait(150);
    assert.strictEqual(tracking.calls.persistDriver, 0);
    assert.strictEqual(tracking.calls.persistDelivery, 0);
  });
}

async function testAuthorizedLocationPublishUsesJwtRole() {
  const tracking = mockTracking({
    canUserPostDriverLocation: async (userId, role) => userId === "prov-1" && role === "PROVIDER",
  });
  await withServer(tracking, async ({ client }) => {
    const c = client({ auth: { token: tokenFor("prov-1", "PROVIDER") } });
    await waitConnected(c);
    c.emit("update_location", {
      orderId: "order-1",
      lat: -26.2,
      lng: 28.0,
      role: "ADMIN",
    });
    await wait(150);
    assert.strictEqual(tracking.calls.persistDriver, 1);
  });
}

async function testAllowedOriginAccepted() {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  process.env.FRONTEND_URL = "https://elofix.co.za";
  try {
    await withServer(mockTracking(), async ({ client }) => {
      const c = client({
        extraHeaders: { Origin: "https://elofix.co.za" },
        auth: { token: tokenFor("user-1", "CUSTOMER") },
      });
      await waitConnected(c);
    });
  } finally {
    process.env.NODE_ENV = prev;
  }
}

async function testDisallowedOriginRejected() {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  process.env.FRONTEND_URL = "https://elofix.co.za";
  try {
    await withServer(mockTracking(), async ({ client }) => {
      const c = client({
        extraHeaders: { Origin: "https://evil.example" },
        auth: { token: tokenFor("user-1", "CUSTOMER") },
      });
      await waitConnectError(c);
    });
  } finally {
    process.env.NODE_ENV = prev;
  }
}

async function run() {
  await testRealtimeReadinessAroundInit();
  await testJwtAppliedOnConnect();
  await testInvalidTokenRejected();
  await testUnauthorizedUserRoomJoinRejected();
  await testPayloadRoleCannotGrantAdmin();
  await testAdminJoinUsesJwtRole();
  await testUnauthorizedOrderJoinRejected();
  await testAuthorizedOrderJoinSucceeds();
  await testUnauthorizedLocationPublishRejected();
  await testAuthorizedLocationPublishUsesJwtRole();
  await testAllowedOriginAccepted();
  await testDisallowedOriginRejected();
  console.log("socketIo.authorization.test.js: all passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
