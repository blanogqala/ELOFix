/**
 * Notification hardening tests (unit + optional DB integration).
 * Run: node tests/notifications.hardening.test.js
 */
require("dotenv").config();
const assert = require("assert");
const { randomUUID } = require("crypto");

const notificationEvents = require("../src/services/notificationEvents.service");
const { buildNotificationData } = require("../src/services/notification.service");
const outboxService = require("../src/services/notificationDeliveryOutbox.service");
const { AUDIT_ACTIONS } = require("../src/constants/auditActions");

function testRefundHandlersExported() {
  assert.strictEqual(typeof notificationEvents.notifyCustomerRefundProcessed, "function");
  assert.strictEqual(typeof notificationEvents.notifyProviderRefundClawback, "function");
  assert.strictEqual(typeof notificationEvents.queueEmail, "function");
}

function testDedupeKeyHelpers() {
  assert.strictEqual(notificationEvents.jobDedupe("job-1", "payment_made"), "job:job-1:payment_made");
  assert.strictEqual(
    notificationEvents.materialOrderDedupe("ord-1", "delivery_quote"),
    "material_order:ord-1:delivery_quote"
  );
  assert.strictEqual(notificationEvents.jobDedupe(null, "x"), null);
}

function testBuildNotificationDataMaterialOrderId() {
  const data = buildNotificationData({
    userId: "user-1",
    type: "delivery_quote",
    title: "Quote",
    message: "Test",
    materialOrderId: "order-abc",
    dedupeKey: "material_order:order-abc:delivery_quote",
  });
  assert.strictEqual(data.materialOrderId, "order-abc");
  assert.strictEqual(data.dedupeKey, "material_order:order-abc:delivery_quote");
}

function testAuditActionsPresent() {
  assert.ok(AUDIT_ACTIONS.NOTIFICATION_CREATED);
  assert.ok(AUDIT_ACTIONS.NOTIFICATION_DEDUPED);
  assert.ok(AUDIT_ACTIONS.NOTIFICATION_SOCKET_SENT);
  assert.ok(AUDIT_ACTIONS.NOTIFICATION_EMAIL_SENT);
  assert.ok(AUDIT_ACTIONS.NOTIFICATION_DELIVERY_FAILED);
}

function testOutboxBackoffSchedule() {
  assert.strictEqual(outboxService.BACKOFF_MS.length, 5);
  assert.ok(outboxService.BACKOFF_MS[0] >= 30_000);
}

async function testSocketEmitRequiresIo() {
  const prev = global.io;
  global.io = undefined;
  try {
    let threw = false;
    try {
      outboxService.trySocketEmit({ userId: "u1", event: "notification:new", data: {} });
    } catch (e) {
      threw = true;
      assert.ok(String(e.message).includes("Socket.IO"));
    }
    assert.strictEqual(threw, true);
  } finally {
    global.io = prev;
  }
}

async function runDbIntegrationTests() {
  const prisma = require("../src/config/prisma");
  const notificationService = require("../src/services/notification.service");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `notif-hardening-${suffix}@example.com`;
  let userId = null;
  const notificationIds = [];
  const outboxIds = [];

  try {
    const user = await prisma.user.create({
      data: {
        email,
        password: "hashed-placeholder",
        name: "Notif Test",
        role: "CUSTOMER",
      },
    });
    userId = user.id;

    const dedupeKey = `test:dedupe:${suffix}`;
    const first = await notificationService.addNotification({
      userId,
      type: "job_completed",
      title: "First",
      message: "One",
      dedupeKey,
    });
    const second = await notificationService.addNotification({
      userId,
      type: "job_completed",
      title: "Second",
      message: "Two",
      dedupeKey,
    });
    notificationIds.push(first.id, second.id);
    assert.strictEqual(first.id, second.id, "dedupe should return same notification");

    const count = await prisma.notification.count({
      where: { userId, dedupeKey },
    });
    assert.strictEqual(count, 1, "only one row for dedupe key");

    const quote = await notificationService.addNotification({
      userId,
      type: "delivery_quote",
      title: "Quote",
      message: "Fee",
      materialOrderId: `mo-${suffix}`,
      dedupeKey: `material_order:mo-${suffix}:delivery_quote`,
    });
    notificationIds.push(quote.id);
    assert.strictEqual(quote.materialOrderId, `mo-${suffix}`);

    const outbox = await outboxService.enqueueSocketDelivery({
      notificationId: quote.id,
      userId,
      event: "notification:new",
      payload: quote,
    });
    outboxIds.push(outbox.id);

    await prisma.notificationDeliveryOutbox.update({
      where: { id: outbox.id },
      data: { maxAttempts: 1, nextAttemptAt: new Date(0) },
    });

    const stats = await outboxService.processOutboxBatch(10);
    assert.ok(stats.processed >= 1);

    const deadRow = await prisma.notificationDeliveryOutbox.findUnique({ where: { id: outbox.id } });
    assert.strictEqual(deadRow.status, "DEAD", "socket without io should end DEAD after max attempts");
  } finally {
    if (outboxIds.length) {
      await prisma.notificationDeliveryOutbox.deleteMany({ where: { id: { in: outboxIds } } }).catch(() => {});
    }
    if (notificationIds.length) {
      await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } }).catch(() => {});
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await prisma.$disconnect().catch(() => {});
  }
}

async function main() {
  testRefundHandlersExported();
  testDedupeKeyHelpers();
  testBuildNotificationDataMaterialOrderId();
  testAuditActionsPresent();
  testOutboxBackoffSchedule();
  await testSocketEmitRequiresIo();

  if (process.env.DATABASE_URL) {
    await runDbIntegrationTests();
    console.log("notifications.hardening.test.js: OK (with DB integration)");
  } else {
    console.log("notifications.hardening.test.js: OK (unit only, DATABASE_URL not set)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
