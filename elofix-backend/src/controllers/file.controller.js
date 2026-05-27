const path = require("path");
const AppError = require("../utils/AppError");
const {
  assertActorCanDownloadFile,
  resolveFileForDownload,
} = require("../services/fileStorage.service");

function contentDispositionFilename(name) {
  const fallback = path.basename(String(name || "file"));
  return fallback.replace(/["\\\r\n]/g, "_");
}

async function getFileById(req, res) {
  const fileId = String(req.params.fileId || "").trim();
  const file = await resolveFileForDownload(fileId);
  if (!file) {
    throw new AppError("File not found", 404);
  }
  await assertActorCanDownloadFile(file, req.user);

  const filename = contentDispositionFilename(file.originalName);
  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.sendFile(file.absolutePath);
}

module.exports = {
  getFileById,
};
