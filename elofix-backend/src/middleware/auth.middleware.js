const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError");
const { assertAuthenticatedAccountActive } = require("../services/accountStatus.service");

function attachUserFromBearer(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return false;
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
    return true;
  } catch {
    return false;
  }
}

async function authenticate(req, res, next) {
  if (!attachUserFromBearer(req)) {
    return next(new AppError("Authentication required", 401));
  }
  try {
    await assertAuthenticatedAccountActive(req.user);
    return next();
  } catch (err) {
    return next(err);
  }
}

async function optionalAuthenticate(req, res, next) {
  if (!attachUserFromBearer(req)) {
    return next();
  }
  try {
    await assertAuthenticatedAccountActive(req.user);
    return next();
  } catch (err) {
    return next(err);
  }
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
