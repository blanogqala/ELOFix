const multer = require("multer");
const path = require("path");
const fs = require("fs");
const AppError = require("../utils/AppError");

/** Local dev: elofix-backend/uploads. Production (Render): set UPLOAD_ROOT to a persistent disk mount. */
const UPLOAD_ROOT = process.env.UPLOAD_ROOT?.trim()
  ? path.resolve(process.env.UPLOAD_ROOT.trim())
  : path.join(__dirname, "..", "..", "uploads");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const {
  validateProviderDocumentFileMeta,
  normalizeExt: normalizeDocExt,
  MAX_BYTES: PROVIDER_DOC_MAX_BYTES,
} = require("../utils/providerDocumentFile.util");
const {
  extensionForImageMime,
  extensionForVideoMime,
} = require("../utils/uploadMagic.util");
const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const ALLOWED_QUOTATION_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

const { validateQuotationFileMeta, normalizeExt: normalizeQuotationExt, MAX_BYTES: QUOTATION_MAX_BYTES } = require("../utils/quotationFile.util");

function providerDocFileFilter(req, file, cb) {
  try {
    validateProviderDocumentFileMeta(file.originalname, file.mimetype, file.size ?? 0);
    cb(null, true);
  } catch (err) {
    cb(err instanceof AppError ? err : new AppError("Invalid document file", 400));
  }
}

function imageFileFilter(req, file, cb) {
  if (!file.mimetype || !ALLOWED_IMAGE.has(file.mimetype)) {
    return cb(new AppError("Only image files are allowed", 400));
  }
  cb(null, true);
}

function quotationFileFilter(req, file, cb) {
  try {
    validateQuotationFileMeta(file.originalname, file.mimetype, file.size ?? 0);
    cb(null, true);
  } catch (err) {
    cb(err instanceof AppError ? err : new AppError("Invalid quotation file", 400));
  }
}

function providerDocStorage(userIdFromReq) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uid = userIdFromReq(req);
      const dir = path.join(UPLOAD_ROOT, "providers", uid, "documents");
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = normalizeDocExt(file.originalname) || ".pdf";
      const safe = `${req.params.docType || "doc"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      cb(null, safe);
    },
  });
}

function providerAvatarStorage(userIdFromReq) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uid = userIdFromReq(req);
      const dir = path.join(UPLOAD_ROOT, "providers", uid, "avatar");
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = extensionForImageMime(file.mimetype, file.originalname);
      cb(null, `avatar-${Date.now()}${ext}`);
    },
  });
}

function workPostImageStorage(userIdFromReq) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uid = userIdFromReq(req);
      const dir = path.join(UPLOAD_ROOT, "providers", uid, "work-posts");
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = extensionForImageMime(file.mimetype, file.originalname);
      cb(null, `work-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  });
}

function customerAvatarStorage(userIdFromReq) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uid = userIdFromReq(req);
      const dir = path.join(UPLOAD_ROOT, "users", uid, "avatar");
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = extensionForImageMime(file.mimetype, file.originalname);
      cb(null, `avatar-${Date.now()}${ext}`);
    },
  });
}

function jobImageStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uid = String(req.user?.userId || req.user?.id || "anonymous").trim() || "anonymous";
      const dir = path.join(UPLOAD_ROOT, "jobs", uid);
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = extensionForImageMime(file.mimetype, file.originalname);
      cb(null, `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  });
}

const userIdFromParams = (req) => String(req.params.id || "").trim();

const uploadUserAvatar = multer({
  storage: customerAvatarStorage(userIdFromParams),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

const uploadProviderDocument = multer({
  storage: providerDocStorage(userIdFromParams),
  limits: { fileSize: PROVIDER_DOC_MAX_BYTES },
  fileFilter: providerDocFileFilter,
});

const uploadProviderAvatar = multer({
  storage: providerAvatarStorage(userIdFromParams),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

const uploadWorkPostImage = multer({
  storage: workPostImageStorage(userIdFromParams),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

const ALLOWED_VIDEO = new Set(["video/mp4", "video/webm", "video/quicktime"]);

function videoFileFilter(req, file, cb) {
  if (!file.mimetype || !ALLOWED_VIDEO.has(file.mimetype)) {
    return cb(new AppError("Only MP4, WebM, or MOV video files are allowed", 400));
  }
  cb(null, true);
}

function jobCompletionStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const jobId = String(req.params.id || "").trim() || "unknown";
      const sub = file.mimetype && file.mimetype.startsWith("video/") ? "videos" : "images";
      const dir = path.join(UPLOAD_ROOT, "jobs", jobId, "completion", sub);
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = file.mimetype?.startsWith("video/")
        ? extensionForVideoMime(file.mimetype, file.originalname)
        : extensionForImageMime(file.mimetype, file.originalname);
      cb(null, `completion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  });
}

const uploadJobCompletionMedia = multer({
  storage: jobCompletionStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && ALLOWED_VIDEO.has(file.mimetype)) return videoFileFilter(req, file, cb);
    return imageFileFilter(req, file, cb);
  },
});

const uploadJobImage = multer({
  storage: jobImageStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

function jobQuotationStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const jobId = String(req.params.id || "").trim() || "unknown";
      const dir = path.join(UPLOAD_ROOT, "jobs", jobId, "quotations");
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = normalizeQuotationExt(file.originalname) || ".pdf";
      cb(null, `quotation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  });
}

const uploadJobQuotation = multer({
  storage: jobQuotationStorage(),
  limits: { fileSize: QUOTATION_MAX_BYTES },
  fileFilter: quotationFileFilter,
});

function supplierProductImageStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uid = String(req.user?.userId || req.user?.id || "").trim() || "anonymous";
      const dir = path.join(UPLOAD_ROOT, "suppliers", uid, "product-images");
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = extensionForImageMime(file.mimetype, file.originalname);
      cb(null, `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  });
}

function supplierLogoStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uid = String(req.user?.userId || req.user?.id || "").trim() || "anonymous";
      const dir = path.join(UPLOAD_ROOT, "suppliers", uid, "store-logo");
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = extensionForImageMime(file.mimetype, file.originalname);
      cb(null, `logo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  });
}

const uploadSupplierProductImage = multer({
  storage: supplierProductImageStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

const uploadSupplierLogo = multer({
  storage: supplierLogoStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

/** Public URL path (same host as API) for stored files */
function filePathToPublicUrl(absolutePath) {
  const rel = path.relative(UPLOAD_ROOT, absolutePath).split(path.sep).join("/");
  return `/uploads/${rel}`;
}

module.exports = {
  UPLOAD_ROOT,
  uploadUserAvatar,
  uploadProviderDocument,
  uploadProviderAvatar,
  uploadWorkPostImage,
  uploadJobImage,
  uploadJobCompletionMedia,
  uploadJobQuotation,
  uploadSupplierProductImage,
  uploadSupplierLogo,
  filePathToPublicUrl,
};
