const AppError = require("../utils/AppError");

function isPrismaKnownRequestError(err) {
  return Boolean(
    err &&
      typeof err.code === "string" &&
      err.code.startsWith("P") &&
      err.name === "PrismaClientKnownRequestError"
  );
}

function mapPrismaKnownError(err) {
  switch (err.code) {
    case "P2002":
      return { statusCode: 409, message: "Resource already exists" };
    case "P2025":
      return { statusCode: 404, message: "Record not found" };
    case "P2003":
      return { statusCode: 400, message: "Related record missing or invalid" };
    case "P2014":
      return { statusCode: 400, message: "Invalid relation change" };
    default:
      return {
        statusCode: 400,
        message: process.env.NODE_ENV === "production" ? "Database request failed" : err.message,
      };
  }
}

function errorMiddleware(err, req, res, next) {
  if (res.headersSent) {
    console.error("[ERROR] headers already sent", req.method, req.originalUrl, err);
    return;
  }

  let statusCode = 500;
  let message = "Internal Server Error";

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err.name === "MulterError" || err.code === "LIMIT_FILE_SIZE") {
    statusCode = 400;
    message = err.message || "File upload error";
  } else if (isPrismaKnownRequestError(err)) {
    if (process.env.NODE_ENV === "development") {
      try {
        console.error(
          "[Prisma dev]",
          req.method,
          req.originalUrl,
          err.code,
          err.message,
          err.meta != null ? JSON.stringify(err.meta) : ""
        );
      } catch (_) {
        console.error("[Prisma dev]", req.method, req.originalUrl, err.code, err.message);
      }
    }
    const mapped = mapPrismaKnownError(err);
    statusCode = mapped.statusCode;
    message = mapped.message;
    if (process.env.NODE_ENV !== "development") {
      console.error("[Prisma]", req.method, req.originalUrl, err.code, err.meta || "", err.message);
    }
  } else if (err.name === "PrismaClientValidationError") {
    statusCode = 400;
    message =
      process.env.NODE_ENV === "production" ? "Invalid request for database operation" : err.message;
    console.error("[Prisma validation]", req.method, req.originalUrl, err.message);
  }

  const body = { success: false, message };

  if (!(err instanceof AppError) && !isPrismaKnownRequestError(err) && err.name !== "PrismaClientValidationError") {
    console.error("[ERROR]", req.method, req.originalUrl, err && err.stack ? err.stack : err);
  }

  if (process.env.NODE_ENV !== "production" && err.stack) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
}

module.exports = errorMiddleware;
