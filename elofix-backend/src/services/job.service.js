const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { parseCameraAssist } = require("../utils/measurements");
const { randomUUID } = require("crypto");
const {
  getJobMeta,
  mutateJobMeta,
  mutateJobMetaInTransaction,
  enrichJob,
  createNote,
  createChat,
  createDefaultJobMeta,
  normalizeMeta,
} = require("./jobMeta.service");
const earningService = require("./earning.service");
const paymentService = require("./payment.service");
const notificationEvents = require("./notificationEvents.service");
const { logAudit } = require("./auditLog.service");
const { idempotencyGate, idempotencyCommit } = require("../utils/idempotencyTransaction");
const jobProgressUtil = require("../utils/jobProgress.util");
const { upsertProviderReviewForJob, normalizeRating } = require("./providerReview.service");
const { expandLaborPricingFromPaidJob } = require("./provider.service");
const {
  registerUploadedFile,
  resolveFileForDownload,
  FILES_URL_PREFIX,
} = require("./fileStorage.service");
const {
  validateQuotationFileMeta,
  assertQuotationFileMagic,
  sanitizeDownloadFilename,
  MAX_BYTES: QUOTATION_MAX_BYTES,
} = require("../utils/quotationFile.util");

const jobInclude = {
  customer: {
    select: { id: true, name: true, email: true, role: true },
  },
  provider: {
    select: { id: true, name: true, email: true, role: true },
  },
};

function jobSiteAddressFromRow(job) {
  const loc = job.locationDetails;
  if (loc && typeof loc === "object" && !Array.isArray(loc)) {
    const parts = [loc.address, loc.suburb, loc.area, loc.city].filter(Boolean);
    if (parts.length) return parts.join(", ");
  }
  const l = job.location;
  if (l && String(l).trim() && String(l).trim() !== "UNKNOWN") return String(l).trim();
  return "";
}

function jobSiteLocationFromRow(job) {
  const loc = job.locationDetails;
  const address = jobSiteAddressFromRow(job);
  if (loc && typeof loc === "object" && !Array.isArray(loc)) {
    const coords =
      loc.coordinates &&
      typeof loc.coordinates === "object" &&
      Number.isFinite(Number(loc.coordinates.lat)) &&
      Number.isFinite(Number(loc.coordinates.lng))
        ? { lat: Number(loc.coordinates.lat), lng: Number(loc.coordinates.lng) }
        : Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))
          ? { lat: Number(loc.lat), lng: Number(loc.lng) }
          : undefined;
    return {
      address,
      city: loc.city ? String(loc.city) : undefined,
      area: loc.area ? String(loc.area) : undefined,
      suburb: loc.suburb ? String(loc.suburb) : undefined,
      coordinates: coords,
    };
  }
  return { address };
}

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function parseOptionalNumber(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    throw new AppError(`${fieldName} must be a number`, 400);
  }

  return numericValue;
}

function parseMeasurements(measurements, fallbackValues = {}) {
  if (measurements === undefined || measurements === null) {
    const width = parseOptionalNumber(fallbackValues.width, "width");
    const height = parseOptionalNumber(fallbackValues.height, "height");
    const length = parseOptionalNumber(fallbackValues.length, "length");
    let area = parseOptionalNumber(fallbackValues.area, "area");

    if (area === undefined) {
      if (width !== undefined && length !== undefined) {
        area = width * length;
      } else if (width !== undefined && height !== undefined) {
        area = width * height;
      }
    }

    if (
      width === undefined &&
      height === undefined &&
      length === undefined &&
      area === undefined
    ) {
      return null;
    }

    return {
      measurements: {
        source: "MANUAL",
        values: {
          ...(width !== undefined ? { width } : {}),
          ...(height !== undefined ? { height } : {}),
          ...(length !== undefined ? { length } : {}),
          ...(area !== undefined ? { area } : {}),
        },
      },
      width,
      height,
      length,
      area,
    };
  }

  if (typeof measurements !== "object" || Array.isArray(measurements)) {
    throw new AppError("measurements must be an object", 400);
  }

  const source = measurements.source;
  if (source !== undefined && source !== "MANUAL" && source !== "AI") {
    throw new AppError("measurements.source must be MANUAL or AI", 400);
  }

  const valuesCandidate =
    measurements.values && typeof measurements.values === "object" && !Array.isArray(measurements.values)
      ? measurements.values
      : {};

  const values = { ...valuesCandidate };
  const width = parseOptionalNumber(
    values.width !== undefined ? values.width : fallbackValues.width,
    "width"
  );
  const height = parseOptionalNumber(
    values.height !== undefined ? values.height : fallbackValues.height,
    "height"
  );
  const length = parseOptionalNumber(
    values.length !== undefined ? values.length : fallbackValues.length,
    "length"
  );
  let area = parseOptionalNumber(
    values.area !== undefined ? values.area : fallbackValues.area,
    "area"
  );

  if (area === undefined) {
    if (width !== undefined && length !== undefined) {
      area = width * length;
    } else if (width !== undefined && height !== undefined) {
      area = width * height;
    }
  }

  if (width !== undefined) values.width = width;
  if (height !== undefined) values.height = height;
  if (length !== undefined) values.length = length;
  if (area !== undefined) values.area = area;

  return {
    measurements: {
      source: source || "MANUAL",
      values,
    },
    width,
    height,
    length,
    area,
  };
}

async function resolveProviderUserId(selectedProviderId) {
  if (!selectedProviderId) {
    return undefined;
  }

  const rawId = String(selectedProviderId).trim();
  if (!rawId) {
    return undefined;
  }

  const providerUser = await prisma.user.findFirst({
    where: { id: rawId, role: "PROVIDER" },
    select: { id: true },
  });
  if (providerUser) {
    return providerUser.id;
  }

  const providerProfile = await prisma.provider.findFirst({
    where: {
      OR: [{ id: rawId }, { userId: rawId }],
    },
    select: {
      userId: true,
      approved: true,
      profileCompleted: true,
      blocked: true,
      deletedAt: true,
    },
  });

  if (providerProfile) {
    if (
      providerProfile.deletedAt ||
      providerProfile.blocked ||
      providerProfile.approved !== true ||
      providerProfile.profileCompleted !== true
    ) {
      throw new AppError("Selected provider is not available for booking", 400);
    }
    return providerProfile.userId;
  }

  throw new AppError("selectedProviderId does not exist", 400);
}

function parseLocation(location) {
  if (location === undefined || location === null || location === "") {
    return { location: "UNKNOWN", locationDetails: null };
  }

  if (typeof location === "string") {
    const trimmed = location.trim();
    return {
      location: trimmed || "UNKNOWN",
      locationDetails: trimmed ? { address: trimmed } : null,
    };
  }

  if (typeof location !== "object" || Array.isArray(location)) {
    throw new AppError("location must be a string or object", 400);
  }

  const {
    address = undefined,
    city = undefined,
    area = undefined,
    suburb = undefined,
    notes = undefined,
    coordinates = undefined,
  } = location;

  const details = {};
  if (address !== undefined && address !== null && String(address).trim()) details.address = String(address).trim();
  if (city !== undefined && city !== null && String(city).trim()) details.city = String(city).trim();
  if (area !== undefined && area !== null && String(area).trim()) details.area = String(area).trim();
  if (suburb !== undefined && suburb !== null && String(suburb).trim()) details.suburb = String(suburb).trim();
  if (notes !== undefined && notes !== null && String(notes).trim()) details.notes = String(notes).trim();

  if (coordinates !== undefined && coordinates !== null && typeof coordinates === "object" && !Array.isArray(coordinates)) {
    const lat = Number(coordinates.lat);
    const lng = Number(coordinates.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      details.coordinates = { lat, lng };
    }
  }

  return {
    location: details.city || details.area || details.suburb || details.address || "UNKNOWN",
    locationDetails: Object.keys(details).length > 0 ? details : null,
  };
}

function computeJobMatchScore(job, providerSkillsSet, providerLocation, providerRating, providerUserId) {
  let score = providerRating;

  const category = normalizeValue(job.category);
  const location = normalizeValue(job.location);

  if (providerUserId && job.providerId && String(job.providerId) === String(providerUserId)) {
    score += 100;
  }

  if (category && providerSkillsSet.has(category)) {
    score += 5;
  }

  if (location && providerLocation && location === providerLocation) {
    score += 3;
  }

  return score;
}

async function createJob(userId, body) {
  const { title, description, price, category, location, width, height, length, area, images, measurements, materials, selectedProviderId } = body;

  const normalizedCategory = String(category || title || "").trim();
  if (!normalizedCategory) {
    throw new AppError("category is required", 400);
  }

  const normalizedDescription = String(description || "").trim();
  if (!normalizedDescription) {
    throw new AppError("description is required", 400);
  }
  if (normalizedDescription.length < 10) {
    throw new AppError("description must be at least 10 characters", 400);
  }
  const locationAddress =
    typeof location === "string"
      ? String(location).trim()
      : location && typeof location === "object" && !Array.isArray(location)
        ? String(location.address || "").trim()
        : "";
  if (!locationAddress) {
    throw new AppError("location address is required", 400);
  }

  let normalizedImages = [];
  if (images !== undefined) {
    if (!Array.isArray(images) || images.some((image) => typeof image !== "string")) {
      throw new AppError("images must be an array of strings", 400);
    }
    normalizedImages = images.map((image) => image.trim()).filter(Boolean);
  }

  let normalizedMaterials = [];
  if (materials !== undefined) {
    if (!Array.isArray(materials)) {
      throw new AppError("materials must be an array", 400);
    }
    normalizedMaterials = materials;
  }

  const measurementsForParser =
    measurements && typeof measurements === "object" && !Array.isArray(measurements)
      ? { ...measurements, cameraAssist: undefined }
      : measurements;

  const cameraAssistParsed = parseCameraAssist(
    measurements && typeof measurements === "object" && !Array.isArray(measurements)
      ? measurements.cameraAssist
      : undefined,
    AppError
  );

  const cameraImageUrl =
    cameraAssistParsed && cameraAssistParsed.imageUrl ? String(cameraAssistParsed.imageUrl).trim() : "";
  if (cameraImageUrl) {
    normalizedImages = normalizedImages.filter((u) => u !== cameraImageUrl);
  }

  const measurementResult = parseMeasurements(measurementsForParser, {
    width,
    height,
    length,
    area,
  });

  const widthNum = measurementResult?.width;
  const heightNum = measurementResult?.height;
  const lengthNum = measurementResult?.length;
  const areaNum = measurementResult?.area;

  const innerMeasurements =
    measurementResult?.measurements ||
    (widthNum !== undefined || heightNum !== undefined || lengthNum !== undefined || areaNum !== undefined
      ? {
          source: "MANUAL",
          values: {
            ...(widthNum !== undefined ? { width: widthNum } : {}),
            ...(heightNum !== undefined ? { height: heightNum } : {}),
            ...(lengthNum !== undefined ? { length: lengthNum } : {}),
            ...(areaNum !== undefined ? { area: areaNum } : {}),
          },
        }
      : { source: "MANUAL", values: {} });

  let plumbingIssuePayload =
    measurements && typeof measurements === "object" && !Array.isArray(measurements) && measurements.plumbingIssue
      ? measurements.plumbingIssue
      : undefined;
  if (plumbingIssuePayload && typeof plumbingIssuePayload === "object" && cameraAssistParsed) {
    const { description: _omit, ...rest } = plumbingIssuePayload;
    plumbingIssuePayload = Object.keys(rest).length ? rest : undefined;
  }

  const normalizedMeasurements = {
    ...innerMeasurements,
    ...(measurements && typeof measurements === "object" && !Array.isArray(measurements)
      ? {
          ...(Array.isArray(measurements.movingItems) ? { movingItems: measurements.movingItems } : {}),
          ...(Array.isArray(measurements.deliveryItems) ? { deliveryItems: measurements.deliveryItems } : {}),
          ...(measurements.collectionPoint && typeof measurements.collectionPoint === "object"
            ? { collectionPoint: measurements.collectionPoint }
            : {}),
          ...(measurements.destinationPoint && typeof measurements.destinationPoint === "object"
            ? { destinationPoint: measurements.destinationPoint }
            : {}),
          ...(plumbingIssuePayload && typeof plumbingIssuePayload === "object"
            ? { plumbingIssue: plumbingIssuePayload }
            : {}),
        }
      : {}),
    ...(cameraAssistParsed ? { cameraAssist: cameraAssistParsed } : {}),
  };

  const { location: normalizedLocation, locationDetails } = parseLocation(location);
  const providerUserId = await resolveProviderUserId(selectedProviderId);
  const categorySettings = await resolveCategorySettings(normalizedCategory);
  if (categorySettings.requiresInspection === false && !hasMeaningfulMeasurements(normalizedMeasurements)) {
    throw new AppError(
      "Detailed requirements are required for this category before submitting the request.",
      400
    );
  }

  let priceNum = 0;
  if (price !== undefined && price !== null && price !== "") {
    priceNum = Number(price);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      throw new AppError("price must be a non-negative number", 400);
    }
  } else if (normalizedMeasurements?.values) {
    const computed = Object.values(normalizedMeasurements.values).reduce(
      (sum, value) => sum + Number(value || 0),
      0
    );
    if (!Number.isNaN(computed) && computed > 0) {
      priceNum = computed;
    }
  }

  const job = await prisma.job.create({
    data: {
      title: String(title || normalizedCategory).trim(),
      category: normalizedCategory,
      location: normalizedLocation,
      locationDetails,
      description: normalizedDescription,
      price: priceNum,
      width: widthNum,
      height: heightNum,
      length: lengthNum,
      area: areaNum,
      images: normalizedImages,
      measurements: normalizedMeasurements,
      materials: normalizedMaterials,
      customerId: userId,
      providerId: providerUserId,
      status: "PENDING",
      meta: createDefaultJobMeta(),
    },
    include: jobInclude,
  });
  const enriched = await finalizeJob(job, normalizeMeta(job.meta));
  if (job.providerId) {
    await notificationEvents.notifyJobRequest(job.providerId, job.id, job.title);
  }
  return enriched;
}

async function getMatchedJobsForProvider(userId) {
  const provider = await prisma.provider.findUnique({
    where: { userId },
    select: {
      userId: true,
      skills: true,
      location: true,
      rating: true,
      approved: true,
      profileCompleted: true,
      blocked: true,
    },
  });

  if (!provider) {
    throw new AppError("Provider profile not found", 404);
  }

  if (
    provider.blocked ||
    provider.approved !== true ||
    provider.profileCompleted !== true
  ) {
    return [];
  }

  const providerSkills = Array.isArray(provider.skills)
    ? provider.skills.map(normalizeValue).filter(Boolean)
    : [];
  const providerSkillsSet = new Set(providerSkills);
  const providerLocation = normalizeValue(provider.location);
  const providerRating = Number(provider.rating) || 0;

  const pendingJobs = await prisma.job.findMany({
    where: {
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
    include: jobInclude,
  });

  const scored = pendingJobs
    .map((job) => ({
      ...job,
      score: computeJobMatchScore(
        job,
        providerSkillsSet,
        providerLocation,
        providerRating,
        provider.userId
      ),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  const mapped = [];
  for (const job of scored) {
    const meta = await getJobMeta(job.id);
    mapped.push({ ...(await finalizeJob(job, meta)), score: job.score });
  }
  return mapped;
}

async function acceptJob(jobId, userId) {
  const provider = await prisma.provider.findUnique({
    where: { userId },
    select: {
      userId: true,
      approved: true,
      profileCompleted: true,
      blocked: true,
    },
  });

  if (!provider) {
    throw new AppError("Provider profile not found", 404);
  }

  if (
    provider.blocked ||
    provider.approved !== true ||
    provider.profileCompleted !== true
  ) {
    throw new AppError(
      "Your profile must be approved and complete before accepting jobs",
      403
    );
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, providerId: true },
  });

  if (!job) {
    throw new AppError("Job not found", 404);
  }

  if (job.status !== "PENDING") {
    throw new AppError("Only pending jobs can be accepted", 409);
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: {
      providerId: userId,
      status: "ACCEPTED",
    },
    include: jobInclude,
  });
  let meta = await mutateJobMeta(jobId, (m) => ({
    ...m,
    statusOverride: "ASSIGNED",
    rejectionReason: null,
    rejectionDetails: null,
    rejectedAt: null,
  }));

  const categorySlug = String(updated.category || "").trim();
  if (categorySlug) {
    const cat = await prisma.category.findUnique({
      where: { id: categorySlug },
      select: { requiresInspection: true },
    });
    if (cat && cat.requiresInspection === false) {
      meta = await mutateJobMeta(jobId, (m) => ({ ...m, statusOverride: "INSPECTED" }));
    }
  }

  const enriched = await finalizeJob(updated, meta);
  if (updated.customerId) {
    await notificationEvents.notifyJobAccepted(updated.customerId, jobId, updated.title);
  }
  return enriched;
}

/**
 * Jobs visible in list endpoints: admin sees all; customer sees own; provider sees assigned.
 */
async function getJobsForActor(userId, role) {
  let jobs;
  if (role === "ADMIN") {
    jobs = await prisma.job.findMany({
      orderBy: { createdAt: "desc" },
      include: jobInclude,
    });
  } else if (role === "CUSTOMER") {
    jobs = await prisma.job.findMany({
      where: { customerId: String(userId) },
      orderBy: { createdAt: "desc" },
      include: jobInclude,
    });
  } else if (role === "PROVIDER") {
    jobs = await prisma.job.findMany({
      where: {
        OR: [
          { providerId: String(userId) },
          {
            meta: {
              path: ["rejectedByProviderUserId"],
              equals: String(userId),
            },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: jobInclude,
    });
  } else {
    throw new AppError("Forbidden", 403);
  }
  const out = [];
  for (const job of jobs) {
    const meta = await getJobMeta(job.id);
    out.push(await finalizeJob(job, meta));
  }
  return out;
}

/** Jobs where the given user is the customer (for material-order merge, etc.). */
async function getJobsForCustomerId(customerId) {
  const jobs = await prisma.job.findMany({
    where: { customerId: String(customerId) },
    orderBy: { createdAt: "desc" },
    include: jobInclude,
  });
  const out = [];
  for (const job of jobs) {
    const meta = await getJobMeta(job.id);
    out.push(await finalizeJob(job, meta));
  }
  return out;
}

async function getJobById(jobId) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: jobInclude,
  });
  if (!job) throw new AppError("Job not found", 404);
  const meta = await getJobMeta(job.id);
  return await finalizeJob(job, meta);
}

async function getJobByIdForActor(jobId, userId, role) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: jobInclude,
  });
  if (!job) throw new AppError("Job not found", 404);
  if (role !== "ADMIN") {
    if (role === "CUSTOMER") {
      if (String(job.customerId) !== String(userId)) {
        throw new AppError("Forbidden", 403);
      }
    } else if (role === "PROVIDER") {
      const isAssigned = String(job.providerId) === String(userId);
      let isPendingMatch = false;
      if (!isAssigned && job.status === "PENDING") {
        const matched = await getMatchedJobsForProvider(userId);
        isPendingMatch = matched.some((j) => String(j.id) === String(jobId));
      }
      const metaPeek = await getJobMeta(jobId);
      const isRejectedBySelf =
        metaPeek.statusOverride === "REJECTED" &&
        String(metaPeek.rejectedByProviderUserId || "") === String(userId);
      if (!isAssigned && !isPendingMatch && !isRejectedBySelf) {
        throw new AppError("Forbidden", 403);
      }
    } else {
      throw new AppError("Forbidden", 403);
    }
  }
  const meta = await getJobMeta(job.id);
  return await finalizeJob(job, meta);
}

function mapFrontendStatusToDb(status) {
  switch (status) {
    case "PENDING":
      return "PENDING";
    case "ASSIGNED":
      return "ACCEPTED";
    case "IN_PROGRESS":
      return "IN_PROGRESS";
    case "COMPLETED":
      return "COMPLETED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return null;
  }
}

function coerceNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

function hasMeaningfulMeasurements(measurements) {
  if (!measurements || typeof measurements !== "object" || Array.isArray(measurements)) {
    return false;
  }

  const values = measurements.values;
  const hasValues =
    values &&
    typeof values === "object" &&
    !Array.isArray(values) &&
    Object.keys(values).length > 0;
  const hasMovingItems =
    Array.isArray(measurements.movingItems) && measurements.movingItems.length > 0;
  const hasIssue =
    measurements.plumbingIssue &&
    typeof measurements.plumbingIssue === "object" &&
    (String(measurements.plumbingIssue.type || "").trim().length > 0 ||
      String(measurements.plumbingIssue.description || "").trim().length > 0);
  const hasCameraAssist =
    measurements.cameraAssist &&
    typeof measurements.cameraAssist === "object";

  return Boolean(hasValues || hasMovingItems || hasIssue || hasCameraAssist);
}

async function resolveCategorySettings(slug) {
  let requiresInspection = true;
  let requiresMaterials = false;
  let step3Type = "measurements";
  const key = String(slug || "").trim();
  if (!key) {
    return { requiresInspection, requiresMaterials, step3Type };
  }
  try {
    const cat = await prisma.category.findUnique({
      where: { id: key },
      select: { requiresInspection: true, requiresMaterials: true, step3Type: true },
    });
    if (cat && typeof cat.requiresInspection === "boolean") {
      requiresInspection = cat.requiresInspection;
    }
    if (cat && typeof cat.requiresMaterials === "boolean") {
      requiresMaterials = cat.requiresMaterials;
    }
    if (cat && cat.step3Type) {
      step3Type = String(cat.step3Type);
    }
  } catch {
    // keep defaults
  }
  return { requiresInspection, requiresMaterials, step3Type };
}

async function assertJobCategoryAllowsMaterials(job) {
  const slug = String(job?.category || "").trim();
  const { requiresMaterials } = await resolveCategorySettings(slug);
  if (requiresMaterials === false) {
    throw new AppError("This category does not allow materials.", 400);
  }
}

async function assertSpecificationsReadyForPricing(job, meta) {
  const slug = String(job?.category || "").trim();
  const { step3Type } = await resolveCategorySettings(slug);
  const providerAdjusted = meta?.providerAdjustedRequirements?.measurements;
  const mergedMeasurements = {
    ...(job?.measurements && typeof job.measurements === "object" ? job.measurements : {}),
    ...(providerAdjusted && typeof providerAdjusted === "object" ? providerAdjusted : {}),
  };

  if (step3Type === "measurements") {
    if (!hasMeaningfulMeasurements(mergedMeasurements)) {
      throw new AppError("Measurements are required before completing specifications.", 400);
    }
    return;
  }

  const reqText = String(meta?.providerAdjustedRequirements?.requirementText || "").trim();
  if (reqText.length > 0) {
    return;
  }
  if (hasMeaningfulMeasurements(mergedMeasurements)) {
    return;
  }
  throw new AppError(
    "Document the job requirements before inspection or pricing. Add details under job specifications.",
    400
  );
}

async function finalizeJob(job, meta) {
  const base = enrichJob(job, meta);
  const slug = String(base.category || "").trim();
  const { requiresInspection, requiresMaterials, step3Type: categoryStep3Type } =
    await resolveCategorySettings(slug);
  let jobMaterialOrders = [];
  if (job?.id) {
    try {
      const materialOrderService = require("./materialOrder.service");
      jobMaterialOrders = await materialOrderService.getJobMaterialOrdersForJob(job.id);
    } catch (e) {
      console.error("getJobMaterialOrdersForJob", e);
    }
  }
  const deliveryRequestId =
    meta && typeof meta === "object" && meta.deliveryRequestId
      ? String(meta.deliveryRequestId)
      : null;
  const courierFlow = Boolean(meta && typeof meta === "object" && meta.courierFlow);

  return {
    ...base,
    requiresInspection,
    requiresMaterials,
    categoryStep3Type,
    jobMaterialOrders,
    deliveryRequestId,
    courierFlow,
  };
}

async function updateJobStatus(jobId, status) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  if (String(status) === "INSPECTED") {
    const metaBefore = await getJobMeta(jobId);
    await assertSpecificationsReadyForPricing(job, metaBefore);
  }
  const dbStatus = mapFrontendStatusToDb(status);
  let updatedJob = job;
  if (dbStatus && dbStatus !== job.status) {
    updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: { status: dbStatus },
      include: jobInclude,
    });
  }
  const meta = await mutateJobMeta(jobId, (m) => ({ ...m, statusOverride: status }));
  const result = await finalizeJob(updatedJob, meta);
  if (String(status) === "INSPECTED" && job.customerId) {
    await notificationEvents.notifyInspectionCompleted(job.customerId, jobId, job.title);
  }
  return result;
}

async function deleteJob(jobId, actorUserId, actorRole) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError("Job not found", 404);
  if (actorRole === "ADMIN") {
    await prisma.job.delete({ where: { id: jobId } });
    return { id: jobId };
  }
  if (actorRole === "CUSTOMER") {
    if (String(job.customerId) !== String(actorUserId)) {
      throw new AppError("Forbidden", 403);
    }
  } else if (actorRole === "PROVIDER") {
    if (String(job.providerId) !== String(actorUserId)) {
      throw new AppError("Forbidden", 403);
    }
  } else {
    throw new AppError("Forbidden", 403);
  }
  await prisma.job.delete({ where: { id: jobId } });
  return { id: jobId };
}

async function addMaterials(jobId, newMaterials = []) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(job);
  const existing = Array.isArray(job.materials) ? job.materials : [];
  const next = [...existing, ...newMaterials];
  const updated = await prisma.job.update({
    where: { id: jobId },
    data: { materials: next },
    include: jobInclude,
  });
  const meta = await getJobMeta(jobId);
  return await finalizeJob(updated, meta);
}

async function removeMaterial(jobId, productId, supplierId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(job);
  const existing = Array.isArray(job.materials) ? job.materials : [];
  const next = existing.filter(
    (m) => !(String(m.productId) === String(productId) && String(m.supplierId) === String(supplierId))
  );
  const updated = await prisma.job.update({
    where: { id: jobId },
    data: { materials: next },
    include: jobInclude,
  });
  const meta = await getJobMeta(jobId);
  return await finalizeJob(updated, meta);
}

async function addJobNote(jobId, author, message, title) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const note = createNote(author, message, title);
  const meta = await mutateJobMeta(jobId, (m) => ({ ...m, jobNotes: [...m.jobNotes, note] }));
  return await finalizeJob(job, meta);
}

async function addChatMessage(jobId, author, message) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const chat = createChat(author, message);
  const meta = await mutateJobMeta(jobId, (m) => ({ ...m, chat: [...m.chat, chat] }));
  const recipientId =
    String(author.userId) === String(job.customerId) ? job.providerId : job.customerId;
  const roleLabel = author.role === "CUSTOMER" ? "customer" : String(author.role || "user").toLowerCase();
  if (recipientId) {
    if (global.io) {
      global.io.to(String(recipientId)).emit("message:new", {
        jobId,
        senderId: String(author.userId),
      });
    }
    await notificationEvents.notifyChatMessage({
      recipientId: String(recipientId),
      jobId,
      jobTitle: job.title,
      message: String(message || "").trim(),
      senderId: String(author.userId),
      senderName: author.name || "User",
      senderRole: roleLabel,
    });
  }
  return await finalizeJob(job, meta);
}

async function assertJobQuotationUploadAllowed(job) {
  if (!job) throw new AppError("Job not found", 404);
  if (!job.providerId) {
    throw new AppError("Assign a provider before uploading a quotation", 400);
  }
  if (job.status === "CANCELLED") {
    throw new AppError("Cannot attach a quotation to a cancelled job", 400);
  }
}

async function assertActorCanAccessJobQuotation(job, actorUserId, actorRole) {
  if (!job) throw new AppError("Job not found", 404);
  if (!job.quotationFileUrl) {
    throw new AppError("No quotation file for this job", 404);
  }
  const role = String(actorRole || "").toUpperCase();
  if (role === "ADMIN") return;
  if (role === "CUSTOMER" && String(job.customerId) === String(actorUserId)) return;
  if (role === "PROVIDER" && String(job.providerId) === String(actorUserId)) return;
  throw new AppError("Forbidden", 403);
}

async function uploadJobQuotation(jobId, providerUserId, file) {
  if (!file || !file.path) {
    throw new AppError("File is required", 400);
  }
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  if (String(job.providerId) !== String(providerUserId)) {
    throw new AppError("Only the assigned provider can upload a quotation", 403);
  }
  await assertJobQuotationUploadAllowed(job);

  const { ext } = validateQuotationFileMeta(file.originalname, file.mimetype, file.size);
  if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0) {
    throw new AppError("File is empty", 400);
  }
  if (Number(file.size) > QUOTATION_MAX_BYTES) {
    throw new AppError("Quotation file must be 10MB or smaller", 400);
  }
  await assertQuotationFileMagic(file.path, ext);

  const stored = await registerUploadedFile(file, {
    ownerUserId: providerUserId,
    type: "jobQuotation",
    originalName: file.originalname,
    mimeType: file.mimetype,
  });

  const uploadedAt = new Date();
  const updated = await prisma.job.update({
    where: { id: jobId },
    data: {
      quotationFileUrl: stored.url,
      quotationFileName: stored.originalName || file.originalname,
      quotationUploadedAt: uploadedAt,
    },
    include: jobInclude,
  });
  const meta = await getJobMeta(jobId);
  return finalizeJob(updated, meta);
}

async function resolveJobQuotationFile(job) {
  const url = String(job.quotationFileUrl || "").trim();
  if (!url) return null;
  const token = url.startsWith(FILES_URL_PREFIX) ? url.slice(FILES_URL_PREFIX.length) : url;
  return resolveFileForDownload(token);
}

async function getJobQuotationDownload(jobId, actorUserId, actorRole, disposition = "inline") {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  await assertActorCanAccessJobQuotation(job, actorUserId, actorRole);
  const file = await resolveJobQuotationFile(job);
  if (!file) {
    throw new AppError("Quotation file not found", 404);
  }
  const filename = sanitizeDownloadFilename(job.quotationFileName || file.originalName);
  const mode = String(disposition).toLowerCase() === "attachment" ? "attachment" : "inline";
  return {
    absolutePath: file.absolutePath,
    mimeType: file.mimeType || "application/octet-stream",
    filename,
    contentDisposition: `${mode}; filename="${filename}"`,
  };
}

async function submitServicePrice(jobId, amount, note) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const metaBefore = await getJobMeta(jobId);
  await assertSpecificationsReadyForPricing(job, metaBefore);
  const safeAmount = coerceNumber(amount);
  const meta = await mutateJobMeta(jobId, (m) => ({
    ...m,
    servicePrice: { amount: safeAmount, note: note ? String(note) : "", submittedAt: new Date().toISOString() },
    statusOverride: "SERVICE_PRICE_SUBMITTED",
  }));
  const updated = await prisma.job.update({
    where: { id: jobId },
    data: { price: safeAmount },
    include: jobInclude,
  });
  const enriched = await finalizeJob(updated, meta);
  if (job.customerId) {
    await notificationEvents.notifyPriceSubmitted(job.customerId, jobId, job.title);
  }
  return enriched;
}

async function payLabor(jobId, userId, cardLast4, idempotencyKey, requestHash, route) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  if (String(job.customerId) !== String(userId)) {
    throw new AppError("Only the customer can pay for labor", 403);
  }
  let existingMeta = await getJobMeta(jobId);

  if (job.laborPaid) {
    throw new AppError("Labor already paid", 400);
  }

  const servicePaid =
    existingMeta.servicePayment &&
    String(existingMeta.servicePayment.status || "").toLowerCase() === "paid";

  if (existingMeta.laborPaid && servicePaid) {
    const data =
      job.status === "ACCEPTED"
        ? { status: "IN_PROGRESS", laborPaid: true }
        : { laborPaid: true };
    const repaired = await prisma.job.update({
      where: { id: jobId },
      data,
      include: jobInclude,
    });
    return finalizeJob(repaired, existingMeta);
  }

  if (existingMeta.laborPaid) {
    existingMeta = await mutateJobMeta(jobId, (m) => ({ ...m, laborPaid: false }));
  }

  if (!job.providerId) {
    throw new AppError("Job has no provider", 400);
  }

  const providerRow = await prisma.provider.findUnique({
    where: { userId: job.providerId },
    select: { id: true },
  });
  if (!providerRow) {
    throw new AppError("Provider profile not found", 404);
  }

  const priceCandidate =
    existingMeta.servicePrice != null && typeof existingMeta.servicePrice === "object"
      ? existingMeta.servicePrice.amount
      : undefined;
  const amount = coerceNumber(
    priceCandidate !== undefined && priceCandidate !== null ? priceCandidate : job.price,
    0
  );
  if (amount <= 0) {
    throw new AppError("Invalid labor amount — ensure the service price is set and greater than zero", 400);
  }

  const paymentRef = `LAB-${String(jobId).slice(-6)}-${Date.now()}`;
  const paidAt = new Date().toISOString();
  const gross = new Prisma.Decimal(String(amount));

  const txResult = await prisma.$transaction(
    async (tx) => {
      const gate = await idempotencyGate(tx, { idempotencyKey, requestHash, route });
      if (gate.replay) {
        return { replay: true };
      }

      const j = await tx.job.findUnique({ where: { id: jobId }, include: jobInclude });
      if (!j) {
        throw new AppError("Job not found", 404);
      }

      const { jobRow, meta } = await paymentService.runSettleLaborInTransaction(tx, {
        job: j,
        jobId,
        customerUserId: String(userId),
        providerProfileId: providerRow.id,
        gross,
        paymentRef,
        paidAt,
        cardLast4,
        idempotencyKeyForEarnings: idempotencyKey,
        channel: "mock",
      });

      await idempotencyCommit(tx, { idempotencyKey, requestHash, route });
      return { replay: false, jobRow, meta };
    },
    {
      maxWait: 5000,
      timeout: 15000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );

  if (txResult.replay) {
    const jobRow = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
    const meta = await getJobMeta(jobId);
    return finalizeJob(jobRow, meta);
  }

  const { jobRow, meta } = txResult;
  const enriched = await finalizeJob(jobRow, meta);
  await logAudit("payment.pay_labor", {
    userId,
    metadata: { jobId, amount, providerId: providerRow.id },
  });
  if (job.providerId) {
    await notificationEvents.notifyPaymentMade(
      job.providerId,
      jobId,
      job.title,
      "The customer paid for labor / service."
    );
  }
  return enriched;
}

async function submitMaterials(jobId, materials, providerUserId) {
  const materialRequestService = require("./materialRequest.service");
  const effectiveProviderId =
    providerUserId != null && String(providerUserId).trim() !== ""
      ? String(providerUserId)
      : null;
  if (!effectiveProviderId) {
    throw new AppError("Provider context is required", 400);
  }
  const jobForCategory = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!jobForCategory) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(jobForCategory);
  await materialRequestService.finalizeProviderMaterialsSubmit(
    jobId,
    materials,
    effectiveProviderId,
    { draftMaterialRequestId: null }
  );
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const meta = await getJobMeta(jobId);
  return await finalizeJob(job, meta);
}

async function rejectJobByProvider(jobId, reason, details, rejectingProviderUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const meta = await mutateJobMeta(jobId, (m) => ({
    ...m,
    statusOverride: "REJECTED",
    rejectionReason: reason || null,
    rejectionDetails: details || null,
    rejectedAt: new Date().toISOString(),
    ...(rejectingProviderUserId
      ? { rejectedByProviderUserId: String(rejectingProviderUserId) }
      : {}),
  }));
  try {
    const deliveryRequestService = require("./deliveryRequest.service");
    await deliveryRequestService.rejectDeliveryRequestsForJob(
      jobId,
      rejectingProviderUserId || job.providerId
    );
  } catch (e) {
    console.error("rejectDeliveryRequestsForJob", e);
  }
  return await finalizeJob(job, meta);
}

async function rejectJob(jobId, reason, details) {
  return rejectJobByProvider(jobId, reason, details);
}

async function deleteRejectedRequestFromProviderView(jobId, actorUserId) {
  const meta = await getJobMeta(jobId);
  if (meta.statusOverride !== "REJECTED") {
    throw new AppError("Only rejected requests can be removed", 400);
  }
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { providerId: true } });
  if (!job) throw new AppError("Job not found", 404);
  const ok =
    String(job.providerId || "") === String(actorUserId) ||
    String(meta.rejectedByProviderUserId || "") === String(actorUserId);
  if (!ok) {
    throw new AppError("Forbidden", 403);
  }
  await prisma.job.delete({ where: { id: jobId } });
  return { id: jobId };
}

async function updateProviderRequirements(jobId, updates, actorUserId, actorRole) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const role = String(actorRole || "").toUpperCase();
  if (role !== "ADMIN" && role !== "PROVIDER") {
    throw new AppError("Only providers can update requirements.", 403);
  }
  if (role === "PROVIDER" && String(job.providerId || "") !== String(actorUserId || "")) {
    throw new AppError("Only the assigned provider can update requirements.", 403);
  }
  const { requiresInspection } = await resolveCategorySettings(job.category);
  if (requiresInspection === false) {
    throw new AppError("Provider requirement editing is disabled for this category.", 400);
  }
  const payload = updates && typeof updates === "object" ? updates : {};
  const meta = await mutateJobMeta(jobId, (m) => {
    const prev =
      m.providerAdjustedRequirements && typeof m.providerAdjustedRequirements === "object"
        ? { ...m.providerAdjustedRequirements }
        : {};
    const next = { ...prev };
    if (Object.prototype.hasOwnProperty.call(payload, "measurements")) {
      next.measurements = payload.measurements;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "requirementNotes")) {
      next.requirementNotes = String(payload.requirementNotes || "");
    }
    if (Object.prototype.hasOwnProperty.call(payload, "requirementText")) {
      next.requirementText = String(payload.requirementText || "").trim();
    }
    return { ...m, providerAdjustedRequirements: next };
  });
  return await finalizeJob(job, meta);
}

async function addUserMaterialSuggestion(jobId, suggested, message) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(job);
  const suggestion = {
    id: randomUUID(),
    productId: suggested.productId,
    originalProductId: suggested.originalProductId,
    message: String(message || ""),
    suggested,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  const meta = await mutateJobMeta(jobId, (m) => ({
    ...m,
    userMaterialSuggestions: [...m.userMaterialSuggestions, suggestion],
  }));
  return await finalizeJob(job, meta);
}

async function acceptUserSuggestion(jobId, suggestionId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(job);
  const meta = await mutateJobMeta(jobId, (m) => {
    const suggestions = m.userMaterialSuggestions.map((s) =>
      s.id === suggestionId ? { ...s, status: "accepted" } : s
    );
    const accepted = suggestions.find((s) => s.id === suggestionId);
    let storeOrders = Array.isArray(m.storeOrders) ? [...m.storeOrders] : [];
    if (accepted) {
      const storeId = accepted.suggested.branchId ?? accepted.suggested.supplierId;
      const lineItem = {
        productId: accepted.suggested.productId,
        name: accepted.suggested.name,
        qty: accepted.suggested.qty,
        unitPrice: accepted.suggested.unitPrice,
        qualityTier: accepted.suggested.qualityTier,
        imageUrl: accepted.suggested.imageUrl,
      };

      /** Never merge customer suggestions into a provider material-request store order — that duplicated pending + suggestion tabs.
       * Stay on a dedicated order tagged with sourceUserSuggestionId until the customer pays. */
      const existingSuggestionOrderIdx = storeOrders.findIndex(
        (o) => String(o.sourceUserSuggestionId || "") === String(suggestionId)
      );
      if (existingSuggestionOrderIdx >= 0) {
        const o = storeOrders[existingSuggestionOrderIdx];
        storeOrders[existingSuggestionOrderIdx] = {
          ...o,
          items: [...(Array.isArray(o.items) ? o.items : []), lineItem],
        };
      } else {
        storeOrders.push({
          storeId,
          orderId: randomUUID(),
          sourceUserSuggestionId: suggestionId,
          items: [lineItem],
          storeName: accepted.suggested.supplierName,
          deliveryType: "SELF",
          deliveryFee: 0,
          deliveryStatus: "SelfCollect",
          paymentStatus: "Paid",
          invoiceId: "",
          createdAt: new Date().toISOString(),
          payment: { materialsPaid: false, deliveryPaid: false },
        });
      }
    }
    return { ...m, userMaterialSuggestions: suggestions, storeOrders };
  });
  return await finalizeJob(job, meta);
}

async function rejectUserSuggestion(jobId, suggestionId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(job);
  const meta = await mutateJobMeta(jobId, (m) => ({
    ...m,
    userMaterialSuggestions: m.userMaterialSuggestions.map((s) =>
      s.id === suggestionId ? { ...s, status: "rejected", withdrawnAfterAccept: false } : s
    ),
  }));
  return await finalizeJob(job, meta);
}

async function addProviderMaterialSuggestion(jobId, suggested, message) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(job);
  const suggestion = {
    id: randomUUID(),
    productId: suggested.productId,
    originalProductId: suggested.originalProductId,
    message: String(message || ""),
    suggested,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  const meta = await mutateJobMeta(jobId, (m) => ({
    ...m,
    providerSuggestions: [...m.providerSuggestions, suggestion],
  }));
  return await finalizeJob(job, meta);
}

async function acceptProviderSuggestion(jobId, suggestionId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(job);
  const meta = await mutateJobMeta(jobId, (m) => ({
    ...m,
    providerSuggestions: m.providerSuggestions.map((s) =>
      s.id === suggestionId ? { ...s, status: "accepted" } : s
    ),
  }));
  return await finalizeJob(job, meta);
}

async function rejectProviderSuggestion(jobId, suggestionId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(job);
  const meta = await mutateJobMeta(jobId, (m) => ({
    ...m,
    providerSuggestions: m.providerSuggestions.map((s) =>
      s.id === suggestionId ? { ...s, status: "rejected" } : s
    ),
  }));
  return await finalizeJob(job, meta);
}

async function proposeNewLaborPrice(jobId, amount, reason) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const meta = await mutateJobMeta(jobId, (m) => ({
    ...m,
    proposedLaborPrice: { amount: coerceNumber(amount), reason: String(reason || "") },
  }));
  const enriched = await finalizeJob(job, meta);
  if (job.customerId) {
    await notificationEvents.notifyPriceSubmitted(job.customerId, jobId, job.title);
  }
  return enriched;
}

async function acceptProposedPrice(jobId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const metaBefore = await getJobMeta(jobId);
  const hadProposal = Boolean(metaBefore.proposedLaborPrice);
  const meta = await mutateJobMeta(jobId, (m) => {
    if (!m.proposedLaborPrice) return m;
    return {
      ...m,
      servicePrice: {
        amount: m.proposedLaborPrice.amount,
        note: m.proposedLaborPrice.reason || "",
        submittedAt: new Date().toISOString(),
      },
      proposedLaborPrice: null,
      statusOverride: "SERVICE_PRICE_SUBMITTED",
    };
  });
  const enriched = await finalizeJob(job, meta);
  if (hadProposal && job.providerId) {
    await notificationEvents.notifyProposedPriceAccepted(job.providerId, jobId, job.title);
  }
  return enriched;
}

async function cancelJob(jobId, reason, details, actorUserId, actorRole) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const preMeta = await getJobMeta(jobId);
  const cancellationPolicy = require("../utils/jobCancellationPolicy.util");
  const policy = await cancellationPolicy.resolveJobCancellationPolicy(
    job,
    preMeta,
    actorUserId,
    actorRole
  );
  const originalPaymentRef = preMeta?.servicePayment?.paymentRef || preMeta?.servicePayment?.reference || null;
  const providerRow = job.providerId
    ? await prisma.provider.findUnique({ where: { userId: job.providerId }, select: { id: true } })
    : null;

  const { updated, meta, refundAmount } = await prisma.$transaction(
    async (tx) => {
      const j = await tx.job.findUnique({ where: { id: jobId } });
      if (!j) {
        throw new AppError("Job not found", 404);
      }
      const { refundAmount: rAmt, refundKind } = await paymentService.runCancelJobFinancialsInTransaction(tx, {
        job: j,
        providerProfileId: providerRow?.id,
        refundOverride: policy.refundAmount,
      });
      const u = await tx.job.update({
        where: { id: jobId },
        data: { status: "CANCELLED" },
        include: jobInclude,
      });
      const meta0 = await mutateJobMetaInTransaction(tx, jobId, (m) => ({
        ...m,
        statusOverride: "CANCELLED",
        cancellationReason: reason || null,
        cancellationDetails: details || null,
        cancelledAt: new Date().toISOString(),
        cancelledBy: policy.cancelledBy,
        cancellationProviderEnRoute: policy.providerEnRoute,
        ...(rAmt > 0
          ? {
              refund: {
                amount: rAmt,
                reason: "cancel",
                at: new Date().toISOString(),
                kind: String(refundKind || policy.refundKind || ""),
                status: "recorded",
                ...(originalPaymentRef ? { originalPaymentRef: String(originalPaymentRef) } : {}),
              },
            }
          : policy.customerForfeits
            ? {
                refund: {
                  amount: 0,
                  reason: "cancel_forfeit",
                  at: new Date().toISOString(),
                  kind: String(policy.refundKind || "forfeit_customer_en_route"),
                  status: "forfeited",
                },
              }
            : {}),
      }));
      return { updated: u, meta: meta0, refundAmount: rAmt };
    },
    {
      maxWait: 5000,
      timeout: 20000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
  try {
    const escrowSettlement = require("./payments/escrowSettlement.service");
    await escrowSettlement.markLaborIntentRefunded(jobId);
  } catch (e) {
    console.error("markLaborIntentRefunded", e);
  }
  return {
    job: await finalizeJob(updated, meta),
    refundAmount: Number(refundAmount) || 0,
    cancelledBy: policy.cancelledBy,
    providerEnRoute: policy.providerEnRoute,
    customerForfeits: policy.customerForfeits,
    refundKind: policy.refundKind,
  };
}

async function confirmJobCompletion(jobId, rating, review) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const r = Number(rating);
  if (!Number.isFinite(r) || r < 1 || r > 5) {
    throw new AppError("rating must be between 1 and 5", 400);
  }

  const roundedRating = normalizeRating(r);

  const existingReview = await prisma.providerReview.findUnique({ where: { jobId } });
  if (existingReview) {
    const ageMs = Date.now() - existingReview.createdAt.getTime();
    if (ageMs > 10 * 60 * 1000) {
      throw new AppError("Review can only be edited within 10 minutes of submission", 400);
    }
  }

  const providerRow = job.providerId
    ? await prisma.provider.findUnique({ where: { userId: job.providerId }, select: { id: true } })
    : null;

  const { updated } = await prisma.$transaction(
    async (tx) => {
      const updated0 = await tx.job.update({
        where: { id: jobId },
        data: { status: "COMPLETED" },
        include: jobInclude,
      });
      const j0 = await tx.job.findUnique({ where: { id: jobId } });
      if (!j0) {
        throw new AppError("Job not found", 404);
      }
      const meta0 = await mutateJobMetaInTransaction(tx, jobId, (m) => ({
        ...m,
        statusOverride: "COMPLETED",
        completionConfirmedByUser: true,
        userRating: roundedRating,
        userReview: review,
      }));
      if (providerRow) {
        const trimmedComment =
          review != null && String(review).trim() !== "" ? String(review).trim() : null;
        await tx.providerReview.upsert({
          where: { jobId },
          create: {
            id: randomUUID(),
            jobId,
            customerId: job.customerId,
            providerId: providerRow.id,
            rating: roundedRating,
            comment: trimmedComment,
          },
          update: {
            rating: roundedRating,
            comment: trimmedComment,
          },
        });
      }
      if (providerRow) {
        const alreadySettled = Boolean(j0.escrowSecondReleaseDone && j0.paymentReleased);
        if (!alreadySettled) {
          await paymentService.runSecondTrancheInTransaction(tx, {
            job: j0,
            providerProfileId: providerRow.id,
            jobId,
          });
          const escrowSettlement = require("./payments/escrowSettlement.service");
          await escrowSettlement.markLaborEscrowFullyReleased(jobId);
        }
      }
      return { updated: updated0, meta: meta0 };
    },
    {
      maxWait: 5000,
      timeout: 20000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );

  await logAudit("review.upsert", {
    userId: job.customerId,
    metadata: { jobId, rating: roundedRating },
  });

  if (job.providerId) {
    const pRow2 = await prisma.provider.findUnique({
      where: { userId: job.providerId },
      select: { id: true },
    });
    if (pRow2) {
      const { syncProviderAggregateRating } = require("./providerAggregateRating.service");
      await syncProviderAggregateRating(pRow2.id);
      const payoutMeta = await getJobMeta(jobId);
      const grossLabor =
        Number(updated.totalPrice) ||
        Number(updated.price) ||
        (payoutMeta.servicePayment && Number(payoutMeta.servicePayment.amount)) ||
        (payoutMeta.servicePrice && Number(payoutMeta.servicePrice.amount)) ||
        0;
      const catSlug = String(updated.category || job.category || "").trim();
      if (grossLabor > 0 && catSlug) {
        await expandLaborPricingFromPaidJob(job.providerId, catSlug, grossLabor);
      }
    }
  }

  const finalMeta = await getJobMeta(jobId);
  return await finalizeJob(updated, finalMeta);
}

function ensureStoreOrder(meta, storeId, fallback) {
  const idx = meta.storeOrders.findIndex((order) => String(order.storeId) === String(storeId));
  if (idx >= 0) return { index: idx, order: meta.storeOrders[idx] };
  const created = {
    storeId: String(storeId),
    orderId: randomUUID(),
    items: fallback.items || [],
    storeName: fallback.storeName || "Store",
    deliveryType: "SELF",
    deliveryFee: 0,
    deliveryStatus: "SelfCollect",
    paymentStatus: "Paid",
    invoiceId: fallback.invoiceId || "",
    createdAt: new Date().toISOString(),
    payment: { materialsPaid: false, deliveryPaid: false },
  };
  meta.storeOrders.push(created);
  return { index: meta.storeOrders.length - 1, order: created };
}

async function setStoreDeliveryOption(jobId, storeId, params) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(job);
  const wantOrderId = params.orderId ? String(params.orderId).trim() : "";
  let resolvedStoreOrderId = wantOrderId || "";
  let courierUserId = null;

  const meta = await mutateJobMeta(jobId, (m) => {
    const fallbackStoreName =
      (Array.isArray(job.materials) ? job.materials.find((x) => String(x.supplierId) === String(storeId))?.supplierName : null) ||
      "Store";
    let order;
    if (wantOrderId && Array.isArray(m.storeOrders)) {
      const idx = m.storeOrders.findIndex(
        (o) => String(o.orderId) === wantOrderId && String(o.storeId) === String(storeId)
      );
      if (idx >= 0) order = m.storeOrders[idx];
    }
    if (!order) {
      const found = ensureStoreOrder(m, storeId, { storeName: fallbackStoreName });
      order = found.order;
    }
    order.deliveryType = params.deliveryType;
    order.deliveryFee = coerceNumber(params.deliveryFee);
    order.deliveryProviderId = params.deliveryProviderId || undefined;
    order.deliveryStatus = params.deliveryType === "SELF" ? "SelfCollect" : "PendingApproval";
    order.delivery = {
      type: params.deliveryType,
      status: order.deliveryStatus,
      providerId: params.deliveryProviderId || undefined,
      fee: order.deliveryFee,
    };
    order.payment = order.payment || { materialsPaid: false, deliveryPaid: false };
    resolvedStoreOrderId = String(order.orderId || resolvedStoreOrderId || "");
    if (params.deliveryType === "PROVIDER" && params.deliveryProviderId) {
      courierUserId = String(params.deliveryProviderId);
    }
    return m;
  });
  const enriched = await finalizeJob(job, meta);
  if (job.customerId) {
    await notificationEvents.notifyDeliveryUpdate(job.customerId, jobId, job.title, "Delivery option updated");
  }
  if (courierUserId && resolvedStoreOrderId) {
    try {
      const materialOrderService = require("./materialOrder.service");
      const materialsLines = Array.isArray(job.materials)
        ? job.materials.filter((m) => String(m.supplierId) === String(storeId) || String(m.branchId) === String(storeId))
        : [];
      const storeOrder =
        Array.isArray(meta.storeOrders) &&
        meta.storeOrders.find((o) => String(o.orderId) === String(resolvedStoreOrderId));
      const linesFromOrder =
        storeOrder && Array.isArray(storeOrder.items)
          ? storeOrder.items.map((item) => ({
              supplierId: String(storeId),
              supplierName: storeOrder.storeName || fallbackStoreNameFromJob(job, storeId),
              productId: item.productId,
              name: item.name,
              qty: item.qty,
              unitPrice: item.unitPrice,
              qualityTier: item.qualityTier,
              imageUrl: item.imageUrl,
            }))
          : materialsLines;
      await materialOrderService.syncJobStoreCourierDeliveryRequest({
        jobId,
        jobStoreOrderId: resolvedStoreOrderId,
        supplierBranchId: storeId,
        customerUserId: job.customerId,
        jobProviderUserId: job.providerId,
        courierUserId,
        materialsLines: linesFromOrder,
        jobSiteAddress: jobSiteAddressFromRow(job),
        jobSiteLocation: jobSiteLocationFromRow(job),
      });
    } catch (e) {
      console.error("syncJobStoreCourierDeliveryRequest", e);
    }
  }
  return enriched;
}

function fallbackStoreNameFromJob(job, storeId) {
  const fromMaterials = Array.isArray(job.materials)
    ? job.materials.find((x) => String(x.supplierId) === String(storeId) || String(x.branchId) === String(storeId))
    : null;
  return fromMaterials?.supplierName || "Store";
}

async function approveStoreDeliveryRequest(jobId, storeId) {
  return updateStoreOrderDelivery(jobId, storeId, { status: "Approved" });
}

async function updateStoreOrderDeliveryStatus(jobId, storeId, status) {
  return updateStoreOrderDelivery(jobId, storeId, { status });
}

async function updateStoreOrderDelivery(jobId, storeId, updates) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(job);
  const meta = await mutateJobMeta(jobId, (m) => {
    const fallbackStoreName =
      (Array.isArray(job.materials) ? job.materials.find((x) => String(x.supplierId) === String(storeId))?.supplierName : null) ||
      "Store";
    const { order } = ensureStoreOrder(m, storeId, { storeName: fallbackStoreName });
    if (updates.type) order.deliveryType = updates.type;
    if (updates.providerId !== undefined) order.deliveryProviderId = updates.providerId;
    if (updates.fee !== undefined) order.deliveryFee = coerceNumber(updates.fee);
    if (updates.status) order.deliveryStatus = updates.status;
    order.delivery = {
      type: order.deliveryType,
      status: order.deliveryStatus,
      providerId: order.deliveryProviderId,
      fee: order.deliveryFee,
    };
    return m;
  });
  const enriched = await finalizeJob(job, meta);
  if (job.customerId && (updates.status || updates.type)) {
    await notificationEvents.notifyDeliveryUpdate(
      job.customerId,
      jobId,
      job.title,
      String(updates.status || updates.type || "Updated")
    );
  }
  return enriched;
}

async function approveStoreOrderDelivery(jobId, storeId) {
  return updateStoreOrderDelivery(jobId, storeId, { status: "Approved" });
}

async function rejectStoreOrderDelivery(jobId, storeId) {
  return updateStoreOrderDelivery(jobId, storeId, { status: "Rejected" });
}

async function payStoreOrderDelivery(jobId, storeId, cardLast4, fee) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(job);
  const meta = await mutateJobMeta(jobId, (m) => {
    const fallbackStoreName =
      (Array.isArray(job.materials) ? job.materials.find((x) => String(x.supplierId) === String(storeId))?.supplierName : null) ||
      "Store";
    const { order } = ensureStoreOrder(m, storeId, { storeName: fallbackStoreName });
    const safeFee = coerceNumber(fee, order.deliveryFee || 0);
    order.deliveryFee = safeFee;
    order.deliveryStatus = "Processing";
    order.delivery = {
      type: order.deliveryType,
      status: "Processing",
      providerId: order.deliveryProviderId,
      fee: safeFee,
    };
    order.payment = { ...(order.payment || {}), materialsPaid: Boolean(order.payment?.materialsPaid), deliveryPaid: true };
    order.deliveryInvoiceId = `INV-DEL-${String(jobId).slice(-6)}-${Date.now()}`;
    return m;
  });
  const enriched = await finalizeJob(job, meta);
  if (job.providerId) {
    await notificationEvents.notifyPaymentMade(
      job.providerId,
      jobId,
      job.title,
      "The customer paid for delivery."
    );
  }
  return enriched;
}

async function payForStoreMaterials(jobId, supplierId, cardLast4, options = {}) {
  if (options.paymentIntentId) {
    const intent = await prisma.paymentIntent.findUnique({
      where: { id: String(options.paymentIntentId) },
    });
    if (!intent || intent.state !== "PAID") {
      throw new AppError("Valid paid payment intent is required", 400);
    }
    if (intent.kind !== "JOB_STORE_ORDER" || String(intent.jobId) !== String(jobId)) {
      throw new AppError("Payment intent does not match this job", 400);
    }
  }

  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(job);

  const metaPeek = await getJobMeta(jobId);
  const storeOrders = Array.isArray(metaPeek.storeOrders) ? metaPeek.storeOrders : [];
  const wantOrderId = options.orderId ? String(options.orderId).trim() : "";

  let order =
    wantOrderId &&
    storeOrders.find((o) => String(o.storeId) === String(supplierId) && String(o.orderId) === wantOrderId);
  if (!order) {
    const unpaidForSupplier = storeOrders.filter(
      (o) =>
        String(o.storeId) === String(supplierId) &&
        !o.payment?.materialsPaid &&
        !["rejected_by_customer", "cancelled_by_provider"].includes(String(o.materialBatchResolution || ""))
    );
    order = unpaidForSupplier.length ? unpaidForSupplier[unpaidForSupplier.length - 1] : undefined;
  }
  if (
    order &&
    (order.materialBatchResolution === "rejected_by_customer" ||
      order.materialBatchResolution === "cancelled_by_provider")
  ) {
    throw new AppError("This materials list is no longer active for payment.", 400);
  }

  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    const legacyMaterials = Array.isArray(job.materials)
      ? job.materials.filter((m) => String(m.supplierId) === String(supplierId))
      : [];
    if (legacyMaterials.length === 0) {
      throw new AppError("No pending materials order found for this store.", 404);
    }
    const legacyAmount = legacyMaterials.reduce(
      (sum, item) => sum + coerceNumber(item.qty) * coerceNumber(item.unitPrice),
      0
    );
    const legacyPaidAt = new Date().toISOString();
    const legacyPaidOrderRef = { orderId: null };
    const legacyMeta = await mutateJobMeta(jobId, (m) => {
      const payment = {
        orderId: options.orderId || randomUUID(),
        supplierId: String(supplierId),
        supplierName: legacyMaterials[0]?.supplierName || "Store",
        amount: legacyAmount,
        status: "paid",
        paidAt: legacyPaidAt,
        deliveryProviderId: options.deliveryProviderId,
        deliveryFee: coerceNumber(options.deliveryFee, 0),
      };
      const idx = m.materialPayments.findIndex((p) => String(p.supplierId) === String(supplierId));
      if (idx >= 0) m.materialPayments[idx] = payment;
      else m.materialPayments.push(payment);

      const { order: leg } = ensureStoreOrder(m, supplierId, {
        storeName: legacyMaterials[0]?.supplierName || "Store",
        items: legacyMaterials.map((item) => ({
          productId: item.productId,
          name: item.name,
          qty: item.qty,
          unitPrice: item.unitPrice,
          qualityTier: item.qualityTier,
          imageUrl: item.imageUrl,
        })),
        invoiceId: `INV-MAT-${String(jobId).slice(-6)}-${Date.now()}`,
      });
      legacyPaidOrderRef.orderId = leg.orderId;
      leg.items = legacyMaterials.map((item) => ({
        productId: item.productId,
        name: item.name,
        qty: item.qty,
        unitPrice: item.unitPrice,
        qualityTier: item.qualityTier,
        imageUrl: item.imageUrl,
      }));
      leg.deliveryType = options.deliveryType || leg.deliveryType || "SELF";
      leg.deliveryProviderId = options.deliveryProviderId || leg.deliveryProviderId;
      leg.deliveryFee = coerceNumber(options.deliveryFee, leg.deliveryFee || 0);
      leg.payment = { materialsPaid: true, deliveryPaid: Boolean(leg.payment?.deliveryPaid) };
      leg.deliveryStatus = leg.deliveryType === "SELF" ? "SelfCollect" : "PendingApproval";
      leg.delivery = {
        type: leg.deliveryType,
        status: leg.deliveryStatus,
        providerId: leg.deliveryProviderId,
        fee: leg.deliveryFee,
      };
      leg.invoiceId = leg.invoiceId || `INV-MAT-${String(jobId).slice(-6)}-${Date.now()}`;
      const allPaidLegacy = jobProgressUtil.allStoreMaterialOrdersPaid(m);
      m.hasStarted = true;
      m.statusOverride = allPaidLegacy ? "IN_PROGRESS" : "MATERIALS_SUBMITTED";
      m.progressStep = jobProgressUtil.nextMonotonicProgressStep(m, job);
      return m;
    });
    const legacyEnriched = await finalizeJob(job, legacyMeta);
    try {
      const materialRequestService = require("./materialRequest.service");
      await materialRequestService.syncSubmittedRequestsToPaid(jobId);
    } catch (e) {
      console.error("syncSubmittedRequestsToPaid", e);
    }
    try {
      const materialOrderService = require("./materialOrder.service");
      const metaAfter = await getJobMeta(jobId);
      const sos = Array.isArray(metaAfter.storeOrders) ? metaAfter.storeOrders : [];
      const so =
        (legacyPaidOrderRef.orderId &&
          sos.find((o) => String(o.orderId) === String(legacyPaidOrderRef.orderId))) ||
        sos.find((o) => String(o.storeId) === String(supplierId));
      const invoiceRef = so?.invoiceId || `INV-MAT-${String(jobId).slice(-6)}-${Date.now()}`;
      await materialOrderService.ensureJobMaterialPurchaseOrder({
        jobId,
        customerUserId: job.customerId,
        providerUserId: job.providerId,
        supplierId,
        materialsLines: legacyMaterials,
        invoiceId: invoiceRef,
        jobStoreOrderId: legacyPaidOrderRef.orderId || so?.orderId,
        jobDeliveryType: options.deliveryType || so?.deliveryType || "SELF",
        deliveryProviderId: options.deliveryProviderId || so?.deliveryProviderId,
        jobSiteAddress: jobSiteAddressFromRow(job),
        jobSiteLocation: jobSiteLocationFromRow(job),
      });
    } catch (e) {
      console.error("ensureJobMaterialPurchaseOrder", e);
    }
    if (job.providerId) {
      await notificationEvents.notifyPaymentMade(
        job.providerId,
        jobId,
        job.title,
        "The customer paid for materials."
      );
    }
    return legacyEnriched;
  }

  const storeName = order.storeName || "Store";
  const materials = order.items.map((item) => ({
    supplierId: String(supplierId),
    supplierName: storeName,
    productId: item.productId,
    name: item.name,
    qty: coerceNumber(item.qty, 0),
    unitPrice: coerceNumber(item.unitPrice, 0),
    qualityTier: item.qualityTier,
    imageUrl: item.imageUrl,
  }));

  const amount = materials.reduce((sum, item) => sum + coerceNumber(item.qty) * coerceNumber(item.unitPrice), 0);
  const paidAt = new Date().toISOString();
  const meta = await mutateJobMeta(jobId, (m) => {
    const payment = {
      orderId: order.orderId,
      supplierId: String(supplierId),
      supplierName: storeName,
      amount,
      status: "paid",
      paidAt,
      deliveryProviderId: options.deliveryProviderId,
      deliveryFee: coerceNumber(options.deliveryFee, 0),
    };
    const mp = Array.isArray(m.materialPayments) ? [...m.materialPayments] : [];
    const pIdx = mp.findIndex((p) => String(p.orderId) === String(order.orderId));
    if (pIdx >= 0) mp[pIdx] = payment;
    else mp.push(payment);
    m.materialPayments = mp;

    const list = Array.isArray(m.storeOrders) ? [...m.storeOrders] : [];
    const oIdx = list.findIndex((o) => String(o.orderId) === String(order.orderId));
    if (oIdx < 0) throw new AppError("Store order not found", 500);
    const nextOrder = {
      ...list[oIdx],
      items: order.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        qty: coerceNumber(item.qty, 0),
        unitPrice: coerceNumber(item.unitPrice, 0),
        qualityTier: item.qualityTier,
        imageUrl: item.imageUrl,
      })),
      storeName,
      deliveryType: options.deliveryType || list[oIdx].deliveryType || "SELF",
      deliveryProviderId: options.deliveryProviderId || list[oIdx].deliveryProviderId,
      deliveryFee: coerceNumber(options.deliveryFee, list[oIdx].deliveryFee || 0),
      payment: { materialsPaid: true, deliveryPaid: Boolean(list[oIdx].payment?.deliveryPaid) },
    };
    nextOrder.deliveryStatus =
      nextOrder.deliveryType === "SELF" ? "SelfCollect" : "PendingApproval";
    nextOrder.delivery = {
      type: nextOrder.deliveryType,
      status: nextOrder.deliveryStatus,
      providerId: nextOrder.deliveryProviderId,
      fee: nextOrder.deliveryFee,
    };
    nextOrder.invoiceId =
      list[oIdx].invoiceId || `INV-MAT-${String(jobId).slice(-6)}-${Date.now()}`;
    list[oIdx] = nextOrder;
    m.storeOrders = list;
    const allPaid = jobProgressUtil.allStoreMaterialOrdersPaid(m);
    m.hasStarted = true;
    m.statusOverride = allPaid ? "IN_PROGRESS" : "MATERIALS_SUBMITTED";
    m.progressStep = jobProgressUtil.nextMonotonicProgressStep(m, job);
    return m;
  });
  const enriched = await finalizeJob(job, meta);
  try {
    const materialRequestService = require("./materialRequest.service");
    await materialRequestService.syncSubmittedRequestsToPaid(jobId);
  } catch (e) {
    console.error("syncSubmittedRequestsToPaid", e);
  }
  try {
    const materialOrderService = require("./materialOrder.service");
    const metaAfter = await getJobMeta(jobId);
    const ordersAfter = Array.isArray(metaAfter.storeOrders) ? metaAfter.storeOrders : [];
    const so = ordersAfter.find((o) => String(o.orderId) === String(order.orderId));
    const invoiceRef = so?.invoiceId || `INV-MAT-${String(jobId).slice(-6)}-${Date.now()}`;
    await materialOrderService.ensureJobMaterialPurchaseOrder({
      jobId,
      customerUserId: job.customerId,
      providerUserId: job.providerId,
      supplierId,
      materialsLines: materials,
      invoiceId: invoiceRef,
      jobStoreOrderId: order.orderId,
      jobDeliveryType: options.deliveryType || order.deliveryType || "SELF",
      deliveryProviderId: options.deliveryProviderId || order.deliveryProviderId,
      jobSiteAddress: jobSiteAddressFromRow(job),
      jobSiteLocation: jobSiteLocationFromRow(job),
    });
  } catch (e) {
    console.error("ensureJobMaterialPurchaseOrder", e);
  }
  if (job.providerId) {
    await notificationEvents.notifyPaymentMade(
      job.providerId,
      jobId,
      job.title,
      "The customer paid for materials."
    );
  }
  return enriched;
}

async function releaseEscrowPayment(jobId, amount, idempotencyKey, requestHash, route, actingUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  if (job.paymentReleased || (paymentService.isEscrowV2Job(job) && job.isFullyReleased)) {
    throw new AppError("Already released", 400);
  }
  if (!job.providerId) {
    throw new AppError("Job has no provider", 400);
  }

  const providerRow = await prisma.provider.findUnique({
    where: { userId: job.providerId },
    select: { id: true },
  });
  if (!providerRow) {
    throw new AppError("Provider profile not found", 404);
  }

  const txResult = await prisma.$transaction(
    async (tx) => {
      const gate = await idempotencyGate(tx, { idempotencyKey, requestHash, route });
      if (gate.replay) {
        return { replay: true };
      }

      const row = await tx.job.findUnique({
        where: { id: jobId },
        select: {
          meta: true,
          laborPaid: true,
          paymentReleased: true,
          isFullyReleased: true,
          providerAmount: true,
          totalPrice: true,
          releasedAmount: true,
        },
      });
      if (!row) {
        throw new AppError("Job not found", 404);
      }
      if (row.paymentReleased) {
        throw new AppError("Already released", 400);
      }
      const current = normalizeMeta(row.meta);
      const held = Number(current.escrow?.heldAmount) || 0;
      const pendingEarning = await tx.earning.findFirst({
        where: { jobId, type: "credit", status: "pending" },
      });
      const maxFromPending = pendingEarning ? Number(pendingEarning.amount) : 0;
      let release = coerceNumber(amount, 0);
      if (paymentService.isEscrowV2Job(row) && release <= 0) {
        release = Math.min(held || maxFromPending, maxFromPending || held) || 0;
      }
      if (release <= 0) {
        throw new AppError("amount must be positive (or use default for remaining escrow on v2 jobs)", 400);
      }
      if (release > held) {
        throw new AppError("Release amount exceeds held escrow", 400);
      }
      if (maxFromPending > 0 && release > maxFromPending + 0.0001) {
        throw new AppError("Release amount exceeds pending earnings", 400);
      }

      await earningService.syncPendingCreditToHeld(tx, {
        providerId: providerRow.id,
        jobId,
        heldAmount: held,
      });

      await earningService.applyReleaseToLedger(tx, {
        providerId: providerRow.id,
        jobId,
        releaseAmount: release,
        idempotencyKey,
      });

      const meta = await mutateJobMetaInTransaction(tx, jobId, (m) => {
        const h = Number(m.escrow?.heldAmount) || 0;
        const rel = Number(m.escrow?.releasedAmount) || 0;
        return {
          ...m,
          escrow: {
            heldAmount: h - release,
            releasedAmount: rel + release,
          },
        };
      });

      const heldAfter = Number(meta.escrow?.heldAmount) || 0;
      const laborPaidFlag = Boolean(meta.laborPaid) || Boolean(row.laborPaid);
      let jobRow = job;
      const jfV2 = await tx.job.findUnique({ where: { id: jobId } });
      if (paymentService.isEscrowV2Job(jfV2) && jfV2.providerAmount) {
        const rAmt = new Prisma.Decimal(String(jfV2.releasedAmount || 0)).add(
          new Prisma.Decimal(String(release))
        );
        const prov = new Prisma.Decimal(String(jfV2.providerAmount));
        const done = rAmt.gte(prov) || heldAfter === 0;
        jobRow = await tx.job.update({
          where: { id: jobId },
          data: {
            releasedAmount: rAmt,
            isFullyReleased: done,
            paymentReleased: done,
            escrowSecondReleaseDone: done,
          },
          include: jobInclude,
        });
      } else if (laborPaidFlag && heldAfter === 0) {
        jobRow = await tx.job.update({
          where: { id: jobId },
          data: { paymentReleased: true },
          include: jobInclude,
        });
      }

      await idempotencyCommit(tx, { idempotencyKey, requestHash, route });
      return { replay: false, jobRow, meta, release };
    },
    {
      maxWait: 5000,
      timeout: 15000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );

  if (txResult.replay) {
    const jobRow = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
    const meta = await getJobMeta(jobId);
    return finalizeJob(jobRow, meta);
  }

  const { jobRow, meta, release } = txResult;
  await logAudit("payment.release_escrow", {
    userId: actingUserId != null ? String(actingUserId) : null,
    metadata: { jobId, amount: release, providerId: providerRow.id },
  });

  return finalizeJob(jobRow, meta);
}

async function getLaborInvoiceByJobId(jobId) {
  const meta = await getJobMeta(jobId);
  if (!meta.servicePayment) return null;
  return {
    id: `INV-LAB-${String(jobId).slice(-6)}`,
    jobId,
    userId: meta.servicePayment.paidBy,
    type: "labor",
    status: "paid",
    totalAmount: meta.servicePayment.amount,
    lineItems: [
      {
        description: "Labor / Service",
        quantity: 1,
        unitPrice: meta.servicePayment.amount,
        total: meta.servicePayment.amount,
      },
    ],
    paymentMethod: "Card",
    cardLast4: String(meta.servicePayment.maskedPaymentMethod || "").slice(-4),
    paidAt: meta.servicePayment.paidAt,
    createdAt: meta.servicePayment.paidAt,
  };
}

async function createLaborInvoice(jobId, userId, laborAmount, cardLast4) {
  const amount = coerceNumber(laborAmount, 0);
  const now = new Date().toISOString();
  return {
    id: `INV-LAB-${String(jobId).slice(-6)}-${Date.now()}`,
    jobId,
    userId,
    type: "labor",
    status: "paid",
    laborCost: amount,
    totalAmount: amount,
    lineItems: [{ description: "Labor / Service", quantity: 1, unitPrice: amount, total: amount }],
    paymentMethod: "Card",
    cardLast4: cardLast4 || "****",
    paidAt: now,
    createdAt: now,
  };
}

function findStoreOrderInMeta(meta, orderId) {
  const list = Array.isArray(meta.storeOrders) ? meta.storeOrders : [];
  const idx = list.findIndex((o) => String(o.orderId) === String(orderId));
  return { list, idx, order: idx >= 0 ? list[idx] : null };
}

function assertMaterialsUnpaid(order) {
  if (!order) throw new AppError("Material batch not found", 404);
  if (Boolean(order.payment?.materialsPaid)) {
    throw new AppError("Materials are already paid; this list cannot be changed.", 400);
  }
}

function stripJobMaterialsLinesForDismissedOrder(jobMaterials, order) {
  const lines = Array.isArray(jobMaterials) ? [...jobMaterials] : [];
  const mrId = order.materialRequestId ? String(order.materialRequestId) : "";
  const storeId = String(order.storeId);
  const productIds = new Set((order.items || []).map((i) => String(i.productId)));
  if (!mrId) {
    return lines;
  }
  return lines.filter((line) => {
    const lineStore = String(line.branchId ?? line.supplierId ?? "");
    const pid = String(line.productId);
    const lineMr = line.materialRequestId != null ? String(line.materialRequestId) : "";
    if (lineStore !== storeId || !productIds.has(pid)) return true;
    if (lineMr === mrId) return false;
    return true;
  });
}

async function reconcileMaterialRequestAfterDismiss(jobId, materialRequestId) {
  const mrId = String(materialRequestId || "").trim();
  if (!mrId) return;
  const meta = await getJobMeta(jobId);
  const orders = Array.isArray(meta.storeOrders) ? meta.storeOrders : [];
  const stillOutstanding = orders.some((o) => {
    if (String(o.materialRequestId || "") !== mrId) return false;
    if (Boolean(o.payment?.materialsPaid)) return false;
    const res = String(o.materialBatchResolution || "");
    const dead = res === "rejected_by_customer" || res === "cancelled_by_provider";
    return !dead;
  });
  if (stillOutstanding) return;
  const anyPaid = orders.some(
    (o) => String(o.materialRequestId || "") === mrId && Boolean(o.payment?.materialsPaid)
  );
  if (anyPaid) return;
  try {
    await prisma.materialRequest.updateMany({
      where: { id: mrId, jobId, status: "submitted" },
      data: { status: "draft" },
    });
  } catch {
    /** ignore */
  }
}

async function customerRejectProviderMaterialBatch(jobId, orderId, customerUserId) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, customerId: true, category: true },
  });
  if (!job) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(job);
  if (String(job.customerId) !== String(customerUserId)) {
    throw new AppError("Forbidden", 403);
  }
  const meta = await mutateJobMeta(jobId, (m) => {
    const { list, idx, order } = findStoreOrderInMeta(m, orderId);
    if (!order || idx < 0) throw new AppError("Material batch not found", 404);
    assertMaterialsUnpaid(order);
    if (String(order.orderId || "").startsWith("legacy-")) {
      throw new AppError("Cannot reject this material view.", 400);
    }
    if (order.sourceUserSuggestionId) {
      throw new AppError(
        "This batch is linked to your suggestion — cancel it under the Suggested tab instead.",
        400
      );
    }
    if (order.materialBatchResolution) {
      throw new AppError("This batch is already resolved.", 400);
    }
    list[idx] = {
      ...order,
      materialBatchResolution: "rejected_by_customer",
      materialBatchRejectedAt: new Date().toISOString(),
    };
    m.storeOrders = list;
    return m;
  });
  const refreshed = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  return await finalizeJob(refreshed, meta);
}

async function providerCancelProviderMaterialBatch(jobId, orderId, providerUserId) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, providerId: true, category: true },
  });
  if (!job) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(job);
  if (String(job.providerId || "") !== String(providerUserId)) {
    throw new AppError("Forbidden", 403);
  }
  const meta = await mutateJobMeta(jobId, (m) => {
    const { list, idx, order } = findStoreOrderInMeta(m, orderId);
    if (!order || idx < 0) throw new AppError("Material batch not found", 404);
    assertMaterialsUnpaid(order);
    if (order.sourceUserSuggestionId) {
      throw new AppError("Use suggestion withdraw for customer-suggestion batches.", 400);
    }
    if (order.materialBatchResolution) {
      throw new AppError("This batch is already resolved.", 400);
    }
    list[idx] = {
      ...order,
      materialBatchResolution: "cancelled_by_provider",
      materialBatchRejectedAt: new Date().toISOString(),
    };
    m.storeOrders = list;
    return m;
  });
  const refreshed = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  return await finalizeJob(refreshed, meta);
}

async function dismissMaterialBatch(jobId, orderId, actorUserId, actorRole) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(job);
  if (
    actorRole === "CUSTOMER" &&
    String(job.customerId) !== String(actorUserId)
  ) {
    throw new AppError("Forbidden", 403);
  }
  if (
    actorRole === "PROVIDER" &&
    String(job.providerId || "") !== String(actorUserId)
  ) {
    throw new AppError("Forbidden", 403);
  }
  if (actorRole !== "CUSTOMER" && actorRole !== "PROVIDER") {
    throw new AppError("Forbidden", 403);
  }

  const metaPeek = await getJobMeta(jobId);
  const { order } = findStoreOrderInMeta(metaPeek, orderId);
  if (!order) throw new AppError("Material batch not found", 404);
  assertMaterialsUnpaid(order);
  const res = order.materialBatchResolution;
  if (res !== "rejected_by_customer" && res !== "cancelled_by_provider") {
    throw new AppError("Reject or cancel this list before removing it.", 400);
  }

  const mrId = order.materialRequestId ? String(order.materialRequestId) : "";
  const nextMaterials = stripJobMaterialsLinesForDismissedOrder(job.materials, order);

  await prisma.job.update({
    where: { id: jobId },
    data: { materials: nextMaterials },
  });

  const meta = await mutateJobMeta(jobId, (m) => {
    const list = Array.isArray(m.storeOrders) ? m.storeOrders.filter((o) => String(o.orderId) !== String(orderId)) : [];
    m.storeOrders = list;
    return m;
  });

  const refreshed = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (mrId) {
    await reconcileMaterialRequestAfterDismiss(jobId, mrId);
  }
  return await finalizeJob(refreshed, meta);
}

async function withdrawAcceptedUserMaterialSuggestion(jobId, suggestionId, actorUserId, actorRole) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(job);
  if (
    actorRole === "CUSTOMER" &&
    String(job.customerId) !== String(actorUserId)
  ) {
    throw new AppError("Forbidden", 403);
  }
  if (
    actorRole === "PROVIDER" &&
    String(job.providerId || "") !== String(actorUserId)
  ) {
    throw new AppError("Forbidden", 403);
  }
  if (actorRole !== "CUSTOMER" && actorRole !== "PROVIDER") {
    throw new AppError("Forbidden", 403);
  }

  const sid = String(suggestionId || "").trim();
  const meta = await mutateJobMeta(jobId, (m) => {
    const suggestions = Array.isArray(m.userMaterialSuggestions) ? m.userMaterialSuggestions : [];
    const s = suggestions.find((x) => String(x.id) === sid);
    if (!s) throw new AppError("Suggestion not found", 404);
    const st = String(s.status || "").toLowerCase();
    if (st !== "accepted") {
      throw new AppError("Only an accepted suggestion can be withdrawn.", 400);
    }
    const storeOrders = Array.isArray(m.storeOrders) ? [...m.storeOrders] : [];
    const sugOrderIdx = storeOrders.findIndex((o) => String(o.sourceUserSuggestionId || "") === sid);
    if (sugOrderIdx < 0) {
      throw new AppError("No unpaid checkout batch for this accepted suggestion.", 400);
    }
    assertMaterialsUnpaid(storeOrders[sugOrderIdx]);
    storeOrders.splice(sugOrderIdx, 1);
    m.storeOrders = storeOrders;
    const by = actorRole === "CUSTOMER" ? "customer" : "provider";
    const now = new Date().toISOString();
    m.userMaterialSuggestions = suggestions.map((x) =>
      String(x.id) === sid
        ? {
            ...x,
            status: "rejected",
            withdrawnAfterAccept: true,
            withdrawnAt: now,
            withdrawnBy: by,
          }
        : x
    );
    return m;
  });

  const refreshed = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  return await finalizeJob(refreshed, meta);
}

async function purgeWithdrawnUserMaterialSuggestion(jobId, suggestionId, actorUserId, actorRole) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, customerId: true, providerId: true, category: true },
  });
  if (!job) throw new AppError("Job not found", 404);
  await assertJobCategoryAllowsMaterials(job);
  if (
    actorRole === "CUSTOMER" &&
    String(job.customerId) !== String(actorUserId)
  ) {
    throw new AppError("Forbidden", 403);
  }
  if (
    actorRole === "PROVIDER" &&
    String(job.providerId || "") !== String(actorUserId)
  ) {
    throw new AppError("Forbidden", 403);
  }
  if (actorRole !== "CUSTOMER" && actorRole !== "PROVIDER") {
    throw new AppError("Forbidden", 403);
  }

  const sid = String(suggestionId || "").trim();
  let found = false;
  const meta = await mutateJobMeta(jobId, (m) => {
    const suggestions = Array.isArray(m.userMaterialSuggestions) ? m.userMaterialSuggestions : [];
    const s = suggestions.find((x) => String(x.id) === sid);
    if (!s) throw new AppError("Suggestion not found", 404);
    if (!s.withdrawnAfterAccept) {
      throw new AppError("Only withdrawn suggestions can be removed from history.", 400);
    }
    /** Ensure no dangling unpaid suggestion order */
    const storeOrders = Array.isArray(m.storeOrders) ? m.storeOrders : [];
    const dangling = storeOrders.some((o) => String(o.sourceUserSuggestionId || "") === sid && !o.payment?.materialsPaid);
    if (dangling) {
      throw new AppError("Unresolved suggestion checkout still pending; refresh and retry.", 400);
    }
    m.userMaterialSuggestions = suggestions.filter((x) => String(x.id) !== sid);
    found = true;
    return m;
  });
  if (!found) throw new AppError("Suggestion not found", 404);
  const refreshed = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  return await finalizeJob(refreshed, meta);
}

module.exports = {
  createJob,
  getMatchedJobsForProvider,
  acceptJob,
  getJobById,
  getJobByIdForActor,
  getJobsForActor,
  getJobsForCustomerId,
  deleteJob,
  addMaterials,
  removeMaterial,
  addJobNote,
  addChatMessage,
  submitServicePrice,
  uploadJobQuotation,
  getJobQuotationDownload,
  payLabor,
  submitMaterials,
  rejectJob,
  rejectJobByProvider,
  deleteRejectedRequestFromProviderView,
  updateProviderRequirements,
  addUserMaterialSuggestion,
  acceptUserSuggestion,
  rejectUserSuggestion,
  addProviderMaterialSuggestion,
  acceptProviderSuggestion,
  rejectProviderSuggestion,
  proposeNewLaborPrice,
  acceptProposedPrice,
  cancelJob,
  confirmJobCompletion,
  setStoreDeliveryOption,
  approveStoreDeliveryRequest,
  updateStoreOrderDeliveryStatus,
  updateStoreOrderDelivery,
  approveStoreOrderDelivery,
  rejectStoreOrderDelivery,
  payStoreOrderDelivery,
  payForStoreMaterials,
  updateJobStatus,
  releaseEscrowPayment,
  createLaborInvoice,
  getLaborInvoiceByJobId,
  customerRejectProviderMaterialBatch,
  providerCancelProviderMaterialBatch,
  dismissMaterialBatch,
  withdrawAcceptedUserMaterialSuggestion,
  purgeWithdrawnUserMaterialSuggestion,
};
