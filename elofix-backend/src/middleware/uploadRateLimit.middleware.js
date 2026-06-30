const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");
const { consumeUploadSlot } = require("../services/uploadRateLimit.service");

/**
 * Resolve a real User id to attribute the upload quota to.
 *
 * Branch staff are stored in BranchUser (not User), so their token `userId`
 * is a BranchUser id. The upload rate-limit bucket / violation / audit tables
 * have a foreign key to User, so we attribute branch-staff uploads to their
 * supplier owner's User id. Returns null when no owner User can be resolved
 * (e.g. orphaned supplier), signalling that rate limiting should be skipped
 * rather than blocking a legitimate upload.
 */
async function resolveRateLimitUserId(user) {
  if (String(user.role || "").toUpperCase() !== "BRANCH_STAFF") {
    return String(user.userId);
  }

  const supplierOrgId = String(user.supplierOrgId || "").trim();
  if (supplierOrgId) {
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierOrgId },
      select: { userId: true },
    });
    if (supplier?.userId) return String(supplier.userId);
  }

  const branchId = String(user.branchId || "").trim();
  if (branchId) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { supplier: { select: { userId: true } } },
    });
    if (branch?.supplier?.userId) return String(branch.supplier.userId);
  }

  return null;
}

/**
 * Rate-limit middleware — place after multer so only successful file parses count.
 * Admins bypass limits for operational uploads.
 */
function uploadRateLimit(category) {
  return async (req, res, next) => {
    if (!req.user?.userId) {
      return next(new AppError("Authentication required", 401));
    }

    if (String(req.user.role || "").toUpperCase() === "ADMIN") {
      return next();
    }

    if (!req.file) {
      return next();
    }

    try {
      const rateLimitUserId = await resolveRateLimitUserId(req.user);
      if (!rateLimitUserId) {
        return next();
      }
      await consumeUploadSlot(rateLimitUserId, category, { req });
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { uploadRateLimit };
