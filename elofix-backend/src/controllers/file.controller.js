const path = require("path");
const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");
const { resolveFileForDownload } = require("../services/fileStorage.service");

const PROVIDER_DOCUMENT_TYPES = new Set([
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

function privateRelPathKind(file) {
  const relPath = String(file?.relPath || "").split(path.sep).join("/");
  if (/^providers\/[^/]+\/documents\//.test(relPath)) return "providerDocument";
  if (/^jobs\/[^/]+\/quotations\//.test(relPath)) return "jobQuotation";
  return null;
}

async function assertCanDownloadFile(file, actor) {
  const type = String(file?.type || "");
  const privateKind =
    type === "jobQuotation"
      ? "jobQuotation"
      : PROVIDER_DOCUMENT_TYPES.has(type)
        ? "providerDocument"
        : privateRelPathKind(file);

  if (!privateKind) return;

  const role = String(actor?.role || "").toUpperCase();
  const actorUserId = actor?.userId || actor?.id;
  if (!actorUserId) {
    throw new AppError("Authentication required", 401);
  }
  if (role === "ADMIN") return;

  if (privateKind === "providerDocument") {
    if (String(file.ownerUserId || "") === String(actorUserId)) return;
    throw new AppError("Forbidden", 403);
  }

  const job = await prisma.job.findFirst({
    where: { quotationFileUrl: file.url },
    select: { customerId: true, providerId: true },
  });
  if (job) {
    if (String(job.customerId) === String(actorUserId)) return;
    if (String(job.providerId || "") === String(actorUserId)) return;
    throw new AppError("Forbidden", 403);
  }

  if (String(file.ownerUserId || "") === String(actorUserId)) return;
  throw new AppError("Forbidden", 403);
}

function hasValidDownloadToken(file, token) {
  if (!token || !process.env.JWT_SECRET) return false;
  try {
    const payload = jwt.verify(String(token), process.env.JWT_SECRET);
    return (
      payload?.purpose === "private_file_download" &&
      payload?.fileId &&
      String(payload.fileId) === String(file.fileId)
    );
  } catch {
    return false;
  }
}

async function getFileById(req, res) {
  const fileId = String(req.params.fileId || "").trim();
  const file = await resolveFileForDownload(fileId);
  if (!file) {
    throw new AppError("File not found", 404);
  }
  if (!hasValidDownloadToken(file, req.query?.token)) {
    await assertCanDownloadFile(file, req.user);
  }

  const filename = contentDispositionFilename(file.originalName);
  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.sendFile(file.absolutePath);
}

module.exports = {
  getFileById,
};
