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
  paymentMethodLabelFromIntent,
} = require("../src/services/invoiceReadModel");

function laborIntent(over) {
  return {
    id: "pi-1",
    kind: "LABOR",
    amount: 50,
    jobId: "job-1",
    userId: "u1",
    provider: "PAYSTACK",
    ...over,
  };
}

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
    invoiceMatchesIntent(stored, laborIntent({ id: "pi-1", paymentType: "DEPOSIT" })),
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
    provider: "PAYSTACK",
    paidAt: "2026-09-14T00:00:00.000Z",
    materialOrder: { id: "mo-9", jobId: null, payload: { storeName: "ABC Materials" } },
  };
  const synthesized = invoiceFromPaidIntent(intent);
  assert.strictEqual(synthesized.id, synthesizedInvoiceId("pi-new"));
  assert.strictEqual(synthesized.type, "materials");
  assert.strictEqual(synthesized.materialOrderId, "mo-9");
  assert.strictEqual(synthesized.storeName, "ABC Materials");
  assert.strictEqual(synthesized.jobId, "");
  assert.notStrictEqual(String(synthesized.paymentMethod || "").toLowerCase(), "card");
}

{
  const deposit = laborIntent({
    id: "pi-dep",
    paymentType: "DEPOSIT",
    paidAt: "2026-09-14T10:00:00.000Z",
    job: { id: "job-1", title: "Tiling" },
  });
  const completion = laborIntent({
    id: "pi-comp",
    paymentType: "COMPLETION",
    paidAt: "2026-09-16T10:00:00.000Z",
    job: { id: "job-1", title: "Tiling" },
  });
  const legacy = {
    id: "legacy-labor",
    jobId: "job-1",
    type: "labor",
    totalAmount: 50,
    paidAt: "2026-09-01T00:00:00.000Z",
  };
  const siblings = [completion, deposit];
  assert.strictEqual(
    invoiceMatchesIntent(legacy, completion, { siblingIntents: siblings, unusedInvoices: [legacy] }),
    false,
    "must not assign legacy R50 to Completion because it is newest"
  );
  assert.strictEqual(
    invoiceMatchesIntent(legacy, deposit, { siblingIntents: siblings, unusedInvoices: [legacy] }),
    false,
    "ambiguous equal amount must not guess deposit either"
  );

  const mergedNewestFirst = mergeStoredInvoicesWithPaidIntents([legacy], [completion, deposit]);
  assert.strictEqual(mergedNewestFirst.length, 2);
  assert.ok(!mergedNewestFirst.some((i) => i.id === "legacy-labor" && i.paymentType === "COMPLETION"));
  assert.ok(mergedNewestFirst.some((i) => i.paymentIntentId === "pi-dep" && i.paymentType === "DEPOSIT"));
  assert.ok(mergedNewestFirst.some((i) => i.paymentIntentId === "pi-comp" && i.paymentType === "COMPLETION"));
}

{
  const deposit = laborIntent({ id: "pi-dep", paymentType: "DEPOSIT" });
  const completion = laborIntent({ id: "pi-comp", paymentType: "COMPLETION" });
  const staged = {
    id: "stored-dep",
    jobId: "job-1",
    type: "labor",
    totalAmount: 50,
    paymentType: "DEPOSIT",
  };
  assert.strictEqual(
    invoiceMatchesIntent(staged, deposit, {
      siblingIntents: [deposit, completion],
      unusedInvoices: [staged],
    }),
    true
  );
  assert.strictEqual(
    invoiceMatchesIntent(staged, completion, {
      siblingIntents: [deposit, completion],
      unusedInvoices: [staged],
    }),
    false
  );
}

{
  const exact = {
    id: "stored-pi",
    jobId: "job-1",
    type: "labor",
    totalAmount: 50,
    paymentIntentId: "pi-exact",
  };
  assert.strictEqual(invoiceMatchesIntent(exact, laborIntent({ id: "pi-exact" })), true);
  assert.strictEqual(invoiceMatchesIntent(exact, laborIntent({ id: "pi-other" })), false);
}

{
  const unique = {
    id: "stored-80",
    jobId: "job-1",
    type: "labor",
    totalAmount: 80,
  };
  const only = laborIntent({ id: "pi-80", amount: 80, paymentType: "FULL_UPFRONT" });
  assert.strictEqual(
    invoiceMatchesIntent(unique, only, { siblingIntents: [only], unusedInvoices: [unique] }),
    true
  );
}

{
  assert.strictEqual(
    paymentMethodLabelFromIntent({ provider: "PAYSTACK", gatewayPayload: {} }),
    "Paystack"
  );
  const noChannel = invoiceFromPaidIntent(
    laborIntent({ id: "pi-nc", provider: "PAYSTACK", gatewayPayload: { reference: "EF-1" } })
  );
  assert.notStrictEqual(String(noChannel.paymentMethod).toLowerCase(), "card");
  assert.strictEqual(noChannel.paymentMethod, "Paystack");
  assert.strictEqual(noChannel.cardLast4, undefined);

  const cardChannel = invoiceFromPaidIntent(
    laborIntent({
      id: "pi-card",
      provider: "PAYSTACK",
      cardLast4: "4242",
      gatewayPayload: { channel: "card", card_last4: "4242" },
    })
  );
  assert.strictEqual(cardChannel.paymentMethod, "Card");
  assert.strictEqual(cardChannel.cardLast4, "4242");

  const bankChannel = invoiceFromPaidIntent(
    laborIntent({
      id: "pi-bank",
      provider: "PAYSTACK",
      gatewayPayload: { channel: "bank_transfer" },
    })
  );
  assert.strictEqual(bankChannel.paymentMethod, "Bank");
}

console.log("invoiceReadModel.test.js: ok");
