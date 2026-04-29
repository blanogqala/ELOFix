const multer = require("multer");
const path = require("path");
const fs = require("fs");
const AppError = require("../utils/AppError");

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const ALLOWED_DOC = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function docFileFilter(req, file, cb) {
  if (!file.mimetype || !ALLOWED_DOC.has(file.mimetype)) {
    return cb(new AppError("Only PDF and image files are allowed for documents", 400));
  }
  cb(null, true);
}

function imageFileFilter(req, file, cb) {
  if (!file.mimetype || !ALLOWED_IMAGE.has(file.mimetype)) {
    return cb(new AppError("Only image files are allowed", 400));
  }
  cb(null, true);
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
      const ext = path.extname(file.originalname) || "";
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
      const ext = path.extname(file.originalname) || ".jpg";
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
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `work-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
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
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  });
}

const userIdFromParams = (req) => String(req.params.id || "").trim();

const uploadProviderDocument = multer({
  storage: providerDocStorage(userIdFromParams),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: docFileFilter,
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

const uploadJobImage = multer({
  storage: jobImageStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: imageFileFilter,
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
      const ext = path.extname(file.originalname) || ".jpg";
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
      const ext = path.extname(file.originalname) || ".jpg";
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
  uploadProviderDocument,
  uploadProviderAvatar,
  uploadWorkPostImage,
  uploadJobImage,
  uploadSupplierProductImage,
  uploadSupplierLogo,
  filePathToPublicUrl,
};
