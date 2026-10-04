/**
 * Disposable paid STORE_DELIVERY order for the Playwright live-tracking spec.
 * Usage:
 *   node scripts/e2e-store-delivery-tracking-fixture.js create
 *   node scripts/e2e-store-delivery-tracking-fixture.js destroy <json>
 *
 * Refuses production and non-local databases. Does not print secrets.
 */
const path = require("path");
// The Playwright shell can carry a different DATABASE_URL. This fixture must use the
// same local database as the API under test, then refuse anything non-local.
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");
const prisma = require("../src/config/prisma");
const { disconnectPrismaAndPool } = require("../src/config/prismaLifecycle");
const { assertSafeE2eDatabase } = require("./e2eMarketplaceFixtureGuard");

const PASSWORD = "Password@123";
const DESTINATION = {
  lat: -33.92487,
  lng: 18.42406,
  address: "1 Adderley Street, Cape Town",
};

async function destroyIds(ids) {
  if (!ids) return;
  const orderId = ids.orderId || null;
  if (orderId) {
    await prisma.notification.deleteMany({ where: { materialOrderId: orderId } });
    await prisma.trackingSession.deleteMany({ where: { orderId } });
    await prisma.materialOrder.deleteMany({ where: { id: orderId } });
  }
  if (ids.customerId) {
    await prisma.notification.deleteMany({ where: { userId: ids.customerId } });
  }
  if (ids.staffId) {
    await prisma.branchUser.deleteMany({ where: { id: ids.staffId } });
  }
  if (ids.branchId) {
    await prisma.branch.deleteMany({ where: { id: ids.branchId } });
  }
  if (ids.supplierId) {
    await prisma.supplier.deleteMany({ where: { id: ids.supplierId } });
  }
  const userIds = [ids.customerId, ids.supplierUserId].filter(Boolean);
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

async function create() {
  assertSafeE2eDatabase();
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const ids = {};
  try {
    const customer = await prisma.user.create({
      data: {
        email: `e2e.storetrack.customer.${suffix}@example.com`,
        password: passwordHash,
        name: "Store Track Customer",
        role: "CUSTOMER",
      },
    });
    ids.customerId = customer.id;

    const supplierUser = await prisma.user.create({
      data: {
        email: `e2e.storetrack.supplier.${suffix}@example.com`,
        password: passwordHash,
        name: "Store Track Supplier",
        role: "SUPPLIER",
      },
    });
    ids.supplierUserId = supplierUser.id;

    const supplier = await prisma.supplier.create({
      data: {
        userId: supplierUser.id,
        name: `Store Track ${suffix}`,
        businessName: `Store Track ${suffix}`,
        phone: "0215550199",
        city: "Cape Town",
      },
    });
    ids.supplierId = supplier.id;

    const branch = await prisma.branch.create({
      data: {
        supplierId: supplier.id,
        name: `Track Branch ${suffix}`,
        address: "12 Voortrekker Road, Bellville",
        city: "Cape Town",
        area: "Bellville",
        branchPhone: "0215550199",
        hasDelivery: true,
        deliveryFee: 80,
        latitude: -33.894,
        longitude: 18.629,
      },
    });
    ids.branchId = branch.id;

    const staff = await prisma.branchUser.create({
      data: {
        branchId: branch.id,
        email: `e2e.storetrack.staff.${suffix}@example.com`,
        password: passwordHash,
        role: "STAFF",
      },
    });
    ids.staffId = staff.id;

    const orderId = randomUUID();
    const createdAt = new Date().toISOString();
    const items = [{ productId: "cement", name: "Cement", qty: 1, unitPrice: 100, price: 100 }];
    const order = await prisma.materialOrder.create({
      data: {
        id: orderId,
        userId: customer.id,
        supplierId: supplier.id,
        branchId: branch.id,
        source: "store_checkout",
        paymentStatus: "paid",
        fulfillmentStatus: "PENDING",
        materialsSubtotal: 100,
        payload: {
          id: orderId,
          userId: customer.id,
          storeId: branch.id,
          branchId: branch.id,
          storeName: `Track Branch ${suffix}`,
          deliveryType: "STORE_DELIVERY",
          items,
          total: 180,
          deliveryFee: 80,
          paymentStatus: "paid",
          payment: { materialsPaid: true, deliveryPaid: true },
          invoiceId: `INV-MAT-${suffix}`,
          createdAt,
          delivery: { type: "STORE", status: "Approved", fee: 80 },
          customerLocation: {
            address: DESTINATION.address,
            city: "Cape Town",
            coordinates: { lat: DESTINATION.lat, lng: DESTINATION.lng },
          },
          destinationPoint: {
            address: DESTINATION.address,
            coordinates: { lat: DESTINATION.lat, lng: DESTINATION.lng },
          },
          materialBatch: {
            id: orderId,
            branchId: branch.id,
            supplierId: supplier.id,
            items,
            status: "pending",
            deliveryType: "STORE_DELIVERY",
            deliveryAddress: DESTINATION.address,
            timestamps: {},
          },
        },
      },
    });
    ids.orderId = order.id;

    process.stdout.write(
      `${JSON.stringify({
        password: PASSWORD,
        customerEmail: customer.email,
        staffEmail: staff.email,
        orderId: order.id,
        destination: DESTINATION,
        ids,
      })}\n`
    );
  } catch (error) {
    await destroyIds(ids).catch(() => {});
    throw error;
  }
}

async function main() {
  const command = process.argv[2];
  if (command === "create") {
    await create();
    return;
  }
  if (command === "destroy") {
    assertSafeE2eDatabase();
    const raw = process.argv[3];
    if (!raw) throw new Error("destroy requires the fixture JSON");
    const parsed = JSON.parse(raw);
    await destroyIds(parsed.ids || parsed);
    return;
  }
  throw new Error("Usage: node scripts/e2e-store-delivery-tracking-fixture.js create|destroy");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrismaAndPool().catch(() => {});
  });
