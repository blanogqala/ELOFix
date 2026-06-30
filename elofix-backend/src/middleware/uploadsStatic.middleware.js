const path = require("path");
const express = require("express");
const {
  normalizeUploadRelPath,
  isBlockedUploadRelPath,
} = require("../utils/fileAccessPolicy.util");
const { UPLOAD_ROOT } = require("./upload.middleware");

const staticHandler = express.static(UPLOAD_ROOT, {
  dotfiles: "deny",
  index: false,
  fallthrough: true,
});

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

  return staticHandler(req, res, (err) => {
    if (err) return next(err);
    if (!res.headersSent) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    return undefined;
  });
}

module.exports = uploadsStaticMiddleware;
