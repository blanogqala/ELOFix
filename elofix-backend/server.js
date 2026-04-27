require("dotenv/config");
const http = require("http");
const { Server } = require("socket.io");
const app = require("./src/app");
const prisma = require("./src/config/prisma");
const { startStuckWithdrawalRecovery } = require("./src/jobs/stuckWithdrawalRecovery");

const PORT = Number(process.env.PORT) || 5000;

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
  if (process.env.NODE_ENV === "development") {
    try {
      if (reason && typeof reason === "object" && reason.stack) {
        console.error(reason.stack);
      }
    } catch (_) {
      /* dev-only logging must not mask the rejection */
    }
  }
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  process.exit(1);
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});
global.io = io;

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", (userId) => {
    if (!userId) return;
    socket.join(String(userId));
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

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
