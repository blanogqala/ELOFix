const path = require("path");
const express = require("express");
const { pipeline } = require("stream/promises");
const {
  normalizeUploadRelPath,
  isBlockedUploadRelPath,
} = require("../utils/fileAccessPolicy.util");
const { UPLOAD_ROOT } = require("./upload.middleware");
const objectStorage = require("../services/objectStorage.service");

const staticHandler = express.static(UPLOAD_ROOT, {
  dotfiles: "deny",
  index: false,
  fallthrough: true,
});

async function serveFromObjectStorage(req, res, rel) {
  const absolutePath = path.resolve(UPLOAD_ROOT, rel.split("/").join(path.sep));
  const streamed = await objectStorage.streamLocalOrRemote(rel, absolutePath);
  if (!streamed) {
    return res.status(404).json({ success: false, message: "Not found" });
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=86400");
  if (streamed.contentType) {
    res.setHeader("Content-Type", streamed.contentType);
  }
  await pipeline(streamed.stream, res);
  return undefined;
}

function uploadsStaticMiddleware(req, res, next) {
  const rel = normalizeUploadRelPath(req.path);
  if (!rel) {
    return res.status(400).json({ success: false, message: "Invalid file path" });
  }
  if (isBlockedUploadRelPath(rel)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=86400");

  return staticHandler(req, res, async (err) => {
    if (err) return next(err);
    if (res.headersSent) return undefined;
    try {
      return await serveFromObjectStorage(req, res, rel);
    } catch (streamErr) {
      return next(streamErr);
    }
  });
}

module.exports = uploadsStaticMiddleware;
