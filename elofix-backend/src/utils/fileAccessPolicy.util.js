/** Provider KYC / verification document types — never serve without auth or signed URL. */
const PROTECTED_FILE_TYPES = new Set([
  "idDoc",
  "companyReg",
  "proofOfAddress",
  "proofOfSkill",
  "certifications",
  "jobQuotation",
  "jobCompletionImage",
  "jobCompletionVideo",
  "jobRequestImage",
]);

const COMPLETION_FILE_TYPES = new Set(["jobCompletionImage", "jobCompletionVideo"]);
const JOB_REQUEST_FILE_TYPES = new Set(["jobRequestImage"]);

/** Avatars, portfolio, supplier catalog imagery — safe for public <img src> usage. */
const PUBLIC_FILE_TYPES = new Set([
  "avatar",
  "workImage",
  "userAvatar",
  "supplier_product",
  "supplier_logo",
]);

function normalizeUploadRelPath(relPath) {
  const raw = String(relPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const segments = raw.split("/").filter((s) => s && s !== ".");
  if (segments.some((s) => s === "..")) return null;
  return segments.join("/");
}

function isBlockedUploadRelPath(relPath) {
  const normalized = normalizeUploadRelPath(relPath);
  if (!normalized) return true;
  if (/^providers\/[^/]+\/documents\//.test(normalized)) return true;
  if (/^jobs\/[^/]+\/quotations\//.test(normalized)) return true;
  if (/^jobs\/[^/]+\/completion\/(images|videos)\//.test(normalized)) return true;
  if (isJobRequestUploadRelPath(normalized)) return true;
  return false;
}

function isJobRequestUploadRelPath(relPath) {
  const normalized = normalizeUploadRelPath(relPath);
  if (!normalized) return false;
  if (/^jobs\/[^/]+\/quotations\//.test(normalized)) return false;
  if (/^jobs\/[^/]+\/completion\//.test(normalized)) return false;
  return /^jobs\/[^/]+\//.test(normalized);
}

function parseJobRequestOwnerUserId(relPath) {
  const normalized = normalizeUploadRelPath(relPath);
  if (!isJobRequestUploadRelPath(normalized)) return null;
  const match = normalized.match(/^jobs\/([^/]+)\//);
  return match ? match[1] : null;
}

function parseCompletionJobId(relPath) {
  const normalized = normalizeUploadRelPath(relPath);
  if (!normalized) return null;
  const match = normalized.match(/^jobs\/([^/]+)\/completion\/(images|videos)\//);
  return match ? match[1] : null;
}

function isCompletionFileType(type) {
  return COMPLETION_FILE_TYPES.has(String(type || "").trim());
}

function isJobRequestFileType(type) {
  return JOB_REQUEST_FILE_TYPES.has(String(type || "").trim());
}

function isProtectedFileType(type) {
  const t = String(type || "").trim();
  if (!t) return false;
  if (PUBLIC_FILE_TYPES.has(t)) return false;
  return PROTECTED_FILE_TYPES.has(t);
}

module.exports = {
  PROTECTED_FILE_TYPES,
  PUBLIC_FILE_TYPES,
  COMPLETION_FILE_TYPES,
  JOB_REQUEST_FILE_TYPES,
  normalizeUploadRelPath,
  isBlockedUploadRelPath,
  isJobRequestUploadRelPath,
  parseJobRequestOwnerUserId,
  parseCompletionJobId,
  isCompletionFileType,
  isJobRequestFileType,
  isProtectedFileType,
};
