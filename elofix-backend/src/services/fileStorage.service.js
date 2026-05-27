const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");
const { UPLOAD_ROOT } = require("../middleware/upload.middleware");

const FILES_URL_PREFIX = "/api/files/";
const DOC_TYPES = new Set([
  "idDoc",
  "companyReg",
  "proofOfAddress",
  "proofOfSkill",
  "certifications",
]);
const PUBLIC_FILE_TYPES = new Set(["avatar", "workImage"]);
const IMAGE_EXT_TO_MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toApiFileUrl(fileId) {
  return `${FILES_URL_PREFIX}${fileId}`;
}

function safeRelativeToUploads(absolutePath) {
  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  const normalizedAbs = path.resolve(absolutePath);
  const rel = path.relative(normalizedRoot, normalizedAbs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  return rel.split(path.sep).join("/");
}

async function existsFile(absolutePath) {
  try {
    const stat = await fs.stat(absolutePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function inferMimeType(mimeType, absolutePath) {
  if (mimeType && typeof mimeType === "string" && mimeType.trim()) {
    return mimeType;
  }
  const ext = path.extname(String(absolutePath || "")).toLowerCase();
  return IMAGE_EXT_TO_MIME[ext] || "application/octet-stream";
}

async function registerFilePath(absolutePath, metadata = {}) {
  const relPath = safeRelativeToUploads(absolutePath);
  if (!relPath) {
    throw new AppError("Invalid file location", 400);
  }
  if (!(await existsFile(absolutePath))) {
    throw new AppError("Uploaded file not found on disk", 404);
  }

  const fileId = randomUUID();
  const record = {
    relPath,
    originalName: metadata.originalName || path.basename(absolutePath),
    mimeType: inferMimeType(metadata.mimeType, absolutePath),
    ownerUserId: metadata.ownerUserId ? String(metadata.ownerUserId) : null,
    type: metadata.type ? String(metadata.type) : null,
  };

  await prisma.storedFile.create({
    data: {
      id: fileId,
      relPath: record.relPath,
      originalName: record.originalName,
      mimeType: record.mimeType,
      ownerUserId: record.ownerUserId,
      type: record.type,
    },
  });

  return {
    fileId,
    url: toApiFileUrl(fileId),
    originalName: record.originalName,
    mimeType: record.mimeType,
    type: record.type,
  };
}

async function registerUploadedFile(file, metadata = {}) {
  if (!file || !file.path) {
    throw new AppError("File is required", 400);
  }
  return registerFilePath(file.path, {
    ...metadata,
    originalName: metadata.originalName || file.originalname,
    mimeType: metadata.mimeType || file.mimetype,
  });
}

async function getRegisteredFile(fileId) {
  const rec = await prisma.storedFile.findUnique({ where: { id: fileId } });
  if (!rec) return null;
  const abs = path.resolve(UPLOAD_ROOT, rec.relPath || "");
  if (!(await existsFile(abs))) return null;
  return {
    fileId: rec.id,
    relPath: rec.relPath,
    originalName: rec.originalName,
    mimeType: rec.mimeType,
    ownerUserId: rec.ownerUserId || undefined,
    type: rec.type || undefined,
    createdAt: rec.createdAt,
    absolutePath: abs,
    url: toApiFileUrl(rec.id),
  };
}

function parseApiFilesUrl(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith(FILES_URL_PREFIX)) return null;
  return raw.slice(FILES_URL_PREFIX.length);
}

function parseLegacyTokenParts(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const decoded = decodeURIComponent(raw);
  if (!decoded.includes(":")) return null;
  const parts = decoded.split(":").map((x) => x.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return { decoded, parts };
}

function detectLegacyKind(parts) {
  const first = String(parts[0] || "").toLowerCase();
  if (first.includes("doc")) return "document";
  if (first.includes("avatar")) return "avatar";
  if (first.includes("work")) return "workImage";
  return "document";
}

function extractDocType(parts, fallbackDocType) {
  for (const part of parts) {
    if (DOC_TYPES.has(part)) return part;
  }
  if (DOC_TYPES.has(fallbackDocType)) return fallbackDocType;
  return "idDoc";
}

function readUuidCandidates(parts, fallbackOwnerUserId) {
  const candidates = new Set();
  for (const part of parts) {
    if (UUID_RE.test(part)) candidates.add(part);
  }
  if (fallbackOwnerUserId && UUID_RE.test(String(fallbackOwnerUserId))) {
    candidates.add(String(fallbackOwnerUserId));
  }
  return Array.from(candidates);
}

async function listFilesSorted(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile());
    const withStats = await Promise.all(
      files.map(async (entry) => {
        const absolutePath = path.join(dir, entry.name);
        const stat = await fs.stat(absolutePath);
        return { absolutePath, name: entry.name, mtimeMs: stat.mtimeMs };
      })
    );
    withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return withStats;
  } catch {
    return [];
  }
}

function matchingPrefix(kind, docType) {
  if (kind === "document") return `${docType || "idDoc"}-`;
  if (kind === "avatar") return "avatar-";
  return "work-";
}

function extractTokenFromAny(input) {
  const parsed = parseApiFilesUrl(input);
  if (parsed) return parsed;
  const raw = String(input || "").trim();
  if (raw.includes("%3A") || raw.includes(":")) return raw;
  return null;
}

async function registerLegacyResolvedFile(token, context = {}) {
  const parsed = parseLegacyTokenParts(token);
  if (!parsed) return null;

  const kind = context.kind || detectLegacyKind(parsed.parts);
  const docType = extractDocType(parsed.parts, context.docType);
  const ownerCandidates = readUuidCandidates(parsed.parts, context.ownerUserId);
  const prefix = matchingPrefix(kind, docType);

  for (const ownerUserId of ownerCandidates) {
    const baseDir = path.join(UPLOAD_ROOT, "providers", ownerUserId);
    const dir =
      kind === "document"
        ? path.join(baseDir, "documents")
        : kind === "avatar"
          ? path.join(baseDir, "avatar")
          : path.join(baseDir, "work-posts");
    const files = await listFilesSorted(dir);
    const match = files.find((f) => f.name.startsWith(prefix)) || files[0];
    if (!match) continue;

    return registerFilePath(match.absolutePath, {
      ownerUserId,
      type: kind === "document" ? docType : kind,
      originalName: match.name,
    });
  }

  return null;
}

async function resolveExistingFileReference(reference, context = {}) {
  const raw = String(reference || "").trim();
  if (!raw) return null;

  const apiToken = parseApiFilesUrl(raw);
  if (apiToken && UUID_RE.test(apiToken)) {
    const existing = await getRegisteredFile(apiToken);
    if (existing) {
      return {
        fileId: existing.fileId,
        url: existing.url,
        originalName: existing.originalName,
        type: existing.type,
      };
    }
  }

  if (raw.startsWith("/uploads/")) {
    const rel = raw.replace(/^\/+uploads\/?/, "");
    const absolutePath = path.resolve(UPLOAD_ROOT, rel.split("/").join(path.sep));
    if (await existsFile(absolutePath)) {
      return registerFilePath(absolutePath, {
        ownerUserId: context.ownerUserId,
        type: context.type || context.docType,
      });
    }
  }

  const token = extractTokenFromAny(raw);
  if (!token) return null;
  return registerLegacyResolvedFile(token, context);
}

async function resolveFileForDownload(fileIdParam) {
  const raw = String(fileIdParam || "").trim();
  if (!raw) return null;
  const decoded = decodeURIComponent(raw);

  if (UUID_RE.test(decoded)) {
    const found = await getRegisteredFile(decoded);
    if (found) return found;
  }

  const legacy = await registerLegacyResolvedFile(decoded);
  if (!legacy) return null;
  return getRegisteredFile(legacy.fileId);
}

async function assertActorCanDownloadFile(file, actor) {
  if (!file) return;

  const type = String(file.type || "").trim();
  if (PUBLIC_FILE_TYPES.has(type)) {
    return;
  }

  const actorUserId = String(actor?.userId || actor?.id || "").trim();
  const actorRole = String(actor?.role || "").toUpperCase();
  if (!actorUserId) {
    throw new AppError("Authentication required", 401);
  }
  if (actorRole === "ADMIN") {
    return;
  }

  if (DOC_TYPES.has(type)) {
    if (file.ownerUserId && String(file.ownerUserId) === actorUserId) {
      return;
    }
    throw new AppError("Forbidden", 403);
  }

  if (type === "jobQuotation") {
    const job = await prisma.job.findFirst({
      where: { quotationFileUrl: toApiFileUrl(file.fileId) },
      select: { customerId: true, providerId: true },
    });
    if (
      job &&
      (String(job.customerId) === actorUserId || String(job.providerId || "") === actorUserId)
    ) {
      return;
    }
    if (file.ownerUserId && String(file.ownerUserId) === actorUserId) {
      return;
    }
    throw new AppError("Forbidden", 403);
  }

  if (file.ownerUserId && String(file.ownerUserId) === actorUserId) {
    return;
  }
  throw new AppError("Forbidden", 403);
}

module.exports = {
  FILES_URL_PREFIX,
  toApiFileUrl,
  registerUploadedFile,
  resolveExistingFileReference,
  resolveFileForDownload,
  assertActorCanDownloadFile,
};
