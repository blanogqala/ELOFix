/**
 * Admin audit log API tests.
 * Run: node tests/auditLogAdmin.test.js
 */
require("dotenv").config();
const assert = require("assert");
const {
  listAuditLogs,
  exportAuditLogsCsv,
  EXPORT_MAX_ROWS,
} = require("../src/services/auditLogAdmin.service");
const { logAudit } = require("../src/services/auditLog.service");
const { ENTITY_TYPES } = require("../src/constants/auditActions");

async function seedRow(action, entityType, entityId) {
  await logAudit(action, {
    entityType,
    entityId,
    newValue: { seeded: true },
  });
}

async function testListAndFilter() {
  const tag = `admin.audit.test.${Date.now()}`;
  await seedRow(`${tag}.payment`, ENTITY_TYPES.PAYMENT, `pay-${tag}`);
  await seedRow(`${tag}.dispute`, ENTITY_TYPES.DISPUTE, `disp-${tag}`);

  const paymentOnly = await listAuditLogs({ entityType: "payment", search: tag, limit: 20 });
  assert.ok(paymentOnly.items.some((r) => r.action === `${tag}.payment`));
  assert.ok(!paymentOnly.items.some((r) => r.action === `${tag}.dispute`));

  const bySearch = await listAuditLogs({ search: `disp-${tag}`, limit: 10 });
  assert.ok(bySearch.items.some((r) => r.entityId === `disp-${tag}`));
}

async function testCsvExport() {
  const tag = `csv.export.${Date.now()}`;
  await seedRow(`${tag}.auth`, ENTITY_TYPES.USER, `user-${tag}`);

  const { csv, truncated, rowCount } = await exportAuditLogsCsv({ search: tag });
  assert.ok(csv.includes("Time,Actor,Actor Type,Action"));
  assert.ok(csv.includes(`${tag}.auth`));
  assert.strictEqual(truncated, false);
  assert.ok(rowCount >= 1);
  assert.ok(EXPORT_MAX_ROWS > 0);
}

async function main() {
  await testListAndFilter();
  await testCsvExport();
  console.log("auditLogAdmin.test.js: all tests passed");
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
