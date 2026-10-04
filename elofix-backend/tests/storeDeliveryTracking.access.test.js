/**
 * Store-delivery GPS write access. Customer responses must not carry the tracking token,
 * and only supplier / branch staff may publish location.
 */
require("dotenv").config();
const assert = require("assert");
const { randomUUID } = require("crypto");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const { listenApp, httpRequest } = require("./helpers/httpServer");
const { runTestMain } = require("./helpers/shutdown");
const {
  redactGpsWriteCredential,
  roleMayPublishStoreGps,
} = require("../src/utils/storeTrackingAccess.util");

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role, branchId: user.branchId },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function testRedaction() {
  const order = { id: "o1", activeTrackingToken: "secret-token", activeTrackingId: "track-1" };
  const customer = redactGpsWriteCredential(order, "CUSTOMER");
  assert.strictEqual(Object.prototype.hasOwnProperty.call(customer, "activeTrackingToken"), false);
  assert.strictEqual(customer.activeTrackingId, "track-1");
  assert.strictEqual(redactGpsWriteCredential(order, "USER").activeTrackingToken, undefined);
  assert.strictEqual(redactGpsWriteCredential(order, "SUPPLIER").activeTrackingToken, "secret-token");
  assert.strictEqual(redactGpsWriteCredential(order, "BRANCH_STAFF").activeTrackingToken, "secret-token");
  assert.strictEqual(roleMayPublishStoreGps("CUSTOMER"), false);
  assert.strictEqual(roleMayPublishStoreGps("PROVIDER"), false);
  assert.strictEqual(roleMayPublishStoreGps("BRANCH_STAFF"), true);
  assert.strictEqual(roleMayPublishStoreGps("SUPPLIER"), true);
}

async function testHttp(baseUrl) {
  const anon = await httpRequest(baseUrl, "POST", "/api/tracking/update", {
    json: { trackingId: randomUUID(), lat: -33.9, lng: 18.4, token: "nope" },
  });
  assert.strictEqual(anon.status, 401, "anonymous viewer must not publish GPS");

  if (!process.env.DATABASE_URL) {
    console.log("storeDeliveryTracking.access.test.js: skip DB publish cases");
    return;
  }

  const prisma = require("../src/config/prisma");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = "hashed-placeholder";
  let customer;
  let staff;
  let supplier;
  let branch;
  let orderId;
  try {
    customer = await prisma.user.create({
      data: {
        email: `track-cust-${suffix}@example.com`,
        password,
        name: "Track Customer",
        role: "CUSTOMER",
      },
    });
    const supplierUser = await prisma.user.create({
      data: {
        email: `track-sup-${suffix}@example.com`,
        password,
        name: "Track Supplier",
        role: "SUPPLIER",
      },
    });
    supplier = await prisma.supplier.create({
      data: { name: `Track Supplier ${suffix}`, userId: supplierUser.id },
    });
    branch = await prisma.branch.create({
      data: { supplierId: supplier.id, name: `Track Branch ${suffix}`, address: "1 Store Rd" },
    });
    staff = await prisma.branchUser.create({
      data: {
        branchId: branch.id,
        email: `track-staff-${suffix}@example.com`,
        password,
        role: "STAFF",
      },
    });
    orderId = randomUUID();
    await prisma.materialOrder.create({
      data: {
        id: orderId,
        userId: customer.id,
        supplierId: supplier.id,
        branchId: branch.id,
        source: "store_checkout",
        paymentStatus: "paid",
        fulfillmentStatus: "OUT_FOR_DELIVERY",
        payload: {
          deliveryType: "STORE_DELIVERY",
          items: [],
          payment: { materialsPaid: true, deliveryPaid: true },
        },
      },
    });
    const trackingId = randomUUID();
    const accessToken = randomUUID();
    await prisma.trackingSession.create({
      data: {
        orderId,
        trackingId,
        accessToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        isActive: true,
        currentTrackingSource: "supplier",
      },
    });

    const customerJwt = signToken({
      id: customer.id,
      email: customer.email,
      name: customer.name,
      role: "CUSTOMER",
    });
    const staffJwt = signToken({
      id: staff.id,
      email: staff.email,
      name: "Staff",
      role: "BRANCH_STAFF",
      branchId: branch.id,
    });

    const customerOrder = await httpRequest(baseUrl, "GET", `/api/material-orders/${orderId}`, {
      headers: { Authorization: `Bearer ${customerJwt}` },
    });
    assert.strictEqual(customerOrder.status, 200);
    assert.strictEqual(customerOrder.body.order.activeTrackingToken, undefined);
    assert.ok(customerOrder.body.order.activeTrackingId);

    const customerPost = await httpRequest(baseUrl, "POST", "/api/tracking/update", {
      headers: { Authorization: `Bearer ${customerJwt}` },
      json: { trackingId, lat: -33.9, lng: 18.4, token: accessToken },
    });
    assert.strictEqual(customerPost.status, 403, "customer must not overwrite driver GPS");

    const first = await httpRequest(baseUrl, "POST", "/api/tracking/update", {
      headers: { Authorization: `Bearer ${staffJwt}` },
      json: { trackingId, lat: -33.9, lng: 18.4, token: accessToken },
    });
    assert.strictEqual(first.status, 200, `staff publish failed: ${first.text}`);

    const latest1 = await httpRequest(baseUrl, "GET", `/api/tracking/latest/${orderId}`, {
      headers: { Authorization: `Bearer ${customerJwt}` },
    });
    assert.strictEqual(latest1.status, 200);
    assert.strictEqual(latest1.body.lastLat, -33.9);
    assert.strictEqual(latest1.body.lastLng, 18.4);
    const firstPing = latest1.body.lastPingAt;

    const same = await httpRequest(baseUrl, "POST", "/api/tracking/update", {
      headers: { Authorization: `Bearer ${staffJwt}` },
      json: { trackingId, lat: -33.9, lng: 18.4, token: accessToken },
    });
    assert.strictEqual(same.status, 200);
    const latestSame = await httpRequest(baseUrl, "GET", `/api/tracking/latest/${orderId}`, {
      headers: { Authorization: `Bearer ${customerJwt}` },
    });
    assert.strictEqual(latestSame.body.lastPingAt, firstPing, "unchanged GPS must not refresh lastPingAt");

    const moved = await httpRequest(baseUrl, "POST", "/api/tracking/update", {
      headers: { Authorization: `Bearer ${staffJwt}` },
      json: { trackingId, lat: -33.92, lng: 18.45, token: accessToken },
    });
    assert.strictEqual(moved.status, 200);
    const latest2 = await httpRequest(baseUrl, "GET", `/api/tracking/latest/${orderId}`, {
      headers: { Authorization: `Bearer ${customerJwt}` },
    });
    assert.strictEqual(latest2.body.lastLat, -33.92);
    assert.strictEqual(latest2.body.lastLng, 18.45);
    assert.notStrictEqual(latest2.body.lastPingAt, firstPing);
  } finally {
    if (orderId) {
      await prisma.trackingSession.deleteMany({ where: { orderId } });
      await prisma.materialOrder.deleteMany({ where: { id: orderId } });
    }
    if (staff) await prisma.branchUser.deleteMany({ where: { id: staff.id } });
    if (branch) await prisma.branch.deleteMany({ where: { id: branch.id } });
    if (supplier) {
      const supplierUserId = supplier.userId;
      await prisma.supplier.deleteMany({ where: { id: supplier.id } });
      if (supplierUserId) await prisma.user.deleteMany({ where: { id: supplierUserId } });
    }
    if (customer) await prisma.user.deleteMany({ where: { id: customer.id } });
  }
}

async function run() {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "store-tracking-test-secret";
  }
  testRedaction();
  const started = await listenApp(app);
  try {
    await testHttp(started.baseUrl);
  } finally {
    await started.close();
  }
  console.log("storeDeliveryTracking.access.test.js: all passed");
}

runTestMain(run);
