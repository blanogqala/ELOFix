const { toCents } = require("./money.util");

const EXPORT_MAX_BYTES = 2 * 1024 * 1024;
const EXPORT_TIMEOUT_MS = 15_000;
const EXPORT_MAX_REDIRECTS = 5;

function normalizeSettlementTxnReference(value) {
  return String(value == null ? "" : value).trim();
}

function safeExportUrlForLog(raw) {
  try {
    const parsed = new URL(String(raw || ""));
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  } catch {
    return "[invalid-url]";
  }
}

function isAllowedPaystackExportHostname(hostname) {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) return false;
  if (host === "files.paystack.co") return true;
  if (host.endsWith(".paystack.co")) return true;
  if (/^s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(host)) return true;
  if (/^[a-z0-9.-]+\.s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(host)) return true;
  if (/^[a-z0-9.-]+\.s3\.amazonaws\.com$/.test(host)) return true;
  return false;
}

function assertAllowedExportUrl(raw) {
  let parsed;
  try {
    parsed = new URL(String(raw || ""));
  } catch {
    const err = new Error("Paystack export path is not a valid URL");
    err.code = "PAYSTACK_EXPORT_URL_INVALID";
    throw err;
  }
  if (parsed.protocol !== "https:") {
    const err = new Error("Paystack export path must be HTTPS");
    err.code = "PAYSTACK_EXPORT_URL_INSECURE";
    throw err;
  }
  if (!isAllowedPaystackExportHostname(parsed.hostname)) {
    const err = new Error("Paystack export path host is not allowed");
    err.code = "PAYSTACK_EXPORT_URL_HOST";
    throw err;
  }
  return parsed.toString();
}

function headerName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function parseCsvRecords(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || (ch === "\r" && next === "\n") || ch === "\r") {
      row.push(field);
      field = "";
      if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
      row = [];
      if (ch === "\r" && next === "\n") i += 1;
      continue;
    }
    field += ch;
  }
  row.push(field);
  if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
  return rows;
}

function pickCsvValue(map, aliases) {
  for (const alias of aliases) {
    const key = headerName(alias);
    if (map[key] != null && String(map[key]).trim() !== "") return map[key];
  }
  return null;
}

function exportFeeToSubunits(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const cleaned = String(raw).replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  if (String(cleaned).includes(".")) return toCents(n);
  return Math.round(n);
}

function exportAmountToSubunits(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const cleaned = String(raw).replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (String(cleaned).includes(".")) return toCents(n);
  return Math.round(n);
}

function transactionsFromExportCsv(text) {
  const records = parseCsvRecords(text);
  if (records.length < 2) return [];
  const headers = records[0].map((h) => headerName(h));
  const out = [];
  for (const cells of records.slice(1)) {
    const map = {};
    headers.forEach((name, idx) => {
      if (!name) return;
      map[name] = cells[idx] != null ? String(cells[idx]) : "";
    });
    const reference = normalizeSettlementTxnReference(
      pickCsvValue(map, ["reference", "transaction reference", "transaction_reference", "ref"])
    );
    if (!reference) continue;
    const statusRaw = pickCsvValue(map, ["status", "transaction status"]);
    const feesSubunits = exportFeeToSubunits(pickCsvValue(map, ["fees", "fee", "paystack fees", "transaction fees"]));
    const amountSubunits = exportAmountToSubunits(
      pickCsvValue(map, ["amount", "transaction amount", "requested amount"])
    );
    const txn = { reference };
    if (statusRaw != null) txn.status = String(statusRaw).trim();
    if (amountSubunits != null) txn.amount = amountSubunits;
    if (feesSubunits != null) {
      txn.fees = feesSubunits;
      txn.fees_split = { paystack: feesSubunits };
      txn.bearer = "subaccount";
    }
    out.push(txn);
  }
  return out;
}

async function readLimitedBody(res, maxBytes) {
  const len = Number(res.headers.get("content-length"));
  if (Number.isFinite(len) && len > maxBytes) {
    const err = new Error("Paystack export exceeds size limit");
    err.code = "PAYSTACK_EXPORT_TOO_LARGE";
    throw err;
  }
  if (!res.body || typeof res.body.getReader !== "function") {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) {
      const err = new Error("Paystack export exceeds size limit");
      err.code = "PAYSTACK_EXPORT_TOO_LARGE";
      throw err;
    }
    return buf.toString("utf8");
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      const err = new Error("Paystack export exceeds size limit");
      err.code = "PAYSTACK_EXPORT_TOO_LARGE";
      throw err;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function downloadPaystackExportCsv(rawUrl, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const maxBytes = opts.maxBytes != null ? Number(opts.maxBytes) : EXPORT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs != null ? Number(opts.timeoutMs) : EXPORT_TIMEOUT_MS;
  let current = assertAllowedExportUrl(rawUrl);
  for (let hop = 0; hop <= EXPORT_MAX_REDIRECTS; hop += 1) {
    let res;
    try {
      res = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: "text/csv,text/plain,*/*" },
      });
    } catch (err) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError" || String(err?.message || "").includes("aborted")) {
        const wrapped = new Error("Paystack export download timed out");
        wrapped.code = "PAYSTACK_EXPORT_TIMEOUT";
        throw wrapped;
      }
      throw err;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        const err = new Error("Paystack export redirect missing location");
        err.code = "PAYSTACK_EXPORT_REDIRECT";
        throw err;
      }
      current = assertAllowedExportUrl(new URL(loc, current).toString());
      continue;
    }
    if (!res.ok) {
      const err = new Error(`Paystack export download HTTP ${res.status}`);
      err.code = "PAYSTACK_EXPORT_DOWNLOAD";
      err.httpStatus = res.status;
      throw err;
    }
    return readLimitedBody(res, maxBytes);
  }
  const err = new Error("Paystack export redirect limit exceeded");
  err.code = "PAYSTACK_EXPORT_REDIRECT";
  throw err;
}

module.exports = {
  EXPORT_MAX_BYTES,
  EXPORT_TIMEOUT_MS,
  normalizeSettlementTxnReference,
  safeExportUrlForLog,
  isAllowedPaystackExportHostname,
  assertAllowedExportUrl,
  transactionsFromExportCsv,
  downloadPaystackExportCsv,
};
