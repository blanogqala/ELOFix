const path = require("path");
const fs = require("fs/promises");
const AppError = require("./AppError");

const IMAGE_MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const ALLOWED_IMAGE_EXT = new Set(Object.values(IMAGE_MIME_TO_EXT));

function normalizeExt(originalname) {
  const ext = path.extname(String(originalname || "")).toLowerCase();
  if (ext === ".jpeg") return ".jpg";
  return ext;
}

function extensionForImageMime(mimetype, originalname) {
  const mime = String(mimetype || "").toLowerCase().split(";")[0].trim();
  if (IMAGE_MIME_TO_EXT[mime]) return IMAGE_MIME_TO_EXT[mime];
  const fromName = normalizeExt(originalname);
  if (ALLOWED_IMAGE_EXT.has(fromName)) return fromName;
  return ".jpg";
}

function extensionForVideoMime(mimetype, originalname) {
  const mime = String(mimetype || "").toLowerCase().split(";")[0].trim();
  if (mime === "video/mp4" || mime === "video/quicktime") return ".mp4";
  if (mime === "video/webm") return ".webm";
  const fromName = normalizeExt(originalname);
  if ([".mp4", ".webm", ".mov"].includes(fromName)) {
    return fromName === ".mov" ? ".mp4" : fromName;
  }
  return ".mp4";
}

function matchesJpeg(buf) {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
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

function matchesGif(buf) {
  return (
    buf.length >= 6 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  );
}

function matchesWebp(buf) {
  return (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  );
}

function matchesMp4OrMov(buf) {
  return (
    buf.length >= 12 &&
    buf[4] === 0x66 &&
    buf[5] === 0x74 &&
    buf[6] === 0x79 &&
    buf[7] === 0x70
  );
}

function matchesWebm(buf) {
  return buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
}

function imageMagicMatchesExt(ext, buf) {
  if (ext === ".jpg") return matchesJpeg(buf);
  if (ext === ".png") return matchesPng(buf);
  if (ext === ".gif") return matchesGif(buf);
  if (ext === ".webp") return matchesWebp(buf);
  return false;
}

function videoMagicMatches(buf) {
  return matchesMp4OrMov(buf) || matchesWebm(buf);
}

async function readFileHeader(absolutePath, byteCount = 16) {
  const handle = await fs.open(absolutePath, "r");
  try {
    const buf = Buffer.alloc(byteCount);
    await handle.read(buf, 0, byteCount, 0);
    return buf;
  } finally {
    await handle.close();
  }
}

async function assertImageFileMagic(absolutePath, ext) {
  const resolvedExt = ALLOWED_IMAGE_EXT.has(ext) ? ext : extensionForImageMime("", absolutePath);
  const buf = await readFileHeader(absolutePath, 16);
  if (!imageMagicMatchesExt(resolvedExt, buf)) {
    throw new AppError("File content does not match allowed image types", 400);
  }
  return resolvedExt;
}

async function assertVideoFileMagic(absolutePath) {
  const buf = await readFileHeader(absolutePath, 16);
  if (!videoMagicMatches(buf)) {
    throw new AppError("File content does not match allowed video types", 400);
  }
}

module.exports = {
  IMAGE_MIME_TO_EXT,
  ALLOWED_IMAGE_EXT,
  normalizeExt,
  extensionForImageMime,
  extensionForVideoMime,
  assertImageFileMagic,
  assertVideoFileMagic,
};
