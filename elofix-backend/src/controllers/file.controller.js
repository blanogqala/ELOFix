const path = require("path");
const AppError = require("../utils/AppError");
const { resolveFileForDownload } = require("../services/fileStorage.service");

const PRIVATE_FILE_TYPES = new Set([
  "idDoc",
  "companyReg",
  "proofOfAddress",
  "proofOfSkill",
  "certifications",
]);

function contentDispositionFilename(name) {
  const fallback = path.basename(String(name || "file"));
  return fallback.replace(/["\\\r\n]/g, "_");
}

function assertCanDownloadFile(req, file) {
  if (!PRIVATE_FILE_TYPES.has(String(file.type || ""))) {
    return;
  }
  const role = String(req.user?.role || "").toUpperCase();
  if (role === "ADMIN") return;
  if (file.ownerUserId && String(file.ownerUserId) === String(req.user?.userId || "")) return;
  throw new AppError(req.user ? "Forbidden" : "Authentication required", req.user ? 403 : 401);
}

async function getFileById(req, res) {
  const fileId = String(req.params.fileId || "").trim();
  const file = await resolveFileForDownload(fileId);
  if (!file) {
    throw new AppError("File not found", 404);
  }
  assertCanDownloadFile(req, file);

  const filename = contentDispositionFilename(file.originalName);
  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.sendFile(file.absolutePath);
}

module.exports = {
  getFileById,
};
