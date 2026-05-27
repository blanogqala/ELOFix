const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError");

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(new AppError("Authentication required", 401));
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      userId: payload.sub,
      id: payload.sub,
      email: payload.email,
      name: payload.name || null,
      role: payload.role,
      branchId: payload.branchId || null,
      supplierOrgId: payload.supplierOrgId || null,
    };
    next();
  } catch {
    next(new AppError("Invalid or expired token", 401));
  }
}

function optionalAuthenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next();
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      userId: payload.sub,
      id: payload.sub,
      email: payload.email,
      name: payload.name || null,
      role: payload.role,
      branchId: payload.branchId || null,
      supplierOrgId: payload.supplierOrgId || null,
    };
  } catch {
    // Public routes should remain browsable with a stale token; protected
    // resources will still reject because req.user is absent.
  }

  return next();
}

function authorizeRoles(allowedRoles) {
  const normalized = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.user?.role) {
      return next(new AppError("Authentication required", 401));
    }

    if (!normalized.includes(req.user.role)) {
      return next(new AppError("Forbidden", 403));
    }

    return next();
  };
}

/** Supplier portal: primary supplier account or branch-level staff. */
function authorizeSupplierPortal() {
  return (req, res, next) => {
    if (!req.user?.role) {
      return next(new AppError("Authentication required", 401));
    }
    if (req.user.role === "SUPPLIER" || req.user.role === "BRANCH_STAFF") {
      return next();
    }
    return next(new AppError("Forbidden", 403));
  };
}

module.exports = { authenticate, optionalAuthenticate, authorizeRoles, authorizeSupplierPortal };
