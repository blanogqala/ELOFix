const assert = require("assert");
const { assertJobStorePaymentIntent } = require("../src/utils/jobStorePaymentIntent.util");
const { resolveStoreCheckoutPayment } = require("../src/utils/materialOrderCreatePayment.util");

const WEBHOOK_ALREADY_APPLIED = /already|paid|no longer active/i;

function receipt(overrides = {}) {
  return {
    state: "PAID",
    kind: "JOB_STORE_ORDER",
    jobId: "job-1",
    userId: "customer-1",
    amount: 50,
    gatewayPayload: { supplierId: "store-a", orderId: "order-a" },
    ...overrides,
  };
}

function batch(overrides = {}) {
  return {
    orderId: "order-a",
    storeId: "store-a",
    items: [{ qty: 1, unitPrice: 50 }],
    deliveryFee: 0,
    ...overrides,
  };
}

const job = { id: "job-1", customerId: "customer-1" };

(async () => {
  assertJobStorePaymentIntent(receipt(), { job, storeId: "store-a", order: batch() });
  assertJobStorePaymentIntent(receipt({ amount: 120 }), {
    job,
    storeId: "store-a",
    order: batch({ items: [{ qty: 2, unitPrice: 50 }], deliveryFee: 20 }),
  });

  await assert.rejects(
    async () =>
      assertJobStorePaymentIntent(receipt(), {
        job,
        storeId: "store-b",
        order: batch({
          orderId: "order-b",
          storeId: "store-b",
          items: [{ qty: 1, unitPrice: 2000 }],
        }),
      }),
    (err) => err.statusCode === 400 && /does not match this store order/.test(err.message)
  );

  await assert.rejects(
    async () =>
      assertJobStorePaymentIntent(receipt({ amount: 50, gatewayPayload: { supplierId: "store-b" } }), {
        job,
        storeId: "store-b",
        order: batch({
          orderId: "order-b",
          storeId: "store-b",
          items: [{ qty: 1, unitPrice: 2000 }],
        }),
      }),
    (err) => err.statusCode === 400 && /amount does not match/.test(err.message)
  );

  await assert.rejects(
    async () =>
      assertJobStorePaymentIntent(receipt({ userId: "someone-else" }), {
        job,
        storeId: "store-a",
        order: batch(),
      }),
    (err) => err.statusCode === 403
  );

  await assert.rejects(
    async () =>
      assertJobStorePaymentIntent(receipt({ gatewayPayload: {} }), {
        job,
        storeId: "store-a",
        order: batch(),
      }),
    (err) => err.statusCode === 400 && /not linked/.test(err.message)
  );

  const unpaid = resolveStoreCheckoutPayment({
    intent: null,
    userId: "customer-1",
    materialsSubtotal: 2000,
  });
  assert.deepStrictEqual(unpaid, { paymentStatus: "unpaid", materialsPaid: false });

  await assert.rejects(
    async () =>
      resolveStoreCheckoutPayment({
        intent: { state: "PAID", userId: "customer-1", kind: "LABOR", amount: 2000, materialOrderId: null },
        userId: "customer-1",
        materialsSubtotal: 2000,
      }),
    (err) => err.statusCode === 400 && /not a material order payment/.test(err.message)
  );

  await assert.rejects(
    async () =>
      resolveStoreCheckoutPayment({
        intent: {
          state: "PAID",
          userId: "customer-1",
          kind: "MATERIAL_ORDER",
          amount: 10,
          materialOrderId: "existing-order",
        },
        userId: "customer-1",
        materialsSubtotal: 2000,
      }),
    (err) => err.statusCode === 400 && /already linked/.test(err.message)
  );

  assert.deepStrictEqual(
    resolveStoreCheckoutPayment({
      intent: {
        state: "PAID",
        userId: "customer-1",
        kind: "MATERIAL_ORDER",
        amount: 2000,
        materialOrderId: null,
      },
      userId: "customer-1",
      materialsSubtotal: 2000,
    }),
    { paymentStatus: "paid", materialsPaid: true }
  );

  const safeMessages = [
    "A settled store payment is required",
    "Payment intent does not match this job",
    "Payment intent does not belong to this customer",
    "Payment intent is not linked to a store order",
    "Payment intent does not match this store order",
    "Payment intent does not match this store",
    "Payment intent amount does not match this store order",
  ];
  for (const message of safeMessages) {
    assert.strictEqual(
      WEBHOOK_ALREADY_APPLIED.test(message),
      false,
      `webhook would hide: ${message}`
    );
  }

  console.log("storePaymentBinding.test.js passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
