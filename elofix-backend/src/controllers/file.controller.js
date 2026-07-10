const path = require("path");
const { pipeline } = require("stream/promises");
const AppError = require("../utils/AppError");
const { resolveFileForDownload } = require("../services/fileStorage.service");
const { assertProtectedFileAccess } = require("../services/fileAccess.service");
const objectStorage = require("../services/objectStorage.service");

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

  assertProtectedFileAccess(req, file);

  const filename = contentDispositionFilename(file.originalName);
  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (file.absolutePath) {
    return res.sendFile(file.absolutePath);
  }

  const streamed = await objectStorage.streamLocalOrRemote(file.relPath, file.absolutePath);
  if (!streamed) {
    throw new AppError("File not found", 404);
  }

  if (streamed.contentType) {
    res.setHeader("Content-Type", streamed.contentType);
  }
  await pipeline(streamed.stream, res);
}

module.exports = {
  getFileById,
};
