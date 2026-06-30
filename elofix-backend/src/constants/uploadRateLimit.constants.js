const WINDOW_MS = 60 * 60 * 1000;

const UPLOAD_CATEGORIES = {
  PROVIDER_DOCUMENT: "provider_document",
  JOB_IMAGE: "job_image",
  COMPLETION_EVIDENCE: "completion_evidence",
  SUPPLIER_IMAGE: "supplier_image",
};

const LIMITS_PER_HOUR = {
  [UPLOAD_CATEGORIES.PROVIDER_DOCUMENT]: 20,
  [UPLOAD_CATEGORIES.JOB_IMAGE]: 100,
  [UPLOAD_CATEGORIES.COMPLETION_EVIDENCE]: 50,
  [UPLOAD_CATEGORIES.SUPPLIER_IMAGE]: 100,
};

const CATEGORY_LABELS = {
  [UPLOAD_CATEGORIES.PROVIDER_DOCUMENT]: "provider documents",
  [UPLOAD_CATEGORIES.JOB_IMAGE]: "job images",
  [UPLOAD_CATEGORIES.COMPLETION_EVIDENCE]: "completion evidence",
  [UPLOAD_CATEGORIES.SUPPLIER_IMAGE]: "supplier images",
};

function hourWindowKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}`;
}

function getLimitForCategory(category) {
  const limit = LIMITS_PER_HOUR[category];
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`Unknown upload rate limit category: ${category}`);
  }
  return limit;
}

module.exports = {
  WINDOW_MS,
  UPLOAD_CATEGORIES,
  LIMITS_PER_HOUR,
  CATEGORY_LABELS,
  hourWindowKey,
  getLimitForCategory,
};
