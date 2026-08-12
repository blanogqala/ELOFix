const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const { isTestingDeployment } = require("./src/utils/secretKey.util");

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

  const secretKey = process.env.SECRET_KEY;
  const testingMode = isTestingDeployment();
  if (!secretKey || String(secretKey).trim().length < 8) {
    if (testingMode) {
      console.warn(
        "[WARN] SECRET_KEY not set — using built-in test secrets because ELOFIX_TESTING_MODE=true. Set real SECRET_KEY before launch."
      );
    } else {
      console.error(
        "[FATAL] SECRET_KEY is missing or shorter than 8 characters. Provider profile saves require it. Set SECRET_KEY in Render, or for pre-launch testing only set ELOFIX_TESTING_MODE=true (see .env.example)."
      );
      if (process.env.NODE_ENV === "production") {
        process.exit(1);
      }
    }
  }
  const bankSalt = process.env.BANK_KDF_SALT;
  if (!bankSalt || String(bankSalt).trim().length < 8) {
    if (testingMode) {
      console.warn(
        "[WARN] BANK_KDF_SALT not set — using built-in test salt because ELOFIX_TESTING_MODE=true. Set real BANK_KDF_SALT before launch."
      );
    } else {
      console.warn(
        "[WARN] BANK_KDF_SALT is missing or shorter than 8 characters. Bank field encryption may fail until set in Render Environment."
      );
    }
  }
})();

const http = require("http");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const app = require("./src/app");
const prisma = require("./src/config/prisma");
const { startStuckWithdrawalRecovery } = require("./src/jobs/stuckWithdrawalRecovery");
const { startCompletionDeadlineJob } = require("./src/jobs/completionDeadline.job");
const { startNotificationOutboxJob } = require("./src/jobs/notificationOutbox.job");
const { startTrustScoreMonthlyBonusJob } = require("./src/jobs/trustScoreMonthlyBonus.job");
const { startRefundDebtEnforcementJob } = require("./src/jobs/refundDebtEnforcement.job");
const trackingService = require("./src/services/tracking.service");
const materialOrderService = require("./src/services/materialOrder.service");
const { ensureProviderTotalReviewsColumn } = require("./src/utils/ensureDbSchemaPatches");
const { getAllowedOrigins, isOriginAllowed } = require("./src/utils/corsOrigins.util");
const { canJoinUserRoom } = require("./src/utils/socketAuth.util");

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
const socketAllowedOrigins = getAllowedOrigins();
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin, socketAllowedOrigins)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
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
    if (!canJoinUserRoom(socket.userId, userId)) return;
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
      const role = String(socket.userRole || "").toUpperCase();
      const canMaterial = await trackingService.canUserPostDriverLocation(
        socket.userId,
        socket.userRole,
        orderId
      );
      if (canMaterial) {
        let source = null;
        if (role === "PROVIDER") source = "provider";
        else if (role === "SUPPLIER" || role === "BRANCH_STAFF") source = "supplier";
        else return;
        await trackingService.persistAndEmitDriverLocation(orderId, lat, lng, { source });
        return;
      }
      const canDelivery = await trackingService.canUserPostDeliveryRequestLocation(
        socket.userId,
        orderId
      );
      if (canDelivery) {
        await trackingService.persistAndEmitDeliveryRequestLocation(orderId, lat, lng, {
          source: "provider",
        });
      }
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
  startCompletionDeadlineJob();
  startNotificationOutboxJob();
  startTrustScoreMonthlyBonusJob();
  startRefundDebtEnforcementJob();
  void trackingService.expireOldSessions();
  setInterval(() => {
    void trackingService.expireOldSessions();
  }, 5 * 60 * 1000).unref();
  setInterval(() => {
    void materialOrderService.autoConfirmStaleDeliveriesBatch();
  }, 60 * 60 * 1000).unref();
}

function listenWithRetry(attempt = 0) {
  const maxAttempts = 10;
  const retryMs = 500;

  const onError = (err) => {
    if (err.code === "EADDRINUSE" && attempt < maxAttempts) {
      console.warn(
        `[startup] port ${PORT} in use, retrying in ${retryMs}ms (${attempt + 1}/${maxAttempts})`
      );
      setTimeout(() => listenWithRetry(attempt + 1), retryMs);
      return;
    }
    if (err.code === "EADDRINUSE") {
      console.error(
        `[FATAL] Port ${PORT} is already in use. Another EloFix backend is still running — often a leftover npm run dev after a terminal was closed. Stop that process, then start this one again.`
      );
      process.exit(1);
    }
    console.error("[startup] listen failed", err);
    process.exit(1);
  };

  server.once("error", onError);
  server.listen(PORT, () => {
    server.removeListener("error", onError);
    console.log(`Server listening on port ${PORT}`);
    startIntervalsAfterListen();
  });
}

(async () => {
  await ensureProviderTotalReviewsColumn();
  listenWithRetry();
})().catch((e) => {
  console.error("[startup] prereq failed", e);
  process.exit(1);
});

function closeHttpServer() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const timer = setTimeout(finish, 1500);
    timer.unref();

    try {
      if (typeof io.disconnectSockets === "function") {
        io.disconnectSockets(true);
      }
      if (typeof server.closeAllConnections === "function") {
        server.closeAllConnections();
      }
    } catch (_) {
      /* ignore — still attempt server.close */
    }

    try {
      io.close();
    } catch (_) {
      /* ignore */
    }

    server.close((closeErr) => {
      clearTimeout(timer);
      if (closeErr && closeErr.code !== "ERR_SERVER_NOT_RUNNING") {
        console.error("[shutdown] server.close", closeErr);
      }
      finish();
    });
  });
}

async function shutdown(signal) {
  console.log(`${signal} received, closing HTTP server`);
  const forceTimer = setTimeout(() => {
    console.error("[shutdown] force exit after timeout");
    process.exit(1);
  }, 2_000);
  forceTimer.unref();

  try {
    await closeHttpServer();
    await prisma.$disconnect();
    clearTimeout(forceTimer);
    process.exit(0);
  } catch (e) {
    console.error("[shutdown] error", e);
    clearTimeout(forceTimer);
    process.exit(1);
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.once("SIGUSR2", () => {
  void shutdown("SIGUSR2");
});
