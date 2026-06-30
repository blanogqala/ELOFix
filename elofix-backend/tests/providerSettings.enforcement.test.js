/**
 * Provider settings enforcement (availability + notification preferences).
 * Run: node tests/providerSettings.enforcement.test.js
 */
require("dotenv").config();
const assert = require("assert");
const { isProviderAvailable } = require("../src/services/provider.service");

function testIsProviderAvailable() {
  assert.strictEqual(isProviderAvailable(undefined), true);
  assert.strictEqual(isProviderAvailable(null), true);
  assert.strictEqual(isProviderAvailable({}), true);
  assert.strictEqual(isProviderAvailable({ availability: true }), true);
  assert.strictEqual(isProviderAvailable({ availability: false }), false);
}

async function testNotificationPreferenceGating() {
  const prisma = require("../src/config/prisma");
  const notificationService = require("../src/services/notification.service");
  const notificationEvents = require("../src/services/notificationEvents.service");

  const originalFindUnique = prisma.provider.findUnique.bind(prisma.provider);
  const originalAddNotification = notificationService.addNotification.bind(notificationService);

  let addNotificationCalls = 0;
  notificationService.addNotification = async () => {
    addNotificationCalls += 1;
    return { id: "test" };
  };

  try {
    prisma.provider.findUnique = async () => ({
      settings: { notifications: { jobRequests: false, payments: true } },
    });
    addNotificationCalls = 0;
    await notificationEvents.notifyJobRequest("provider-user-1", "job-1", "Test job");
    assert.strictEqual(addNotificationCalls, 0, "job_request should be skipped when jobRequests is false");

    prisma.provider.findUnique = async () => ({
      settings: { notifications: { jobRequests: true, payments: false } },
    });
    addNotificationCalls = 0;
    await notificationEvents.notifyPaymentMade("provider-user-1", "job-1", "Test job");
    assert.strictEqual(addNotificationCalls, 0, "payment_made should be skipped when payments is false");

    prisma.provider.findUnique = async () => null;
    addNotificationCalls = 0;
    await notificationEvents.notifyJobRequest("customer-user-1", "job-1", "Test job");
    assert.strictEqual(addNotificationCalls, 1, "non-providers should still receive notifications");

    prisma.provider.findUnique = async () => ({
      settings: { notifications: { jobRequests: true, payments: true } },
    });
    addNotificationCalls = 0;
    await notificationEvents.notifyJobRequest("provider-user-2", "job-2", "Test job");
    assert.strictEqual(addNotificationCalls, 1, "job_request should send when jobRequests is true");
  } finally {
    prisma.provider.findUnique = originalFindUnique;
    notificationService.addNotification = originalAddNotification;
  }
}

async function main() {
  testIsProviderAvailable();
  await testNotificationPreferenceGating();
  console.log("providerSettings.enforcement.test.js: all tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
