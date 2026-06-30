const fs = require("fs/promises");
const AppError = require("./AppError");
const {
  extensionForImageMime,
  extensionForVideoMime,
  assertImageFileMagic,
  assertVideoFileMagic,
} = require("./uploadMagic.util");
const { scanUploadedFile } = require("../services/fileScan.service");

async function unlinkQuietly(absolutePath) {
  if (!absolutePath) return;
  try {
    await fs.unlink(absolutePath);
  } catch {
    // ignore missing file
  }
}

async function validateUploadedImageFile(file) {
  if (!file?.path) {
    throw new AppError("File is required", 400);
  }
  const ext = extensionForImageMime(file.mimetype, file.originalname);
  try {
    await assertImageFileMagic(file.path, ext);
    await scanUploadedFile(file.path, { originalName: file.originalname });
  } catch (err) {
    await unlinkQuietly(file.path);
    throw err;
  }
  return ext;
}

async function validateUploadedVideoFile(file) {
  if (!file?.path) {
    throw new AppError("File is required", 400);
  }
  try {
    await assertVideoFileMagic(file.path);
    await scanUploadedFile(file.path, { originalName: file.originalname });
  } catch (err) {
    await unlinkQuietly(file.path);
    throw err;
  }
  return extensionForVideoMime(file.mimetype, file.originalname);
}

async function validateUploadedCompletionMedia(file) {
  if (!file?.path) {
    throw new AppError("File is required", 400);
  }
  const mime = String(file.mimetype || "").toLowerCase();
  if (mime.startsWith("video/")) {
    return validateUploadedVideoFile(file);
  }
  return validateUploadedImageFile(file);
}

module.exports = {
  unlinkQuietly,
  validateUploadedImageFile,
  validateUploadedVideoFile,
  validateUploadedCompletionMedia,
};
