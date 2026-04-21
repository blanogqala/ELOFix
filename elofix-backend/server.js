require("dotenv/config");
const http = require("http");
const app = require("./src/app");
const prisma = require("./src/config/prisma");
const { startStuckWithdrawalRecovery } = require("./src/jobs/stuckWithdrawalRecovery");

const PORT = Number(process.env.PORT) || 5000;

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  process.exit(1);
});

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  startStuckWithdrawalRecovery();
});

function shutdown(signal) {
  console.log(`${signal} received, closing HTTP server`);
  server.close(async (closeErr) => {
    if (closeErr) {
      console.error("[shutdown] server.close error", closeErr);
    }
    try {
      await prisma.$disconnect();
    } catch (e) {
      console.error("[shutdown] prisma.$disconnect error", e);
    }
    process.exit(closeErr ? 1 : 0);
  });

  setTimeout(() => {
    console.error("[shutdown] force exit after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
