const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

function mockModule(request, exports) {
  const resolved = require.resolve(request);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
}

function loadController({ materialOrderRow, supplierRow = null, supplierOwnsOrder = false } = {}) {
  const controllerPath = path.resolve(__dirname, "../src/controllers/materialOrder.controller.js");
  delete require.cache[controllerPath];

  const calls = {
    getMaterialOrderById: 0,
    updateMaterialOrderDelivery: 0,
  };

  const materialOrderService = {
    getMaterialOrders: async () => [],
    getMaterialOrderById: async (orderId) => {
      calls.getMaterialOrderById += 1;
      return { id: orderId, userId: materialOrderRow?.userId };
    },
    createMaterialOrder: async () => ({}),
    updateMaterialOrderDelivery: async (orderId, body) => {
      calls.updateMaterialOrderDelivery += 1;
      return { id: orderId, ...body };
    },
    approveMaterialOrderDelivery: async () => ({}),
    rejectMaterialOrderDelivery: async () => ({}),
    payMaterialOrderDelivery: async () => ({}),
    updateMaterialOrderDeliveryStatus: async () => ({}),
    updateMaterialOrderFulfillmentByProvider: async () => ({}),
    confirmDeliveryReceipt: async () => ({}),
    emitSupplierMaterialOrderCreated: async () => {},
  };

  mockModule("../src/services/materialOrder.service", materialOrderService);
  mockModule("../src/services/job.service", { getJobsForCustomerId: async () => [] });
  mockModule("../src/services/supplier.service", {
    findSupplierRecordByUserId: async () => supplierRow,
  });
  mockModule("../src/config/prisma", {
    materialOrder: {
      findUnique: async () => materialOrderRow,
    },
  });
  mockModule("../src/utils/materialOrderSupplier.util", {
    materialOrderBelongsToSupplierStore: () => supplierOwnsOrder,
  });

  return {
    controller: require(controllerPath),
    calls,
  };
}

function req({ userId = "user-1", role = "CUSTOMER", params = {}, body = {} } = {}) {
  return {
    user: { userId, role },
    params: { id: "order-1", ...params },
    body,
    query: {},
  };
}

function res() {
  return {
    statusCode: 200,
    payload: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test("customer delivery mutations reject authenticated users who do not own the order", async () => {
  const { controller, calls } = loadController({
    materialOrderRow: { id: "order-1", userId: "owner-1" },
  });

  await assert.rejects(
    () =>
      controller.updateMaterialOrderDelivery(
        req({ userId: "attacker-1", body: { status: "Cancelled" } }),
        res()
      ),
    (err) => err.statusCode === 403 && err.message === "Forbidden"
  );

  assert.equal(calls.updateMaterialOrderDelivery, 0);
});

test("customer delivery mutations still allow the owning customer", async () => {
  const { controller, calls } = loadController({
    materialOrderRow: { id: "order-1", userId: "owner-1" },
  });
  const response = res();

  await controller.updateMaterialOrderDelivery(
    req({ userId: "owner-1", body: { status: "Cancelled" } }),
    response
  );

  assert.equal(calls.updateMaterialOrderDelivery, 1);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, {
    success: true,
    order: { id: "order-1", status: "Cancelled" },
  });
});

test("material order reads reject non-owners before loading enriched order details", async () => {
  const { controller, calls } = loadController({
    materialOrderRow: { id: "order-1", userId: "owner-1" },
  });

  await assert.rejects(
    () => controller.getMaterialOrder(req({ userId: "attacker-1" }), res()),
    (err) => err.statusCode === 403 && err.message === "Forbidden"
  );

  assert.equal(calls.getMaterialOrderById, 0);
});
