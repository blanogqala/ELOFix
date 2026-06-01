const path = require("path");
const AppError = require("../utils/AppError");
const { resolveFileForDownload } = require("../services/fileStorage.service");
const prisma = require("../config/prisma");

const PUBLIC_FILE_TYPES = new Set([
  "avatar",
  "userAvatar",
  "workImage",
  "supplier_product",
  "supplier_logo",
]);

const PROVIDER_DOCUMENT_TYPES = new Set([
  "document",
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

function actorIsOwnerOrAdmin(file, actor) {
  if (!actor?.userId) return false;
  if (String(actor.role || "").toUpperCase() === "ADMIN") return true;
  return Boolean(file.ownerUserId && String(file.ownerUserId) === String(actor.userId));
}

async function actorCanAccessJobQuotation(file, actor) {
  if (!actor?.userId) return false;
  if (String(actor.role || "").toUpperCase() === "ADMIN") return true;
  if (actorIsOwnerOrAdmin(file, actor)) return true;

  const job = await prisma.job.findFirst({
    where: { quotationFileUrl: file.url },
    select: { customerId: true, providerId: true },
  });
  if (!job) return false;

  const actorId = String(actor.userId);
  return String(job.customerId) === actorId || String(job.providerId || "") === actorId;
}

async function canAccessFile(file, actor) {
  const type = String(file.type || "");
  if (PUBLIC_FILE_TYPES.has(type)) return true;
  if (!type && !file.ownerUserId) return true;
  if (type === "jobQuotation") return actorCanAccessJobQuotation(file, actor);
  if (PROVIDER_DOCUMENT_TYPES.has(type)) return actorIsOwnerOrAdmin(file, actor);
  return actorIsOwnerOrAdmin(file, actor);
}

async function getFileById(req, res) {
  const fileId = String(req.params.fileId || "").trim();
  const file = await resolveFileForDownload(fileId);
  if (!file) {
    throw new AppError("File not found", 404);
  }
  if (!(await canAccessFile(file, req.user))) {
    throw new AppError(req.user ? "Forbidden" : "Authentication required", req.user ? 403 : 401);
  }

  const filename = contentDispositionFilename(file.originalName);
  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.sendFile(file.absolutePath);
}

module.exports = {
  getFileById,
};
