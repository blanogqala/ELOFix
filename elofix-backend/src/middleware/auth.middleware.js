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
      role: payload.role,
    };
    next();
  } catch {
    next(new AppError("Invalid or expired token", 401));
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

module.exports = { authenticate, authorizeRoles };
