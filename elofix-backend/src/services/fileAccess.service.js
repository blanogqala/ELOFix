const crypto = require("crypto");
const AppError = require("../utils/AppError");
const { isProtectedFileType } = require("../utils/fileAccessPolicy.util");

const FILES_URL_PREFIX = "/api/files/";
const DEFAULT_TTL_SECONDS = Number(process.env.FILE_ACCESS_TTL_SECONDS || 3600);

function accessSecret() {
  const secret = process.env.FILE_ACCESS_SECRET || process.env.JWT_SECRET;
  if (!secret || String(secret).length < 8) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FILE_ACCESS_SECRET or JWT_SECRET must be set for protected file access");
    }
    return "dev-file-access-secret";
  }
  return String(secret);
}

function signPayload(fileId, exp) {
  return crypto.createHmac("sha256", accessSecret()).update(`${fileId}:${exp}`).digest("hex");
}

function signFileAccessUrl(fileId, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const id = String(fileId || "").trim();
  if (!id) return "";
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, Number(ttlSeconds) || DEFAULT_TTL_SECONDS);
  const access = signPayload(id, exp);
  return `${FILES_URL_PREFIX}${id}?access=${access}&exp=${exp}`;
}

function verifyFileAccessToken(fileId, access, exp) {
  const id = String(fileId || "").trim();
  const token = String(access || "").trim();
  const expiry = Number(exp);
  if (!id || !token || !Number.isFinite(expiry)) return false;
  if (expiry < Math.floor(Date.now() / 1000)) return false;
  const expected = signPayload(id, expiry);
  try {
    const a = Buffer.from(token, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function appendAccessToFileUrl(url, fileId) {
  const raw = String(url || "").trim();
  if (!raw || !fileId) return raw;
  if (raw.includes("access=") && raw.includes("exp=")) return raw;
  if (!raw.startsWith(FILES_URL_PREFIX)) return raw;
  const signed = signFileAccessUrl(fileId);
  const query = signed.includes("?") ? signed.slice(signed.indexOf("?") + 1) : "";
  return query ? `${raw}${raw.includes("?") ? "&" : "?"}${query}` : raw;
}

function canActorAccessProtectedFile(actor, file) {
  if (!file) return false;
  const role = String(actor?.role || "").toUpperCase();
  if (role === "ADMIN") return true;
  const ownerId = String(file.ownerUserId || "").trim();
  const actorId = String(actor?.userId || actor?.id || "").trim();
  if (ownerId && actorId && ownerId === actorId) return true;
  return false;
}

function assertProtectedFileAccess(req, file) {
  if (!isProtectedFileType(file.type)) return;

  const fileId = String(file.fileId || "").trim();
  if (
    verifyFileAccessToken(fileId, req.query?.access, req.query?.exp) ||
    (req.user && canActorAccessProtectedFile(req.user, file))
  ) {
    return;
  }

  throw new AppError("Forbidden", 403);
}

function signDocumentFields(documents) {
  if (!documents || typeof documents !== "object" || Array.isArray(documents)) {
    return documents;
  }
  const out = {};
  for (const [key, doc] of Object.entries(documents)) {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      out[key] = doc;
      continue;
    }
    const fileId = typeof doc.fileId === "string" ? doc.fileId.trim() : "";
    if (fileId && isProtectedFileType(doc.type || key)) {
      out[key] = {
        ...doc,
        url: signFileAccessUrl(fileId),
      };
    } else {
      out[key] = doc;
    }
  }
  return out;
}

module.exports = {
  FILES_URL_PREFIX,
  signFileAccessUrl,
  verifyFileAccessToken,
  appendAccessToFileUrl,
  canActorAccessProtectedFile,
  assertProtectedFileAccess,
  signDocumentFields,
};
