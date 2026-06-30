const { execFile } = require("child_process");
const { promisify } = require("util");
const AppError = require("../utils/AppError");

const execFileAsync = promisify(execFile);

function scanEnabled() {
  return String(process.env.FILE_SCAN_ENABLED || "").toLowerCase() === "true";
}

function scanCommand() {
  return String(process.env.FILE_SCAN_COMMAND || "clamscan").trim() || "clamscan";
}

/**
 * Optional malware scan hook. When FILE_SCAN_ENABLED=true, runs FILE_SCAN_COMMAND (default clamscan).
 * Integrate ClamAV or a cloud scanner without changing upload call sites.
 */
async function scanUploadedFile(absolutePath, metadata = {}) {
  if (!scanEnabled()) return { scanned: false, clean: true };

  const command = scanCommand();
  try {
    await execFileAsync(command, ["--no-summary", absolutePath], {
      timeout: Number(process.env.FILE_SCAN_TIMEOUT_MS || 120000),
    });
    return { scanned: true, clean: true };
  } catch (err) {
    if (err && (err.code === 1 || err.status === 1)) {
      console.warn("[file-scan] infected upload rejected", {
        path: absolutePath,
        originalName: metadata.originalName,
      });
      throw new AppError("Uploaded file failed malware scan", 400);
    }
    console.warn("[file-scan] scanner unavailable — allowing upload", err?.message || err);
    return { scanned: false, clean: true, scannerError: true };
  }
}

module.exports = {
  scanEnabled,
  scanUploadedFile,
};
