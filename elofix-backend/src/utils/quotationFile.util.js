const path = require("path");
const fs = require("fs/promises");
const AppError = require("./AppError");

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXT = new Set([".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"]);

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

const EXT_TO_MIME = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

function normalizeExt(originalname) {
  const ext = path.extname(String(originalname || "")).toLowerCase();
  return ext === ".jpeg" ? ".jpg" : ext;
}

function matchesPdf(buf) {
  return buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

function matchesPng(buf) {
  return (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  );
}

function matchesJpeg(buf) {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

function matchesOleDoc(buf) {
  return buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
}

function matchesZipOffice(buf) {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

function magicMatchesExt(ext, buf) {
  if (ext === ".pdf") return matchesPdf(buf);
  if (ext === ".png") return matchesPng(buf);
  if (ext === ".jpg") return matchesJpeg(buf);
  if (ext === ".doc") return matchesOleDoc(buf);
  if (ext === ".docx") return matchesZipOffice(buf);
  return false;
}

function validateQuotationFileMeta(originalname, mimetype, size) {
  const resolvedExt = normalizeExt(originalname);
  if (!ALLOWED_EXT.has(resolvedExt)) {
    throw new AppError("Quotation must be PDF, DOC, DOCX, JPG, or PNG", 400);
  }
  const expectedMime = EXT_TO_MIME[resolvedExt];
  const mime = String(mimetype || "").toLowerCase().split(";")[0].trim();
  if (!mime || !ALLOWED_MIME.has(mime)) {
    throw new AppError("Unsupported file type for quotation upload", 400);
  }
  if (expectedMime && mime !== expectedMime) {
    throw new AppError("File extension does not match file type", 400);
  }
  const byteSize = Number(size);
  if (Number.isFinite(byteSize) && byteSize > 0) {
    if (byteSize > MAX_BYTES) {
      throw new AppError("Quotation file must be 10MB or smaller", 400);
    }
  }
  return { ext: resolvedExt, mime };
}

async function assertQuotationFileMagic(absolutePath, ext) {
  const handle = await fs.open(absolutePath, "r");
  try {
    const buf = Buffer.alloc(8);
    await handle.read(buf, 0, 8, 0);
    if (!magicMatchesExt(ext, buf)) {
      throw new AppError("File content does not match allowed quotation types", 400);
    }
  } finally {
    await handle.close();
  }
}

function sanitizeDownloadFilename(name) {
  const base = path.basename(String(name || "quotation"));
  return base.replace(/["\\\r\n]/g, "_").slice(0, 200) || "quotation";
}

module.exports = {
  MAX_BYTES,
  ALLOWED_EXT,
  ALLOWED_MIME,
  normalizeExt,
  validateQuotationFileMeta,
  assertQuotationFileMagic,
  sanitizeDownloadFilename,
};
