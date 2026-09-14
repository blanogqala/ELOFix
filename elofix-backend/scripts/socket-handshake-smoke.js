/**
 * Direct Socket.IO handshake smoke — hosted or local.
 * Does not require a customer transaction. Never prints tokens.
 *
 *   ELOFIX_SOCKET_BASE_URL=https://YOUR-RENDER-API.onrender.com npm run smoke:socket
 *
 * Optional:
 *   ELOFIX_SOCKET_TOKEN   JWT from env only (never committed)
 *   ELOFIX_SOCKET_TIMEOUT_MS  default 15000
 */
require("dotenv").config({ quiet: true });

function loadClient() {
  try {
    return require("socket.io-client");
  } catch {
    try {
      const path = require("path");
      return require(path.join(__dirname, "..", "..", "frontend", "node_modules", "socket.io-client"));
    } catch {
      return null;
    }
  }
}

function baseUrl() {
  const raw = String(
    process.env.ELOFIX_SOCKET_BASE_URL ||
      process.env.VITE_API_ORIGIN ||
      process.env.ELOFIX_API_BASE_URL ||
      "http://127.0.0.1:5000"
  ).trim();
  return raw.replace(/\/api\/?$/, "").replace(/\/$/, "");
}

function log(line) {
  process.stdout.write(`${line}\n`);
}

async function httpEngineIoProbe(origin, timeoutMs) {
  const url = `${origin}/socket.io/?EIO=4&transport=polling`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: "manual" });
    const status = res.status;
    log(`engine.io polling: HTTP ${status} ${url.split("?")[0]}`);
    if (status === 502) {
      throw new Error("Socket.IO endpoint returned 502 Bad Gateway");
    }
    if (status >= 500) {
      throw new Error(`Socket.IO endpoint returned HTTP ${status}`);
    }
    return status;
  } finally {
    clearTimeout(timer);
  }
}

async function connectClient(origin, timeoutMs) {
  const socketIo = loadClient();
  if (!socketIo) {
    throw new Error("socket.io-client is not installed");
  }
  const factory = socketIo.io || socketIo;
  const token = String(process.env.ELOFIX_SOCKET_TOKEN || "").trim();
  const opts = {
    path: "/socket.io",
    transports: ["polling", "websocket"],
    reconnection: false,
    timeout: timeoutMs,
    forceNew: true,
  };
  if (token) {
    opts.auth = { token };
  }
  const socket = factory(origin, opts);
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("socket connect timeout")), timeoutMs);
      socket.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("connect_error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    log(`socket.io-client: connected ${socket.connected === true ? "yes" : "no"}`);
  } finally {
    socket.removeAllListeners();
    socket.disconnect();
    if (typeof socket.close === "function") socket.close();
  }
}

async function main() {
  const origin = baseUrl();
  const timeoutMs = Number(process.env.ELOFIX_SOCKET_TIMEOUT_MS || 15000);
  log(`ELOFIX socket handshake smoke`);
  log(`origin=${origin}`);
  log(`auth=${process.env.ELOFIX_SOCKET_TOKEN ? "provided" : "none"}`);

  await httpEngineIoProbe(origin, timeoutMs);
  await connectClient(origin, timeoutMs);
  log("RESULT: connected");
}

main().catch((err) => {
  log(`RESULT: failed`);
  log(String(err && err.message ? err.message : err));
  process.exit(1);
});
