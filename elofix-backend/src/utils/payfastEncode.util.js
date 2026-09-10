/**
 * PayFast Custom Integration encoding (PHP urlencode semantics).
 * Used for both checkout signatures and ITN reconstruction.
 */

function payfastUrlEncode(value) {
  const input = String(value ?? "");
  const bytes = Buffer.from(input, "utf8");
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];
    if (
      (byte >= 0x30 && byte <= 0x39) ||
      (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a) ||
      byte === 0x2d ||
      byte === 0x5f ||
      byte === 0x2e
    ) {
      out += String.fromCharCode(byte);
    } else if (byte === 0x20) {
      out += "+";
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

function decodeFormComponent(raw) {
  const s = String(raw ?? "").replace(/\+/g, "%20");
  try {
    return decodeURIComponent(s);
  } catch {
    return String(raw ?? "").replace(/\+/g, " ");
  }
}

function parsePayfastFormPairs(rawBody) {
  const text = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  if (!text) return [];
  const pairs = [];
  for (const part of text.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    const rawVal = eq === -1 ? "" : part.slice(eq + 1);
    pairs.push({
      key: decodeFormComponent(rawKey),
      value: decodeFormComponent(rawVal),
    });
  }
  return pairs;
}

/**
 * @param {Array<{ key: string, value: unknown }>} entries
 * @param {string} [passphrase]
 * @param {{ trimValues?: boolean, skipEmpty?: boolean, stopAtSignature?: boolean }} [options]
 */
function buildPayfastParamString(entries, passphrase, options = {}) {
  const trimValues = options.trimValues !== false;
  const skipEmpty = options.skipEmpty !== false;
  const stopAtSignature = options.stopAtSignature === true;
  const parts = [];
  for (const { key, value } of entries) {
    if (!key) continue;
    if (key === "signature") {
      if (stopAtSignature) break;
      continue;
    }
    if (value == null) continue;
    const prepared = trimValues ? String(value).trim() : String(value);
    if (skipEmpty && prepared === "") continue;
    parts.push(`${key}=${payfastUrlEncode(prepared)}`);
  }
  let paramString = parts.join("&");
  const pass = passphrase == null ? "" : String(passphrase);
  if (pass) {
    paramString += `&passphrase=${payfastUrlEncode(trimValues ? pass.trim() : pass)}`;
  }
  return paramString;
}

module.exports = {
  payfastUrlEncode,
  decodeFormComponent,
  parsePayfastFormPairs,
  buildPayfastParamString,
};
