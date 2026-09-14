/**
 * Attach Socket.IO to the existing Node HTTP server.
 * CORS uses the same origin allowlist as Express. Auth is handshake JWT only.
 */
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { getAllowedOrigins, isOriginAllowed } = require("../utils/corsOrigins.util");
const { canJoinUserRoom } = require("../utils/socketAuth.util");
const { setRealtimeInitialized } = require("../utils/realtimeState.util");

const SOCKET_PATH = "/socket.io";

function requestedUserIdFromJoinPayload(payload) {
  if (payload == null) return "";
  if (typeof payload === "object") {
    return String(payload.userId || payload.id || "");
  }
  return String(payload);
}

function requestedOrderId(payload) {
  if (payload == null) return "";
  if (typeof payload === "object") {
    return String(payload.orderId || payload.id || "");
  }
  return String(payload);
}

function attachSocketIo(httpServer, options = {}) {
  const trackingService = options.trackingService || require("../services/tracking.service");

  const io = new Server(httpServer, {
    path: SOCKET_PATH,
    transports: ["polling", "websocket"],
    allowUpgrades: true,
    pingInterval: 25000,
    pingTimeout: 20000,
    cors: {
      origin: (origin, callback) => {
        const allowed = getAllowedOrigins();
        if (isOriginAllowed(origin, allowed)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: false,
    },
    // WebSocket is not governed by browser CORS; Engine.IO must deny disallowed Origin here.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin || req.headers.Origin;
      const allowed = getAllowedOrigins();
      if (isOriginAllowed(origin, allowed)) {
        callback(null, true);
        return;
      }
      console.warn("[socket] origin_rejected", { origin: origin || "" });
      callback("Not allowed by CORS", false);
    },
  });

  io.use((socket, next) => {
    try {
      const raw = socket.handshake.auth?.token;
      if (raw == null || raw === "") {
        return next();
      }
      const token = String(raw).replace(/^Bearer\s+/i, "");
      if (!token) {
        return next();
      }
      if (!process.env.JWT_SECRET) {
        console.warn("[socket] auth_failed", { reason: "jwt_secret_missing" });
        return next(new Error("Authentication error"));
      }
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.sub;
      socket.userRole = payload.role;
      socket.branchId = payload.branchId || null;
      return next();
    } catch {
      console.warn("[socket] auth_failed", { reason: "invalid_token" });
      return next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket) => {
    console.log("[socket] connect", {
      socketId: socket.id,
      authenticated: Boolean(socket.userId),
    });

    socket.on("join", (payload) => {
      // Identity and role come from the signed JWT only — never from the payload.
      const requestedUserId = requestedUserIdFromJoinPayload(payload);
      if (!canJoinUserRoom(socket.userId, requestedUserId)) {
        console.warn("[socket] join_rejected", {
          socketId: socket.id,
          event: "join",
          reason: socket.userId ? "unauthorized" : "unauthenticated",
        });
        return;
      }
      socket.join(String(requestedUserId));
      if (String(socket.userRole || "") === "BRANCH_STAFF" && socket.branchId) {
        socket.join(`branch:${String(socket.branchId)}`);
      }
      if (String(socket.userRole || "").toUpperCase() === "ADMIN") {
        socket.join("admin");
      }
    });

    async function handleOrderJoin(payload) {
      const orderId = requestedOrderId(payload);
      if (!socket.userId || !orderId) {
        console.warn("[socket] join_rejected", {
          socketId: socket.id,
          event: "order:join",
          reason: socket.userId ? "missing_order" : "unauthenticated",
        });
        return;
      }
      try {
        const ok = await trackingService.canUserAccessOrderRoom(
          socket.userId,
          socket.userRole,
          orderId
        );
        if (!ok) {
          console.warn("[socket] join_rejected", {
            socketId: socket.id,
            event: "order:join",
            reason: "unauthorized",
          });
          return;
        }
        socket.join(String(orderId));
      } catch (e) {
        console.error("[socket] order:join", e?.message || e);
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
        if (!socket.userId || !orderId) {
          console.warn("[socket] location_rejected", {
            socketId: socket.id,
            reason: socket.userId ? "missing_order" : "unauthenticated",
          });
          return;
        }
        // Role is from JWT (socket.userRole). Ignore data.role / data.userId.
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
          else {
            console.warn("[socket] location_rejected", {
              socketId: socket.id,
              reason: "unauthorized",
            });
            return;
          }
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
          return;
        }
        console.warn("[socket] location_rejected", {
          socketId: socket.id,
          reason: "unauthorized",
        });
      } catch (e) {
        console.error("[socket] update_location", e?.message || e);
      }
    });

    socket.on("disconnect", (reason) => {
      console.log("[socket] disconnect", { socketId: socket.id, reason: String(reason || "") });
    });
  });

  setRealtimeInitialized(true);
  console.log("[socket] initialized", { path: SOCKET_PATH, transports: ["polling", "websocket"] });

  return { io, path: SOCKET_PATH };
}

module.exports = {
  attachSocketIo,
  SOCKET_PATH,
};
