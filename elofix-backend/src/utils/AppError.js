class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode=400]
   * @param {string} [code] stable client-facing error code
   */
  constructor(message, statusCode = 400, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    if (!this.code) {
      this.code = statusCode === 404 ? "NOT_FOUND" : "ERROR";
    }
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
