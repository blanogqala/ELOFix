function calculateArea(lengthM, widthM) {
  return Number((Number(lengthM) * Number(widthM)).toFixed(2));
}

function toMeters(value, unit) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return unit === "cm" ? n / 100 : n;
}

function areaSquareMetersFromAssist(a) {
  if (!a || typeof a !== "object") return undefined;
  if (a.area !== undefined && a.area !== null && a.area !== "") {
    const ar = Number(a.area);
    if (Number.isFinite(ar) && ar > 0) return ar;
  }
  const unit = a.unit === "cm" ? "cm" : "m";
  const wM = toMeters(a.width, unit);
  if (wM === undefined || wM <= 0) return undefined;

  if (a.dimensionMode === "heightWidth") {
    const hM = toMeters(a.height, unit);
    if (hM === undefined || hM <= 0) return undefined;
    return calculateArea(hM, wM);
  }

  const lM = toMeters(a.length, unit);
  if (lM === undefined || lM <= 0) return undefined;
  return calculateArea(lM, wM);
}

const ALLOWED_TYPES = new Set(["area", "linear", "custom"]);
const ALLOWED_UNITS = new Set(["m", "cm"]);
const ALLOWED_SOURCES = new Set(["manual", "camera"]);
const ALLOWED_MODES = new Set(["lengthWidth", "heightWidth"]);

/**
 * Validates and normalizes optional cameraAssist on measurements.
 * @returns normalized object or undefined
 */
function parseCameraAssist(raw, AppError) {
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new AppError("measurements.cameraAssist must be an object", 400);
  }

  const type = String(raw.type || "area").trim();
  if (!ALLOWED_TYPES.has(type)) {
    throw new AppError("cameraAssist.type must be area, linear, or custom", 400);
  }

  const unit = String(raw.unit || "m").trim();
  if (!ALLOWED_UNITS.has(unit)) {
    throw new AppError("cameraAssist.unit must be m or cm", 400);
  }

  const source = String(raw.source || "manual").trim();
  if (!ALLOWED_SOURCES.has(source)) {
    throw new AppError("cameraAssist.source must be manual or camera", 400);
  }

  const dimensionMode = String(raw.dimensionMode || "lengthWidth").trim();
  if (!ALLOWED_MODES.has(dimensionMode)) {
    throw new AppError("cameraAssist.dimensionMode must be lengthWidth or heightWidth", 400);
  }

  const parseNum = (v, name) => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      throw new AppError(`${name} must be a number`, 400);
    }
    return n;
  };

  const length = parseNum(raw.length, "cameraAssist.length");
  const width = parseNum(raw.width, "cameraAssist.width");
  const height = parseNum(raw.height, "cameraAssist.height");
  let area = parseNum(raw.area, "cameraAssist.area");

  const imageUrl =
    raw.imageUrl !== undefined && raw.imageUrl !== null && String(raw.imageUrl).trim()
      ? String(raw.imageUrl).trim()
      : undefined;

  if (source === "camera") {
    if (dimensionMode === "lengthWidth") {
      if (length === undefined || length <= 0 || width === undefined || width <= 0) {
        throw new AppError("camera measurement requires positive length and width", 400);
      }
    } else {
      if (height === undefined || height <= 0 || width === undefined || width <= 0) {
        throw new AppError("camera measurement requires positive height and width", 400);
      }
    }
  }

  const areaM2 = areaSquareMetersFromAssist({
    type,
    unit,
    dimensionMode,
    length,
    width,
    height,
  });

  if (areaM2 !== undefined) {
    if (area === undefined) {
      area = areaM2;
    }
    if (source === "camera" && areaM2 < 0.5) {
      throw new AppError("Measurement too small (minimum 0.5 m²)", 400);
    }
  }

  const lengthM = length !== undefined ? toMeters(length, unit) : undefined;
  const widthM = width !== undefined ? toMeters(width, unit) : undefined;
  const heightM = height !== undefined ? toMeters(height, unit) : undefined;
  let areaM2Norm = areaM2;
  if (areaM2Norm === undefined && area !== undefined) {
    const ar = Number(area);
    if (Number.isFinite(ar) && ar > 0) areaM2Norm = ar;
  }
  const normalized = {
    ...(lengthM !== undefined && lengthM > 0 ? { lengthM: Number(lengthM.toFixed(6)) } : {}),
    ...(widthM !== undefined && widthM > 0 ? { widthM: Number(widthM.toFixed(6)) } : {}),
    ...(heightM !== undefined && heightM > 0 ? { heightM: Number(heightM.toFixed(6)) } : {}),
    ...(areaM2Norm !== undefined && areaM2Norm > 0 ? { areaM2: Number(areaM2Norm.toFixed(4)) } : {}),
  };

  return {
    type,
    unit,
    dimensionMode,
    ...(length !== undefined ? { length } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(area !== undefined ? { area } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    source,
    ...(Object.keys(normalized).length ? { normalized } : {}),
  };
}

module.exports = {
  calculateArea,
  toMeters,
  areaSquareMetersFromAssist,
  parseCameraAssist,
};
