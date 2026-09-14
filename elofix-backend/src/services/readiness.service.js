const prisma = require("../config/prisma");
const { assertProductionPaymentSafety } = require("./payments/paymentConfig");
const objectStorage = require("./objectStorage.service");
const { getCorsConfigReadiness } = require("../utils/corsOrigins.util");
const { isRealtimeInitialized } = require("../utils/realtimeState.util");

let appInitialized = true;

function setAppInitialized(value) {
  appInitialized = Boolean(value);
}

async function getReadiness() {
  const checks = {
    app: appInitialized ? "ok" : "not_ready",
    database: "unknown",
    config: "ok",
    storage: "ok",
    realtime: isRealtimeInitialized() ? "ok" : "not_ready",
  };

  try {
    assertProductionPaymentSafety();
  } catch {
    checks.config = "invalid";
  }

  const corsReady = getCorsConfigReadiness();
  if (!corsReady.ok) {
    checks.config = "invalid";
  }

  const storage = objectStorage.getDurableStorageReadiness();
  if (!storage.ok) {
    checks.storage = "invalid";
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "unavailable";
  }

  const ok =
    checks.app === "ok" &&
    checks.database === "ok" &&
    checks.config === "ok" &&
    checks.storage === "ok" &&
    checks.realtime === "ok";
  return {
    ok,
    httpStatus: ok ? 200 : 503,
    body: {
      status: ok ? "ready" : "unavailable",
      checks,
    },
  };
}

module.exports = {
  setAppInitialized,
  getReadiness,
};
