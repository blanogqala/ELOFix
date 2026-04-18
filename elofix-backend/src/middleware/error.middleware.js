const AppError = require("../utils/AppError");

function errorMiddleware(err, req, res, next) {
  let statusCode = 500;
  let message = "Internal Server Error";

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err.name === "MulterError" || err.code === "LIMIT_FILE_SIZE") {
    statusCode = 400;
    message = err.message || "File upload error";
  } else if (err.code === "P2002") {
    statusCode = 409;
    message = "Resource already exists";
  }

  const body = { success: false, message };

  if (!(err instanceof AppError)) {
    // Keep API response safe, but always log unexpected errors for debugging.
    console.error("[ERROR]", req.method, req.originalUrl, err);
  }

  if (process.env.NODE_ENV !== "production" && err.stack) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
}

module.exports = errorMiddleware;
