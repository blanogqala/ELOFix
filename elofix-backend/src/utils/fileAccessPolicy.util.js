/** Provider KYC / verification document types — never serve without auth or signed URL. */
const PROTECTED_FILE_TYPES = new Set([
  "idDoc",
  "companyReg",
  "proofOfAddress",
  "proofOfSkill",
  "certifications",
  "jobQuotation",
]);

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
  return false;
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
  normalizeUploadRelPath,
  isBlockedUploadRelPath,
  isProtectedFileType,
};
