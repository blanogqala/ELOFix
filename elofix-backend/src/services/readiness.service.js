const prisma = require("../config/prisma");
const { assertProductionPaymentSafety } = require("./payments/paymentConfig");

let appInitialized = true;

function setAppInitialized(value) {
  appInitialized = Boolean(value);
}

async function getReadiness() {
  const checks = {
    app: appInitialized ? "ok" : "not_ready",
    database: "unknown",
    config: "ok",
  };

  try {
    assertProductionPaymentSafety();
  } catch {
    checks.config = "invalid";
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "unavailable";
  }

  const ok = checks.app === "ok" && checks.database === "ok" && checks.config === "ok";
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
