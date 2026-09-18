/**
 * Invoice read-model merge/flatten (no Prisma, no payment engine).
 * Run: node tests/invoiceReadModel.test.js
 */
const assert = require("assert");
const {
  flattenInvoicePayload,
  invoiceMatchesIntent,
  mergeStoredInvoicesWithPaidIntents,
  invoiceFromPaidIntent,
  synthesizedInvoiceId,
} = require("../src/services/invoiceReadModel");

{
  const old = flattenInvoicePayload({
    id: "legacy-1",
    jobId: "job-1",
    userId: "u1",
    type: "labor",
    status: "paid",
    totalAmount: 50,
    paidAt: "2026-01-01T00:00:00.000Z",
  });
  assert.strictEqual(old.id, "legacy-1");
  assert.strictEqual(old.jobId, "job-1");
  assert.strictEqual(old.materialOrderId, undefined);
}

{
  const stored = flattenInvoicePayload({
    id: "stored-1",
    jobId: "job-1",
    type: "labor",
    totalAmount: 50,
    meta: { paymentIntentId: "pi-1", paymentType: "DEPOSIT" },
  });
  assert.strictEqual(stored.paymentIntentId, "pi-1");
  assert.strictEqual(stored.paymentType, "DEPOSIT");
  assert.strictEqual(
    invoiceMatchesIntent(stored, { id: "pi-1", kind: "LABOR", amount: 50, jobId: "job-1", paymentType: "DEPOSIT" }),
    true
  );
}

{
  const intent = {
    id: "pi-new",
    kind: "MATERIAL_ORDER",
    amount: 200,
    userId: "u1",
    materialOrderId: "mo-9",
    jobId: null,
    paymentType: "MATERIAL_ORDER",
    state: "PAID",
    paidAt: "2026-09-14T00:00:00.000Z",
    materialOrder: { id: "mo-9", jobId: null, payload: { storeName: "ABC Materials" } },
  };
  const synthesized = invoiceFromPaidIntent(intent);
  assert.strictEqual(synthesized.id, synthesizedInvoiceId("pi-new"));
  assert.strictEqual(synthesized.type, "materials");
  assert.strictEqual(synthesized.materialOrderId, "mo-9");
  assert.strictEqual(synthesized.storeName, "ABC Materials");
  assert.strictEqual(synthesized.jobId, "");
}

{
  const stored = [
    {
      id: "legacy-labor",
      jobId: "job-1",
      type: "labor",
      totalAmount: 50,
      paidAt: "2026-09-01T00:00:00.000Z",
    },
  ];
  const intents = [
    {
      id: "pi-dep",
      kind: "LABOR",
      amount: 50,
      jobId: "job-1",
      paymentType: "DEPOSIT",
      userId: "u1",
      paidAt: "2026-09-01T00:00:00.000Z",
      job: { id: "job-1", title: "Tiling" },
    },
    {
      id: "pi-comp",
      kind: "LABOR",
      amount: 50,
      jobId: "job-1",
      paymentType: "COMPLETION",
      userId: "u1",
      paidAt: "2026-09-10T00:00:00.000Z",
      job: { id: "job-1", title: "Tiling" },
    },
  ];
  const merged = mergeStoredInvoicesWithPaidIntents(stored, intents);
  assert.strictEqual(merged.length, 2);
  assert.ok(merged.some((i) => i.id === "legacy-labor"));
  assert.ok(merged.some((i) => i.id === synthesizedInvoiceId("pi-comp")));
}

console.log("invoiceReadModel.test.js: ok");
