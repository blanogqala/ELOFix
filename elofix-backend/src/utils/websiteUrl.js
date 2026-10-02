const AppError = require("./AppError");

const MAX_WEBSITE_URL_LENGTH = 2048;

/**
 * Optional public website. Empty clears the field. Only http(s) URLs without credentials.
 * @returns {symbol|string|null}
 */
function parseOptionalWebsiteUrl(raw) {
  if (raw === undefined) return Symbol.for("omit");
  if (raw === null || String(raw).trim() === "") return null;
  const s = String(raw).trim();
  if (s.length > MAX_WEBSITE_URL_LENGTH) {
    throw new AppError("Website URL is too long", 400);
  }
  if (/^\s*javascript:/i.test(s)) {
    throw new AppError("Website URL must use http or https", 400);
  }
  let url;
  try {
    url = new URL(s);
  } catch {
    throw new AppError("Website URL must be a valid http or https URL", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("Website URL must use http or https", 400);
  }
  if (url.username || url.password) {
    throw new AppError("Website URL must not include credentials", 400);
  }
  return url.toString();
}

module.exports = {
  parseOptionalWebsiteUrl,
  MAX_WEBSITE_URL_LENGTH,
};
