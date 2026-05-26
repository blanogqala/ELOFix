const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

(function validateCriticalEnv() {
  const jwt = process.env.JWT_SECRET;
  if (!jwt || !String(jwt).trim()) {
    console.error(
      "[FATAL] JWT_SECRET is missing or empty. /api/auth/login and /api/auth/me will fail. Set JWT_SECRET in Render (Environment)."
    );
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }
  const db = process.env.DATABASE_URL;
  if (!db || !String(db).trim()) {
    console.error("[FATAL] DATABASE_URL is missing or empty. Set it in Render and redeploy.");
    process.exit(1);
  }

  const googleId = process.env.GOOGLE_CLIENT_ID;
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!googleId || !googleSecret) {
    console.warn(
      "[WARN] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing. Google sign-in will return 503/502 until set in Render Environment."
    );
  } else if (/0{8,}/.test(String(googleSecret))) {
    console.warn("[WARN] GOOGLE_CLIENT_SECRET looks like a placeholder. Google sign-in will fail with invalid_client.");
  }
  if (!process.env.GOOGLE_CALLBACK_URL || !process.env.FRONTEND_URL) {
    console.warn(
      "[WARN] GOOGLE_CALLBACK_URL and/or FRONTEND_URL missing. Set production URLs in Render (see elofix-backend/.env.example)."
    );
  }
})();

const http = require("http");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const app = require("./src/app");
const prisma = require("./src/config/prisma");
const { startStuckWithdrawalRecovery } = require("./src/jobs/stuckWithdrawalRecovery");
const trackingService = require("./src/services/tracking.service");
const materialOrderService = require("./src/services/materialOrder.service");
const { ensureProviderTotalReviewsColumn } = require("./src/utils/ensureDbSchemaPatches");

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

io.use((socket, next) => {
  try {
    const raw = socket.handshake.auth?.token;
    if (!raw) {
      return next();
    }
    const token = String(raw).replace(/^Bearer\s+/i, "");
    if (!token || !process.env.JWT_SECRET) {
      return next();
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = payload.sub;
    socket.userRole = payload.role;
    socket.branchId = payload.branchId || null;
  } catch {
    /* optional auth: join_order / update_location will require socket.userId */
  }
  next();
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", (userId) => {
    if (!userId) return;
    socket.join(String(userId));
    if (String(socket.userRole || "") === "BRANCH_STAFF" && socket.branchId) {
      socket.join(`branch:${String(socket.branchId)}`);
    }
  });

  async function handleOrderJoin(orderId) {
    if (!socket.userId || !orderId) return;
    try {
      const ok = await trackingService.canUserAccessOrderRoom(socket.userId, socket.userRole, orderId);
      if (!ok) return;
      socket.join(String(orderId));
    } catch (e) {
      console.error("order:join", e);
    }
  }

  socket.on("join_order", (orderId) => {
    void handleOrderJoin(orderId);
  });

  socket.on("order:join", (orderId) => {
    void handleOrderJoin(orderId);
  });

  socket.on("update_location", async (data) => {
    try {
      const orderId = data?.orderId;
      const lat = data?.lat;
      const lng = data?.lng;
      if (!socket.userId || !orderId) return;
      const ok = await trackingService.canUserPostDriverLocation(socket.userId, socket.userRole, orderId);
      if (!ok) return;
      const role = String(socket.userRole || "").toUpperCase();
      let source = null;
      if (role === "PROVIDER") source = "provider";
      else if (role === "SUPPLIER" || role === "BRANCH_STAFF") source = "supplier";
      else return;
      await trackingService.persistAndEmitDriverLocation(orderId, lat, lng, { source });
    } catch (e) {
      console.error("update_location", e);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

function startIntervalsAfterListen() {
  startStuckWithdrawalRecovery();
  void trackingService.expireOldSessions();
  setInterval(() => {
    void trackingService.expireOldSessions();
  }, 5 * 60 * 1000).unref();
  setInterval(() => {
    void materialOrderService.autoConfirmStaleDeliveriesBatch();
  }, 60 * 60 * 1000).unref();
}

(async () => {
  await ensureProviderTotalReviewsColumn();

  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    startIntervalsAfterListen();
  });
})().catch((e) => {
  console.error("[startup] prereq failed", e);
  process.exit(1);
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
