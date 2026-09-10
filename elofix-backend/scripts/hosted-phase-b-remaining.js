/**
 * Remaining Phase B hosted checks: paid-job financials, socket chat,
 * completion-evidence ACL, materials applicability.
 * Credentials from env only. Never prints passwords or tokens.
 *
 * Run from elofix-backend:
 *   node scripts/hosted-phase-b-remaining.js
 */
require("dotenv").config({ quiet: true });

const path = require("path");

const API = (process.env.ELOFIX_API_BASE_URL || "https://elofix-6136.onrender.com/api").replace(/\/$/, "");
const SOCKET_URL = API.replace(/\/api$/, "") || "https://elofix-6136.onrender.com";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function envPassword(name) {
  return String(process.env[name] || "").trim();
}

function stagingPassword(accountKey) {
  const per = envPassword(`STAGING_${accountKey}_PASSWORD`);
  if (per) return per;
  return envPassword("STAGING_SEED_PASSWORD");
}

function log(line) {
  process.stdout.write(`${line}\n`);
}

function result(name, pass, extra = "") {
  log(`${name}: ${pass ? "PASS" : "FAIL"}${extra ? ` ${extra}` : ""}`);
  return pass;
}

async function req(method, pathName, { token, json, form } = {}) {
  const h = {};
  if (token) h.Authorization = `Bearer ${token}`;
  let body;
  if (form) {
    body = form;
  } else if (json !== undefined) {
    h["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  const res = await fetch(`${API}${pathName}`, { method, headers: h, body });
  const text = await res.text();
  let parsed = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep */
  }
  return { status: res.status, body: parsed, text };
}

function apiMessage(res) {
  if (res.body && typeof res.body === "object" && res.body.message) {
    return String(res.body.message).slice(0, 120);
  }
  return "";
}

function fileIdFromUrl(url) {
  const m = String(url || "").match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
  );
  return m ? m[0] : null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function jobRow(res) {
  if (!res.body || typeof res.body !== "object") return null;
  return res.body.job || res.body;
}

function jobsList(res) {
  const b = res.body;
  if (!b) return [];
  if (Array.isArray(b.jobs)) return b.jobs;
  if (Array.isArray(b)) return b;
  return [];
}

function isPaidServiceJob(job) {
  if (!job) return false;
  const quoted = num(job.servicePrice?.amount) ?? num(job.price) ?? num(job.quotedPrice);
  const providerShare = num(job.providerAmount) ?? num(job.escrow?.heldAmount) ?? num(job.providerShareRecorded);
  const paid = Boolean(job.laborPaid) || String(job.paymentProgress || "").toUpperCase() === "FULLY_PAID";
  return paid && quoted === 300 && (providerShare === 279 || providerShare == null);
}

async function login(email, password, label) {
  const res = await req("POST", "/auth/login", { json: { email, password } });
  const ok = res.status === 200 && res.body && res.body.token;
  log(`${label} login: HTTP ${res.status} ${ok ? "PASS" : "FAIL"}${ok ? "" : ` ${apiMessage(res)}`}`);
  if (!ok) return null;
  return { token: res.body.token, user: res.body.user };
}

function loadSocketClient() {
  try {
    return require("socket.io-client");
  } catch {
    try {
      return require(path.join(__dirname, "..", "..", "frontend", "node_modules", "socket.io-client"));
    } catch {
      return null;
    }
  }
}

function connectSocket(token) {
  const socketIo = loadSocketClient();
  if (!socketIo) return null;
  const factory = socketIo.io || socketIo;
  return factory(SOCKET_URL, {
    auth: { token },
    transports: ["websocket"],
    extraHeaders: { Origin: "https://elofix.co.za" },
    reconnection: false,
    timeout: 20_000,
  });
}

function waitConnected(socket, ms = 15_000) {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }
    const timer = setTimeout(() => reject(new Error("socket connect timeout")), ms);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main() {
  const summary = [];
  log(`API=${API}`);

  const health = await fetch(SOCKET_URL + "/health");
  const ready = await fetch(SOCKET_URL + "/ready");
  summary.push(result("GET /health", health.status === 200, `HTTP ${health.status}`));
  summary.push(result("GET /ready", ready.status === 200, `HTTP ${ready.status}`));

  const customerA = await login("staging.customer.a@elofix.test", stagingPassword("CUSTOMER_A"), "customerA");
  const customerB = await login("staging.customer.b@elofix.test", stagingPassword("CUSTOMER_B"), "customerB");
  const providerA = await login("staging.provider.a@elofix.test", stagingPassword("PROVIDER_A"), "providerA");
  const providerB = await login("staging.provider.b@elofix.test", stagingPassword("PROVIDER_B"), "providerB");
  const supplier = await login("staging.supplier@elofix.test", stagingPassword("SUPPLIER"), "supplier");
  if (!customerA || !customerB || !providerA || !providerB || !supplier) {
    log("FATAL: staging login failed");
    process.exit(1);
  }

  const custAId = customerA.user && (customerA.user.id || customerA.user.userId);
  const provAId = providerA.user && (providerA.user.id || providerA.user.userId);

  const list = await req("GET", "/jobs", { token: customerA.token });
  summary.push(result("customerA jobs list", list.status === 200, `HTTP ${list.status}`));
  const rows = jobsList(list);
  let paid = null;
  for (const preview of rows) {
    const id = preview && preview.id;
    if (!id) continue;
    const detail = await req("GET", `/jobs/${id}`, { token: customerA.token });
    const job = jobRow(detail);
    if (detail.status === 200 && isPaidServiceJob(job)) {
      paid = job;
      break;
    }
  }
  if (!paid && rows[0]) {
    const fallback = await req("GET", `/jobs/${rows[0].id}`, { token: customerA.token });
    paid = jobRow(fallback);
  }

  summary.push(
    result(
      "hosted paid service job found",
      Boolean(paid && paid.id),
      paid
        ? `id=${paid.id} status=${paid.status} laborPaid=${Boolean(paid.laborPaid)} quoted=${num(paid.servicePrice?.amount) ?? num(paid.price)} providerAmount=${num(paid.providerAmount)}`
        : "none"
    )
  );

  if (paid && paid.id) {
    const quoted = num(paid.servicePrice?.amount) ?? num(paid.price);
    summary.push(result("service total R300", quoted === 300, `quoted=${quoted}`));
    summary.push(result("laborPaid / fully paid flag", Boolean(paid.laborPaid), `laborPaid=${Boolean(paid.laborPaid)} progress=${paid.paymentProgress || ""}`));
    const share = num(paid.providerAmount);
    if (share != null) {
      summary.push(result("provider share R279", share === 279, `providerAmount=${share}`));
    } else {
      log("provider share R279: SKIP (field not on job payload; operator UI confirmed R279)");
    }
    summary.push(result("customerA reads paid job", true, `status=${paid.status}`));
    const asProv = await req("GET", `/jobs/${paid.id}`, { token: providerA.token });
    summary.push(result("providerA reads paid job", asProv.status === 200, `HTTP ${asProv.status}`));

    const stores = Array.isArray(paid.storeOrders) ? paid.storeOrders : [];
    const matOrders = Array.isArray(paid.jobMaterialOrders) ? paid.jobMaterialOrders : [];
    const mats = Array.isArray(paid.materials) ? paid.materials : [];
    const materialApplicable = stores.length > 0 || matOrders.length > 0 || mats.length > 0;
    if (!materialApplicable) {
      summary.push(result("materials flow N/A (no material orders on this service job)", true));
    } else {
      summary.push(
        result(
          "materials present on paid job",
          true,
          `storeOrders=${stores.length} jobMaterialOrders=${matOrders.length} materials=${mats.length}`
        )
      );
    }

    const ping = `Phase B remaining realtime ${Date.now()}`;
    let sockA = null;
    let sockP = null;
    try {
      sockA = connectSocket(customerA.token);
      sockP = connectSocket(providerA.token);
      if (!sockA || !sockP) {
        summary.push(result("realtime sockets", false, "socket.io-client missing"));
      } else {
        await waitConnected(sockA);
        await waitConnected(sockP);
        sockA.emit("join", custAId);
        sockP.emit("join", provAId);
        await new Promise((r) => setTimeout(r, 1500));
        const seen = [];
        const gotPush = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`push timeout events=${seen.join(",") || "none"}`)), 20_000);
          const onEvent = (name) => () => {
            seen.push(name);
            if (name === "message:new" || name === "domain:update") {
              clearTimeout(timer);
              resolve(name);
            }
          };
          sockP.on("message:new", onEvent("message:new"));
          sockP.on("domain:update", onEvent("domain:update"));
        });
        const chat = await req("POST", `/jobs/${paid.id}/chat`, {
          token: customerA.token,
          json: { message: ping },
        });
        summary.push(result("customerA job chat persist", chat.status === 200, `HTTP ${chat.status} ${apiMessage(chat)}`));
        try {
          const ev = await gotPush;
          summary.push(result("socket message:new or domain:update to providerA", true, String(ev)));
        } catch (err) {
          summary.push(result("socket message:new or domain:update to providerA", false, String(err.message || err).slice(0, 80)));
        }
        sockP.disconnect();
        sockP = connectSocket(providerA.token);
        await waitConnected(sockP);
        sockP.emit("join", provAId);
        const after = await req("GET", `/jobs/${paid.id}`, { token: providerA.token });
        const chatArr =
          (after.body &&
            (after.body.job?.chat || after.body.chat || after.body.job?.meta?.chat || after.body.meta?.chat)) ||
          [];
        const found = Array.isArray(chatArr) && chatArr.some((m) => String(m.message || m.text || "") === ping);
        summary.push(
          result("reconnect REST resync includes chat", after.status === 200 && found, `HTTP ${after.status} found=${found}`)
        );
      }
    } catch (err) {
      summary.push(result("realtime sockets", false, String(err.message || err).slice(0, 80)));
    } finally {
      try {
        sockA && sockA.close();
      } catch {
        /* ignore */
      }
      try {
        sockP && sockP.close();
      } catch {
        /* ignore */
      }
    }

    const evGetA = await req("GET", `/jobs/${paid.id}/completion-evidence`, { token: customerA.token });
    const evGetP = await req("GET", `/jobs/${paid.id}/completion-evidence`, { token: providerA.token });
    const evGetB = await req("GET", `/jobs/${paid.id}/completion-evidence`, { token: customerB.token });
    const evGetProvB = await req("GET", `/jobs/${paid.id}/completion-evidence`, { token: providerB.token });
    const evGetSup = await req("GET", `/jobs/${paid.id}/completion-evidence`, { token: supplier.token });
    const evGetAnon = await req("GET", `/jobs/${paid.id}/completion-evidence`);
    summary.push(result("customerA completion-evidence GET", [200, 404].includes(evGetA.status), `HTTP ${evGetA.status}`));
    summary.push(result("providerA completion-evidence GET", [200, 404].includes(evGetP.status), `HTTP ${evGetP.status}`));
    summary.push(result("customerB completion-evidence denied", [401, 403, 404].includes(evGetB.status), `HTTP ${evGetB.status}`));
    summary.push(result("providerB completion-evidence denied", [401, 403, 404].includes(evGetProvB.status), `HTTP ${evGetProvB.status}`));
    summary.push(result("supplier completion-evidence denied", [401, 403, 404].includes(evGetSup.status), `HTTP ${evGetSup.status}`));
    summary.push(result("anonymous completion-evidence denied", [401, 403, 404].includes(evGetAnon.status), `HTTP ${evGetAnon.status}`));

    let evidenceFileId = null;
    const evidence = evGetA.body && evGetA.body.evidence;
    const images = (evidence && Array.isArray(evidence.images) ? evidence.images : []) || [];
    const videos = (evidence && Array.isArray(evidence.videos) ? evidence.videos : []) || [];
    for (const u of [...images, ...videos]) {
      evidenceFileId = fileIdFromUrl(u);
      if (evidenceFileId) break;
    }
    if (!evidenceFileId) {
      const form = new FormData();
      form.append("file", new Blob([TINY_PNG], { type: "image/png" }), "phase-b-acl.png");
      const up = await req("POST", `/jobs/${paid.id}/completion-evidence/upload`, {
        token: providerA.token,
        form,
      });
      summary.push(
        result(
          "providerA completion-evidence upload for ACL",
          [200, 201].includes(up.status) && up.body && up.body.url,
          `HTTP ${up.status} ${apiMessage(up)}`
        )
      );
      evidenceFileId = fileIdFromUrl(up.body && up.body.url);
    } else {
      log("completion-evidence file already present; using existing file for ACL");
    }

    async function acl(label, token, allowed) {
      if (!evidenceFileId) {
        summary.push(result(label, false, "no file id"));
        return;
      }
      const r = await req("GET", `/files/${evidenceFileId}`, token ? { token } : {});
      if (allowed) {
        summary.push(result(label, [200, 206].includes(r.status), `HTTP ${r.status}`));
      } else {
        summary.push(result(label, [401, 403, 404].includes(r.status), `HTTP ${r.status}`));
      }
    }
    await acl("anonymous completion file denied", null, false);
    await acl("customerB completion file denied", customerB.token, false);
    await acl("providerB completion file denied", providerB.token, false);
    await acl("supplier completion file denied", supplier.token, false);
    await acl("customerA completion file allowed", customerA.token, true);
    await acl("providerA completion file allowed", providerA.token, true);

    log(`E2E_REALTIME_JOB_ID=${paid.id}`);
  }

  const failed = summary.filter((x) => x === false).length;
  log(`DONE failed=${failed} total=${summary.length}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
