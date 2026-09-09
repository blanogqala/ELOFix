const { getOrRegisterRelPath } = require("./fileStorage.service");
const { signFileAccessUrl, FILES_URL_PREFIX } = require("./fileAccess.service");
const { normalizeUploadRelPath, isJobRequestUploadRelPath } = require("../utils/fileAccessPolicy.util");

function uploadsRelFromUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const parsed = new URL(raw);
      if (parsed.pathname.startsWith("/uploads/")) {
        return normalizeUploadRelPath(parsed.pathname.replace(/^\/uploads\//, ""));
      }
    }
  } catch {
    /* ignore */
  }
  if (raw.startsWith("/uploads/")) {
    return normalizeUploadRelPath(raw.replace(/^\/uploads\//, ""));
  }
  return null;
}

function fileIdFromApiUrl(url) {
  const raw = String(url || "").trim();
  const pathOnly = raw.split("?")[0];
  if (!pathOnly.startsWith(FILES_URL_PREFIX)) return null;
  const id = pathOnly.slice(FILES_URL_PREFIX.length).replace(/\/+$/, "");
  return id || null;
}

async function signJobRequestImageUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return raw;
  const existingId = fileIdFromApiUrl(raw);
  if (existingId) {
    return signFileAccessUrl(existingId);
  }
  const rel = uploadsRelFromUrl(raw);
  if (!rel || !isJobRequestUploadRelPath(rel)) return raw;
  const stored = await getOrRegisterRelPath(rel, {
    type: "jobRequestImage",
    originalName: rel.split("/").pop(),
  });
  if (!stored?.fileId) return raw;
  return signFileAccessUrl(stored.fileId);
}

async function signJobRequestImageList(urls) {
  const list = Array.isArray(urls) ? urls : [];
  return Promise.all(list.map((u) => signJobRequestImageUrl(u)));
}

module.exports = {
  signJobRequestImageUrl,
  signJobRequestImageList,
};
