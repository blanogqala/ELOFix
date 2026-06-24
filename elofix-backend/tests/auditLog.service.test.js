/**
 * Audit log service tests.
 * Run: node tests/auditLog.service.test.js
 */
require("dotenv").config();
const assert = require("assert");
const { logAudit } = require("../src/services/auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES, ACTOR_TYPES } = require("../src/constants/auditActions");

async function testStructuredAuditPersistence() {
  const prisma = require("../src/config/prisma");
  const action = `test.audit.${Date.now()}`;
  await logAudit(action, {
    userId: null,
    actorType: ACTOR_TYPES.SYSTEM,
    entityType: ENTITY_TYPES.JOB,
    entityId: "test-job-id",
    oldValue: { score: 10 },
    newValue: { score: 20 },
    ipAddress: "203.0.113.1",
    deviceFingerprint: "fp-test-123",
  });

  const row = await prisma.auditLog.findFirst({
    where: { action },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(row, "audit row should exist");
  assert.strictEqual(row.actorType, ACTOR_TYPES.SYSTEM);
  assert.strictEqual(row.entityType, ENTITY_TYPES.JOB);
  assert.strictEqual(row.entityId, "test-job-id");
  assert.strictEqual(row.ipAddress, "203.0.113.1");
  assert.strictEqual(row.deviceFingerprint, "fp-test-123");
  assert.deepStrictEqual(row.oldValue, { score: 10 });
  assert.deepStrictEqual(row.newValue, { score: 20 });

  await prisma.auditLog.delete({ where: { id: row.id } });
}

async function testMetadataBackwardCompat() {
  const prisma = require("../src/config/prisma");
  const action = `test.audit.metadata.${Date.now()}`;
  await logAudit("legacy.action", {
    metadata: { foo: "bar", action },
  });

  const row = await prisma.auditLog.findFirst({
    where: { action: "legacy.action", newValue: { path: ["action"], equals: action } },
  });
  assert.ok(row, "legacy metadata should land in newValue");
  assert.deepStrictEqual(row.newValue.foo, "bar");

  await prisma.auditLog.delete({ where: { id: row.id } });
}

async function main() {
  await testStructuredAuditPersistence();
  await testMetadataBackwardCompat();
  console.log("auditLog.service.test.js: all tests passed");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      const prisma = require("../src/config/prisma");
      await prisma.$disconnect();
    } catch (_) {
      /* ignore */
    }
  });
