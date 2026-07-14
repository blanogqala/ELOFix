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
  toFrontendStatus,
  isTerminalJobState,
  appendTimelineEventIfAbsent,
} = require("./jobMeta.service");
const earningService = require("./earning.service");
const paymentService = require("./payment.service");
const notificationEvents = require("./notificationEvents.service");
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES } = require("../constants/auditActions");
const { idempotencyGate, idempotencyCommit } = require("../utils/idempotencyTransaction");
const jobProgressUtil = require("../utils/jobProgress.util");
const { upsertProviderReviewForJob, normalizeRating } = require("./providerReview.service");
const { expandLaborPricingFromPaidJob, isProviderAvailable } = require("./provider.service");
const { assertCustomerNotBlocked } = require("./accountStatus.service");
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
const { scanUploadedFile } = require("./fileScan.service");
const { unlinkQuietly } = require("../utils/uploadSecurity.util");

const jobInclude = {
  customer: {
    select: { id: true, name: true, email: true, phone: true, role: true },
  },
  provider: {
    select: { id: true, name: true, email: true, role: true },
  },
};

const {
  jobSiteAddressFromRow,
  jobSiteLocationFromRow,
} = require("../utils/address.util");

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

  const providerProfile = await prisma.provider.findFirst({
    where: {
      OR: [{ id: rawId }, { userId: rawId }, { user: { id: rawId, role: "PROVIDER" } }],
    },
    select: {
      id: true,
      userId: true,
      approved: true,
      profileCompleted: true,
      blocked: true,
      deletedAt: true,
      settings: true,
    },
  });

  if (providerProfile) {
    if (
      providerProfile.deletedAt ||
      providerProfile.blocked ||
      providerProfile.approved !== true ||
      providerProfile.profileCompleted !== true ||
      !isProviderAvailable(providerProfile.settings)
    ) {
      throw new AppError("Selected provider is not available for booking", 400);
    }
    const refundRecovery = require("./refundRecovery.service");
    await refundRecovery.assertProviderNoOverdueRefundDebt(providerProfile.id);
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
    metro = undefined,
    notes = undefined,
    coordinates = undefined,
  } = location;

  const details = {};
  if (address !== undefined && address !== null && String(address).trim()) details.address = String(address).trim();
  if (city !== undefined && city !== null && String(city).trim()) details.city = String(city).trim();
  if (area !== undefined && area !== null && String(area).trim()) details.area = String(area).trim();
  if (suburb !== undefined && suburb !== null && String(suburb).trim()) details.suburb = String(suburb).trim();
  if (metro !== undefined && metro !== null && String(metro).trim()) details.metro = String(metro).trim();
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

/**
 * Pending jobs visible in a provider's request inbox:
 * - Directed: customer chose this provider (job.providerId === userId)
 * - Open pool: no provider yet and category matches provider skills
 */
function isPendingJobVisibleToProvider(job, userId, providerSkillsSet, meta) {
  if (isDismissedFromProviderInbox(meta, userId)) {
    return false;
  }
  const frontendStatus = toFrontendStatus(job.status, meta);
  if (frontendStatus !== "PENDING") {
    return false;
  }

  const assignedTo = job.providerId ? String(job.providerId).trim() : "";
  if (assignedTo) {
    return assignedTo === String(userId);
  }

  const category = normalizeValue(job.category);
  if (!category || providerSkillsSet.size === 0) {
    return false;
  }
  return providerSkillsSet.has(category);
}

function isDismissedFromProviderInbox(meta, userId) {
  const list = meta?.dismissedFromProviderInbox;
  if (!Array.isArray(list)) return false;
  return list.map((id) => String(id)).includes(String(userId));
}

async function loadProviderSkillsSet(userId) {
  const provider = await prisma.provider.findUnique({
    where: { userId },
    select: { skills: true },
  });
  if (!provider) {
    throw new AppError("Provider profile not found", 404);
  }
  const skills = Array.isArray(provider.skills)
    ? provider.skills.map(normalizeValue).filter(Boolean)
    : [];
  return new Set(skills);
}

/** Ensures provider may accept/reject a pending inbox request (directed or open-pool match). */
async function assertProviderCanActOnPendingJob(jobId, userId) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, providerId: true, category: true },
  });
  if (!job) {
    throw new AppError("Job not found", 404);
  }
  if (job.status !== "PENDING") {
    throw new AppError("Only pending jobs can be handled as requests", 409);
  }
  const meta = await getJobMeta(job.id);
  const providerSkillsSet = await loadProviderSkillsSet(userId);
  if (!isPendingJobVisibleToProvider(job, userId, providerSkillsSet, meta)) {
    throw new AppError("This job request is not assigned to you", 403);
  }
  return { job, meta };
}

function assertActorCanAccessJob(job, actorUserId, actorRole) {
  if (!job) throw new AppError("Job not found", 404);
  const role = String(actorRole || "").toUpperCase();
  if (role === "ADMIN") return;
  if (role === "CUSTOMER") {
    if (String(job.customerId) !== String(actorUserId)) {
      throw new AppError("Forbidden", 403);
    }
    return;
  }
  if (role === "PROVIDER") {
    if (String(job.providerId || "") !== String(actorUserId)) {
      throw new AppError("Forbidden", 403);
    }
    return;
  }
  throw new AppError("Forbidden", 403);
}

function assertCustomerOwnsJob(job, actorUserId) {
  if (!job) throw new AppError("Job not found", 404);
  if (String(job.customerId) !== String(actorUserId)) {
    throw new AppError("Forbidden", 403);
  }
}

function assertProviderOwnsJob(job, actorUserId) {
  if (!job) throw new AppError("Job not found", 404);
  if (String(job.providerId || "") !== String(actorUserId)) {
    throw new AppError("Forbidden", 403);
  }
}

async function createJob(userId, body) {
  const customer = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { blocked: true },
  });
  assertCustomerNotBlocked(customer);

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
      settings: true,
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

  if (!isProviderAvailable(provider.settings)) {
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

  const visibleJobs = [];
  for (const job of pendingJobs) {
    const meta = await getJobMeta(job.id);
    if (meta?.courierFlow && meta?.materialOrderId) {
      const mo = await prisma.materialOrder.findUnique({
        where: { id: String(meta.materialOrderId) },
        select: { payload: true },
      });
      const payload = mo?.payload && typeof mo.payload === "object" ? mo.payload : {};
      const materialOrderService = require("./materialOrder.service");
      if (!materialOrderService.isProviderDeliveryType(materialOrderService.resolvePayloadDeliveryType(payload))) {
        materialOrderService
          .repairStaleCourierJobsForMaterialOrder(String(meta.materialOrderId), { notify: false })
          .catch((e) => console.error("getMatchedJobs repairStaleCourier", job.id, e));
        continue;
      }
    }
    if (isPendingJobVisibleToProvider(job, userId, providerSkillsSet, meta)) {
      visibleJobs.push(job);
    }
  }

  const scored = visibleJobs
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

  const providerProfile = await prisma.provider.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (providerProfile) {
    const refundRecovery = require("./refundRecovery.service");
    await refundRecovery.assertProviderNoOverdueRefundDebt(providerProfile.id);
  }

  await assertProviderCanActOnPendingJob(jobId, userId);

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: {
      providerId: userId,
      status: "ACCEPTED",
    },
    include: jobInclude,
  });
  let meta = await mutateJobMeta(jobId, (m) =>
    withStatusAndProgress(
      {
        ...m,
        rejectionReason: null,
        rejectionDetails: null,
        rejectedAt: null,
        rejectedByProviderUserId: null,
      },
      "ASSIGNED",
      updated
    )
  );

  const categorySlug = String(updated.category || "").trim();
  if (categorySlug) {
    const cat = await prisma.category.findUnique({
      where: { id: categorySlug },
      select: { requiresInspection: true },
    });
    if (cat && cat.requiresInspection === false) {
      meta = await mutateJobMeta(jobId, (m) => withStatusAndProgress(m, "INSPECTED", updated));
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
    let meta = await getJobMeta(job.id);
    if (role === "PROVIDER" && isDismissedFromProviderInbox(meta, userId)) {
      continue;
    }
    if (
      role === "CUSTOMER" &&
      meta?.courierFlow &&
      meta?.materialOrderId &&
      String(job.status) === "PENDING"
    ) {
      const mo = await prisma.materialOrder.findUnique({
        where: { id: String(meta.materialOrderId) },
        select: { payload: true },
      });
      const payload = mo?.payload && typeof mo.payload === "object" ? mo.payload : {};
      const materialOrderService = require("./materialOrder.service");
      if (
        !materialOrderService.isProviderDeliveryType(
          materialOrderService.resolvePayloadDeliveryType(payload)
        )
      ) {
        await materialOrderService
          .repairStaleCourierJobsForMaterialOrder(String(meta.materialOrderId), { notify: false })
          .catch((e) => console.error("getJobsForActor repairStaleCourier", job.id, e));
        const refreshed = await prisma.job.findUnique({
          where: { id: job.id },
          include: jobInclude,
        });
        if (refreshed) {
          meta = await getJobMeta(job.id);
          out.push(await finalizeJob(refreshed, meta));
          continue;
        }
      }
    }
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

/** Apply statusOverride and bump monotonic progressStep from job row state. */
function withStatusAndProgress(meta, statusOverride, jobRow) {
  if (isTerminalJobState(meta, jobRow)) {
    const next = { ...meta };
    next.progressStep = jobProgressUtil.nextMonotonicProgressStep(next, jobRow);
    return next;
  }
  const next = { ...meta, statusOverride };
  next.progressStep = jobProgressUtil.nextMonotonicProgressStep(next, jobRow);
  return next;
}

function resolveMaterialPaymentStatusOverride(meta, jobRow, allPaid) {
  if (isTerminalJobState(meta, jobRow)) {
    return "COMPLETED";
  }
  const laborPaid = Boolean(jobRow.laborPaid) || Boolean(meta.laborPaid);
  if (allPaid && laborPaid) {
    return "IN_PROGRESS";
  }
  if (allPaid) {
    return "MATERIALS_PAID";
  }
  return "MATERIALS_SUBMITTED";
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
  let categoryDisplayName = null;
  const key = String(slug || "").trim();
  if (!key) {
    return { requiresInspection, requiresMaterials, step3Type, categoryDisplayName };
  }
  try {
    const cat = await prisma.category.findUnique({
      where: { id: key },
      select: { name: true, requiresInspection: true, requiresMaterials: true, step3Type: true },
    });
    if (cat?.name) {
      categoryDisplayName = String(cat.name).trim() || null;
    }
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
  if (!categoryDisplayName) {
    categoryDisplayName = key;
  }
  return { requiresInspection, requiresMaterials, step3Type, categoryDisplayName };
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
  if (step3Type === "none") {
    return;
  }
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

async function buildDeliverySummaryForJob(deliveryRequestId) {
  if (!deliveryRequestId) return null;
  try {
    const row = await prisma.deliveryRequest.findUnique({
      where: { id: String(deliveryRequestId) },
      select: {
        status: true,
        quotedFee: true,
        fulfillmentStatus: true,
        payload: true,
      },
    });
    if (!row) return null;
    const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
    const payment = payload.payment && typeof payload.payment === "object" ? payload.payment : {};
    const drStatus = String(row.status || "").toLowerCase();
    const deliveryPaid =
      ["paid", "in_transit", "completed"].includes(drStatus) || payment.deliveryPaid === true;
    let quotedFee = row.quotedFee != null ? Number(row.quotedFee) : null;
    if (quotedFee == null || !Number.isFinite(quotedFee)) {
      const fromQuote = Number(payload.deliveryQuote?.fee);
      const fromDelivery = Number(payload.delivery?.fee);
      if (Number.isFinite(fromQuote) && fromQuote >= 0) quotedFee = fromQuote;
      else if (Number.isFinite(fromDelivery) && fromDelivery >= 0) quotedFee = fromDelivery;
      else quotedFee = null;
    }
    return {
      status: row.status,
      quotedFee,
      fulfillmentStatus: row.fulfillmentStatus ? String(row.fulfillmentStatus) : null,
      deliveryPaid,
    };
  } catch (e) {
    console.error("buildDeliverySummaryForJob", e);
    return null;
  }
}

async function finalizeJob(job, meta) {
  let workingJob = job;
  let workingMeta = meta;
  const deliveryRequestId =
    meta && typeof meta === "object" && meta.deliveryRequestId
      ? String(meta.deliveryRequestId)
      : null;
  const courierFlow = Boolean(meta && typeof meta === "object" && meta.courierFlow);
  const parentJobId =
    meta && typeof meta === "object" && meta.parentJobId ? String(meta.parentJobId).trim() : null;
  let deliverySummary =
    courierFlow && deliveryRequestId
      ? await buildDeliverySummaryForJob(deliveryRequestId)
      : null;

  if (
    courierFlow &&
    deliveryRequestId &&
    deliverySummary?.quotedFee != null &&
    Number(deliverySummary.quotedFee) > 0 &&
    Number(workingJob?.price) === 0
  ) {
    try {
      const drRow = await prisma.deliveryRequest.findUnique({
        where: { id: deliveryRequestId },
      });
      if (drRow) {
        const deliveryRequestService = require("./deliveryRequest.service");
        await deliveryRequestService.syncCourierJobPricingFromDeliveryRow(drRow, {
          paid: Boolean(deliverySummary.deliveryPaid),
        });
        const refreshed = await prisma.job.findUnique({
          where: { id: workingJob.id },
          include: jobInclude,
        });
        if (refreshed) {
          workingJob = refreshed;
          workingMeta = await getJobMeta(workingJob.id);
          deliverySummary = await buildDeliverySummaryForJob(deliveryRequestId);
        }
      }
    } catch (e) {
      console.error("courier pricing backfill", e);
    }
  }

  const base = enrichJob(workingJob, workingMeta);
  const slug = String(base.category || "").trim();
  const {
    requiresInspection,
    requiresMaterials,
    step3Type: categoryStep3Type,
    categoryDisplayName,
  } = await resolveCategorySettings(slug);
  let jobMaterialOrders = [];
  if (workingJob?.id) {
    try {
      const materialOrderService = require("./materialOrder.service");
      jobMaterialOrders = await materialOrderService.getJobMaterialOrdersForJob(workingJob.id);
    } catch (e) {
      console.error("getJobMaterialOrdersForJob", e);
    }
  }

  return {
    ...base,
    requiresInspection,
    requiresMaterials,
    categoryStep3Type,
    categoryDisplayName,
    jobMaterialOrders,
    deliveryRequestId,
    courierFlow,
    parentJobId: parentJobId || null,
    deliverySummary,
  };
}

async function updateJobStatus(jobId, status, actorUserId, actorRole) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  if (actorUserId != null && actorRole != null) {
    assertActorCanAccessJob(job, actorUserId, actorRole);
  }
  if (String(status) === "INSPECTED") {
    const metaBefore = await getJobMeta(jobId);
    await assertSpecificationsReadyForPricing(job, metaBefore);
  }
  if (String(status) === "AWAITING_CONFIRMATION") {
    const metaBefore = await getJobMeta(jobId);
    const isCourier = Boolean(metaBefore?.courierFlow);
    const laborPaid = Boolean(job.laborPaid) || Boolean(metaBefore?.laborPaid);
    if (!isCourier && !laborPaid) {
      throw new AppError(
        "Service payment is required before marking the job complete.",
        409
      );
    }
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
  const meta = await mutateJobMeta(jobId, (m) => {
    const next = withStatusAndProgress(m, status, updatedJob);
    if (String(status) === "AWAITING_CONFIRMATION") {
      const now = new Date();
      const deadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      next.markedCompleteAt = now.toISOString();
      next.confirmationDeadlineAt = deadline.toISOString();
    }
    return next;
  });
  const result = await finalizeJob(updatedJob, meta);
  if (String(status) === "INSPECTED" && job.customerId) {
    await notificationEvents.notifyInspectionCompleted(job.customerId, jobId, job.title);
  }
  if (String(status) === "AWAITING_CONFIRMATION" && job.customerId) {
    await notificationEvents.notifyCustomerConfirmationNeeded(job.customerId, jobId, job.title);
    if (job.providerId) {
      await notificationEvents.notifyJobMarkedComplete(job.providerId, jobId, job.title);
    }
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

async function addMaterials(jobId, newMaterials = [], actorUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertCustomerOwnsJob(job, actorUserId);
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

async function removeMaterial(jobId, productId, supplierId, actorUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertCustomerOwnsJob(job, actorUserId);
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

async function addJobNote(jobId, author, message, title, actorUserId, actorRole) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertActorCanAccessJob(job, actorUserId, actorRole);
  const note = createNote(author, message, title);
  const meta = await mutateJobMeta(jobId, (m) => ({ ...m, jobNotes: [...m.jobNotes, note] }));
  return await finalizeJob(job, meta);
}

async function addChatMessage(jobId, author, message, actorUserId, actorRole) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertActorCanAccessJob(job, actorUserId, actorRole);
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
  try {
    await scanUploadedFile(file.path, { originalName: file.originalname });
  } catch (err) {
    await unlinkQuietly(file.path);
    throw err;
  }

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

async function submitServicePrice(jobId, amount, note, providerUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  if (String(job.providerId || "") !== String(providerUserId)) {
    throw new AppError("Only the assigned provider can submit a service price", 403);
  }
  const metaBefore = await getJobMeta(jobId);
  await assertSpecificationsReadyForPricing(job, metaBefore);
  const safeAmount = coerceNumber(amount);
  const updated = await prisma.job.update({
    where: { id: jobId },
    data: { price: safeAmount },
    include: jobInclude,
  });
  const meta = await mutateJobMeta(jobId, (m) =>
    withStatusAndProgress(
      {
        ...m,
        servicePrice: {
          amount: safeAmount,
          note: note ? String(note) : "",
          submittedAt: new Date().toISOString(),
        },
      },
      "SERVICE_PRICE_SUBMITTED",
      updated
    )
  );
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
  if (job.status === "CANCELLED" || job.status === "REJECTED") {
    throw new AppError("Cannot pay for a cancelled or rejected job", 400);
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
  await logAudit(AUDIT_ACTIONS.PAYMENT_PAY_LABOR, {
    userId,
    entityType: ENTITY_TYPES.PAYMENT,
    entityId: jobId,
    newValue: { jobId, amount, providerId: providerRow.id },
  });
  if (job.providerId) {
    await notificationEvents.notifyPaymentMade(
      job.providerId,
      jobId,
      job.title,
      "The customer paid for labor / service.",
      "labor"
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
  const enriched = await finalizeJob(job, meta);
  if (!isOpenPool && job.customerId) {
    await notificationEvents.notifyJobRejected(job.customerId, jobId, job.title);
  }
  return enriched;
}

async function rejectJobByProvider(jobId, reason, details, rejectingProviderUserId) {
  if (!rejectingProviderUserId) {
    throw new AppError("Provider context is required", 400);
  }
  await assertProviderCanActOnPendingJob(jobId, rejectingProviderUserId);
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const isOpenPool = !job.providerId;
  const meta = await mutateJobMeta(jobId, (m) => {
    const rejectionFields = {
      rejectionReason: reason || null,
      rejectionDetails: details || null,
      rejectedAt: new Date().toISOString(),
      rejectedByProviderUserId: String(rejectingProviderUserId),
    };
    if (isOpenPool) {
      return {
        ...m,
        ...rejectionFields,
        dismissedFromProviderInbox: [
          ...new Set([
            ...(Array.isArray(m.dismissedFromProviderInbox)
              ? m.dismissedFromProviderInbox.map((id) => String(id))
              : []),
            String(rejectingProviderUserId),
          ]),
        ],
      };
    }
    return withStatusAndProgress({ ...m, ...rejectionFields }, "REJECTED", job);
  });
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

async function reselectJobProvider(jobId, selectedProviderId, customerUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertCustomerOwnsJob(job, customerUserId);

  const metaBefore = await getJobMeta(jobId);
  const frontendStatus = toFrontendStatus(job.status, metaBefore);
  if (frontendStatus !== "REJECTED") {
    throw new AppError("Only rejected jobs can be reassigned to another provider", 400);
  }

  const newProviderUserId = await resolveProviderUserId(selectedProviderId);
  if (!newProviderUserId) {
    throw new AppError("selectedProviderId is required", 400);
  }

  const rejectingProviderId = String(
    metaBefore.rejectedByProviderUserId || job.providerId || ""
  ).trim();
  if (rejectingProviderId && String(newProviderUserId) === rejectingProviderId) {
    throw new AppError("Please select a different provider", 400);
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: {
      providerId: newProviderUserId,
      status: "PENDING",
    },
    include: jobInclude,
  });

  const meta = await mutateJobMeta(jobId, (m) =>
    withStatusAndProgress(
      {
        ...m,
        rejectionReason: null,
        rejectionDetails: null,
        rejectedAt: null,
        rejectedByProviderUserId: null,
        progressStep: 0,
        hasStarted: false,
      },
      "PENDING",
      updated
    )
  );

  const enriched = await finalizeJob(updated, meta);
  if (updated.providerId) {
    await notificationEvents.notifyJobRequest(updated.providerId, jobId, updated.title);
  }
  return enriched;
}

async function deleteRejectedRequestFromProviderView(jobId, actorUserId) {
  const meta = await getJobMeta(jobId);
  if (meta.statusOverride !== "REJECTED") {
    throw new AppError("Only rejected requests can be removed", 400);
  }
  if (String(meta.rejectedByProviderUserId || "") !== String(actorUserId)) {
    throw new AppError("Forbidden", 403);
  }
  await mutateJobMeta(jobId, (m) => ({
    ...m,
    dismissedFromProviderInbox: [
      ...new Set([
        ...(Array.isArray(m.dismissedFromProviderInbox)
          ? m.dismissedFromProviderInbox.map((id) => String(id))
          : []),
        String(actorUserId),
      ]),
    ],
  }));
  return { id: jobId, dismissed: true };
}

async function getCancelledRequestsForProvider(providerUserId) {
  const pid = String(providerUserId || "").trim();
  if (!pid) return [];
  const jobs = await prisma.job.findMany({
    where: {
      providerId: pid,
      status: "CANCELLED",
    },
    include: jobInclude,
    orderBy: { createdAt: "desc" },
  });
  const results = [];
  for (const job of jobs) {
    const meta = await getJobMeta(job.id);
    if (!meta?.courierFlow) continue;
    if (isDismissedFromProviderInbox(meta, pid)) continue;
    const frontendStatus = toFrontendStatus(job.status, meta);
    if (frontendStatus !== "CANCELLED") continue;
    const source = String(meta.cancellationSource || "");
    if (!["customer_cancel", "customer_changed_provider", "customer_changed_delivery_option"].includes(source)) continue;
    results.push(await finalizeJob(job, meta));
  }
  results.sort((a, b) => {
    const ta = a.cancelledAt ? new Date(a.cancelledAt).getTime() : new Date(a.createdAt).getTime();
    const tb = b.cancelledAt ? new Date(b.cancelledAt).getTime() : new Date(b.createdAt).getTime();
    return tb - ta;
  });
  return results;
}

async function deleteCancelledRequestFromProviderView(jobId, actorUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const meta = await getJobMeta(jobId);
  if (!meta?.courierFlow) {
    throw new AppError("Only cancelled delivery requests can be removed", 400);
  }
  if (toFrontendStatus(job.status, meta) !== "CANCELLED") {
    throw new AppError("Only cancelled requests can be removed", 400);
  }
  const source = String(meta.cancellationSource || "");
  if (!["customer_cancel", "customer_changed_provider", "customer_changed_delivery_option"].includes(source)) {
    throw new AppError("Only customer-cancelled delivery requests can be removed", 400);
  }
  if (String(job.providerId || "") !== String(actorUserId)) {
    throw new AppError("Forbidden", 403);
  }
  await mutateJobMeta(jobId, (m) => ({
    ...m,
    dismissedFromProviderInbox: [
      ...new Set([
        ...(Array.isArray(m.dismissedFromProviderInbox)
          ? m.dismissedFromProviderInbox.map((id) => String(id))
          : []),
        String(actorUserId),
      ]),
    ],
  }));
  return { id: jobId, dismissed: true };
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

async function addUserMaterialSuggestion(jobId, suggested, message, actorUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertCustomerOwnsJob(job, actorUserId);
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
  const enriched = await finalizeJob(job, meta);
  if (job.providerId) {
    await notificationEvents.notifyMaterialSuggestionReceived(
      job.providerId,
      jobId,
      suggestion.id,
      job.title
    );
  }
  return enriched;
}

async function acceptUserSuggestion(jobId, suggestionId, actorUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertProviderOwnsJob(job, actorUserId);
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
  const enriched = await finalizeJob(job, meta);
  await notificationEvents.notifyMaterialSuggestionResolved(
    job.customerId,
    jobId,
    suggestionId,
    "accepted",
    job.title
  );
  return enriched;
}

async function rejectUserSuggestion(jobId, suggestionId, actorUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertProviderOwnsJob(job, actorUserId);
  await assertJobCategoryAllowsMaterials(job);
  const meta = await mutateJobMeta(jobId, (m) => ({
    ...m,
    userMaterialSuggestions: m.userMaterialSuggestions.map((s) =>
      s.id === suggestionId ? { ...s, status: "rejected", withdrawnAfterAccept: false } : s
    ),
  }));
  const enriched = await finalizeJob(job, meta);
  await notificationEvents.notifyMaterialSuggestionResolved(
    job.customerId,
    jobId,
    suggestionId,
    "rejected",
    job.title
  );
  return enriched;
}

async function addProviderMaterialSuggestion(jobId, suggested, message, actorUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertProviderOwnsJob(job, actorUserId);
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
  const enriched = await finalizeJob(job, meta);
  await notificationEvents.notifyProviderSuggestion(job.customerId, jobId, suggestion.id, job.title);
  return enriched;
}

async function acceptProviderSuggestion(jobId, suggestionId, actorUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertCustomerOwnsJob(job, actorUserId);
  await assertJobCategoryAllowsMaterials(job);
  const meta = await mutateJobMeta(jobId, (m) => ({
    ...m,
    providerSuggestions: m.providerSuggestions.map((s) =>
      s.id === suggestionId ? { ...s, status: "accepted" } : s
    ),
  }));
  const enriched = await finalizeJob(job, meta);
  if (job.providerId) {
    await notificationEvents.notifyMaterialSuggestionResolved(
      job.providerId,
      jobId,
      suggestionId,
      "accepted",
      job.title
    );
  }
  return enriched;
}

async function rejectProviderSuggestion(jobId, suggestionId, actorUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertCustomerOwnsJob(job, actorUserId);
  await assertJobCategoryAllowsMaterials(job);
  const meta = await mutateJobMeta(jobId, (m) => ({
    ...m,
    providerSuggestions: m.providerSuggestions.map((s) =>
      s.id === suggestionId ? { ...s, status: "rejected" } : s
    ),
  }));
  const enriched = await finalizeJob(job, meta);
  if (job.providerId) {
    await notificationEvents.notifyMaterialSuggestionResolved(
      job.providerId,
      jobId,
      suggestionId,
      "rejected",
      job.title
    );
  }
  return enriched;
}

async function proposeNewLaborPrice(jobId, amount, reason, actorUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertProviderOwnsJob(job, actorUserId);
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

async function acceptProposedPrice(jobId, actorUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertCustomerOwnsJob(job, actorUserId);
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
  const { isLaborPaid } = cancellationPolicy;
  const policy = await cancellationPolicy.resolveJobCancellationPolicy(
    job,
    preMeta,
    actorUserId,
    actorRole
  );

  const laborPaidFlag = isLaborPaid(job, preMeta);
  if (
    laborPaidFlag &&
    !policy.opensDisputeReview &&
    !policy.customerForfeits &&
    policy.refundKind !== "forfeit_customer_en_route"
  ) {
    throw new AppError(
      "Paid jobs must be reviewed through a dispute before any refund is processed",
      400
    );
  }

  if (policy.opensDisputeReview) {
    const jobDisputeService = require("./jobDispute.service");
    const dispute = await jobDisputeService.openDisputeFromCancellation(jobId, actorUserId, {
      reason,
      details,
      actorRole: policy.cancelledBy,
    });
    const meta = await getJobMeta(jobId);
    const finalized = await finalizeJob(job, meta);
    return {
      job: finalized,
      refundAmount: 0,
      cancelledBy: policy.cancelledBy,
      providerEnRoute: policy.providerEnRoute,
      customerForfeits: false,
      refundKind: policy.refundKind,
      disputeOpened: true,
      disputeId: dispute.id,
    };
  }

  const originalPaymentRef = preMeta?.servicePayment?.paymentRef || preMeta?.servicePayment?.reference || null;
  const providerRow = job.providerId
    ? await prisma.provider.findUnique({ where: { userId: job.providerId }, select: { id: true } })
    : null;

  const expectedRefund =
    policy.refundAmount != null
      ? Number(policy.refundAmount) || 0
      : paymentService.computeCancelRefundAmount(job, { courierFlow: Boolean(preMeta?.courierFlow) });
  let refundStatusForMeta = "recorded";
  const laborPaidForRefund = isLaborPaid(job, preMeta);
  if (expectedRefund > 0 && laborPaidForRefund) {
    const { attemptGatewayRefundFirst } = require("./providerRefundClawback.service");
    const gatewayPreflight = await attemptGatewayRefundFirst(jobId, expectedRefund);
    if (gatewayPreflight.failed) {
      const reason = gatewayPreflight.result?.error || gatewayPreflight.result?.reason || "unknown";
      throw new AppError(`Gateway refund failed: ${reason}`, 502);
    }
    if (gatewayPreflight.manualOnly) {
      refundStatusForMeta = "pending_manual_gateway";
    } else if (gatewayPreflight.result?.ok) {
      refundStatusForMeta = "processed";
    }
  }

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
        courierFlow: Boolean(preMeta?.courierFlow),
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
                status: refundStatusForMeta,
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

  if (Number(refundAmount) > 0 && providerRow) {
    const providerTrustScore = require("./providerTrustScore.service");
    await providerTrustScore.onRefundResolved(providerRow.id, "PARTIAL_REFUND");
  }

  await notificationEvents.notifyJobCancelled(job.customerId, jobId, job.title, "customer");
  if (job.providerId) {
    await notificationEvents.notifyJobCancelled(job.providerId, jobId, job.title, "provider");
  }
  if (Number(refundAmount) > 0) {
    await notificationEvents.notifyCustomerRefundProcessed(job.customerId, jobId, refundAmount);
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

/**
 * Courier delivery jobs reach the "awaiting confirmation" step via the linked
 * delivery request's fulfillmentStatus (COMPLETED), which is not always mirrored
 * onto job.status. This lets the customer confirm receipt + rate the courier from
 * the job page once the courier has completed the delivery.
 */
async function isCourierDeliveryReadyForConfirmation(job, meta) {
  if (!meta?.courierFlow) return false;
  const dr = await prisma.deliveryRequest.findFirst({
    where: { jobId: String(job.id) },
    orderBy: { createdAt: "desc" },
  });
  if (!dr) return false;
  const fs = String(dr.fulfillmentStatus || "").toUpperCase();
  const status = String(dr.status || "").toLowerCase();
  return fs === "COMPLETED" || status === "completed";
}

async function confirmJobCompletion(jobId, rating, review, customerUserId, options = {}) {
  const images = Array.isArray(options.images) ? options.images.map(String) : [];
  const videos = Array.isArray(options.videos) ? options.videos.map(String) : [];
  const autoCompleted = Boolean(options.autoCompleted);
  const jobCompletionEvidence = require("./jobCompletionEvidence.service");
  const providerTrustScore = require("./providerTrustScore.service");

  jobCompletionEvidence.assertMediaLimits(images, videos);
  if (!autoCompleted) {
    jobCompletionEvidence.assertMinimumMedia(images, videos);
  }

  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  if (String(job.customerId) !== String(customerUserId) && !autoCompleted) {
    throw new AppError("Only the customer can confirm job completion", 403);
  }

  const metaBefore = await getJobMeta(jobId);
  const { toFrontendStatus } = require("./jobMeta.service");
  const currentStatus = toFrontendStatus(job.status, metaBefore);
  if (currentStatus === "DISPUTED") {
    throw new AppError("Cannot confirm completion while dispute is open", 400);
  }
  if (!autoCompleted && currentStatus !== "AWAITING_CONFIRMATION" && currentStatus !== "COMPLETED") {
    // Courier delivery jobs surface "awaiting confirmation" via the linked delivery
    // request's fulfillmentStatus, which is not always mirrored onto job.status.
    // Allow the customer to confirm once the courier has completed the delivery.
    const courierReady = await isCourierDeliveryReadyForConfirmation(job, metaBefore);
    if (!courierReady) {
      throw new AppError("Job is not awaiting confirmation", 400);
    }
  }

  const r = Number(rating);
  if (!autoCompleted && (!Number.isFinite(r) || r < 1 || r > 5)) {
    throw new AppError("rating must be between 1 and 5", 400);
  }

  const roundedRating = autoCompleted ? null : normalizeRating(r);

  const existingReview = await prisma.providerReview.findUnique({ where: { jobId } });
  const isDisputeResolution =
    existingReview &&
    existingReview.rating === 0 &&
    Boolean(existingReview.wasDisputed);
  if (existingReview && !autoCompleted && !isDisputeResolution) {
    const ageMs = Date.now() - existingReview.createdAt.getTime();
    if (ageMs > 10 * 60 * 1000) {
      throw new AppError("Review can only be edited within 10 minutes of submission", 400);
    }
  }

  const providerRow = job.providerId
    ? await prisma.provider.findUnique({ where: { userId: job.providerId }, select: { id: true } })
    : null;

  const paymentReleasedAt = new Date();
  const preservedDisputeImages =
    isDisputeResolution && existingReview
      ? (existingReview.disputeImages?.length
          ? existingReview.disputeImages
          : existingReview.images) || []
      : [];
  const preservedDisputeVideos =
    isDisputeResolution && existingReview
      ? (existingReview.disputeVideos?.length
          ? existingReview.disputeVideos
          : existingReview.videos) || []
      : [];

  const { updated, wasAlreadySettled, stagedPayouts } = await prisma.$transaction(
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
      const alreadySettledBefore = Boolean(j0.escrowSecondReleaseDone && j0.paymentReleased);
      const meta0 = await mutateJobMetaInTransaction(tx, jobId, (m) => {
        let patched = {
          ...m,
          completionConfirmedByUser: true,
          userRating: roundedRating,
          userReview: review,
          confirmationDeadlineAt: null,
        };
        if (autoCompleted) {
          patched = appendTimelineEventIfAbsent(patched, {
            type: "AUTO_ACCEPTED",
            at: paymentReleasedAt.toISOString(),
            source: "completion_deadline_cron",
          });
        }
        return withStatusAndProgress(patched, "COMPLETED", updated0);
      });
      if (job.providerId) {
        await jobCompletionEvidence.createEvidenceInTransaction(tx, {
          jobId,
          customerId: job.customerId,
          providerId: job.providerId,
          rating: roundedRating,
          review,
          images,
          videos,
          jobCategory: job.category,
          autoCompleted,
          paymentReleasedAt,
        });
      }
      if (providerRow && roundedRating != null) {
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
            images: Array.isArray(images) ? images.map(String) : [],
            videos: Array.isArray(videos) ? videos.map(String) : [],
            disputeImages: isDisputeResolution ? preservedDisputeImages.map(String) : [],
            disputeVideos: isDisputeResolution ? preservedDisputeVideos.map(String) : [],
            wasDisputed: Boolean(isDisputeResolution),
            resolvedAfterDispute: Boolean(isDisputeResolution),
          },
          update: {
            rating: roundedRating,
            comment: trimmedComment,
            images: Array.isArray(images) ? images.map(String) : [],
            videos: Array.isArray(videos) ? videos.map(String) : [],
            disputeImages: isDisputeResolution
              ? preservedDisputeImages.map(String)
              : existingReview?.disputeImages || [],
            disputeVideos: isDisputeResolution
              ? preservedDisputeVideos.map(String)
              : existingReview?.disputeVideos || [],
            wasDisputed: Boolean(isDisputeResolution || existingReview?.wasDisputed),
            resolvedAfterDispute: Boolean(isDisputeResolution),
          },
        });
      }
      if (providerRow) {
        const alreadySettled = Boolean(j0.escrowSecondReleaseDone && j0.paymentReleased);
        let stagedPayouts = [];
        if (!alreadySettled) {
          const releaseResult = await paymentService.runSecondTrancheInTransaction(tx, {
            job: j0,
            providerProfileId: providerRow.id,
            jobId,
          });
          stagedPayouts = releaseResult?.stagedPayouts || [];
          const escrowSettlement = require("./payments/escrowSettlement.service");
          await escrowSettlement.markLaborEscrowFullyReleased(jobId, tx);
        }
        return { updated: updated0, meta: meta0, wasAlreadySettled: alreadySettledBefore, stagedPayouts };
      }
      return { updated: updated0, meta: meta0, wasAlreadySettled: alreadySettledBefore, stagedPayouts: [] };
    },
    {
      maxWait: 5000,
      timeout: 20000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );

  if (stagedPayouts?.length) {
    try {
      const refundRecovery = require("./refundRecovery.service");
      await refundRecovery.processStagedCustomerPayouts(stagedPayouts);
    } catch (e) {
      console.error("[job] staged refund payout failed", e?.message || e);
    }
  }

  if (!autoCompleted) {
    await logAudit(AUDIT_ACTIONS.REVIEW_UPSERT, {
      userId: job.customerId,
      entityType: ENTITY_TYPES.JOB,
      entityId: jobId,
      newValue: { rating: roundedRating },
    });
  }

  if (job.providerId) {
    const pRow2 = await prisma.provider.findUnique({
      where: { userId: job.providerId },
      select: { id: true },
    });
    if (pRow2) {
      if (roundedRating != null) {
        const { syncProviderAggregateRating } = require("./providerAggregateRating.service");
        await syncProviderAggregateRating(pRow2.id);
        await providerTrustScore.onJobCompleted(pRow2.id, roundedRating);
      } else if (autoCompleted) {
        await providerTrustScore.onJobCompleted(pRow2.id, 3);
      }
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
    if (!wasAlreadySettled) {
      await notificationEvents.notifyJobCompleted(job.providerId, jobId, job.title);
      await notificationEvents.notifyPaymentReleased(job.providerId, jobId, job.title);
    }
  }

  const finalMeta = await getJobMeta(jobId);
  return await finalizeJob(updated, finalMeta);
}

async function autoCompleteJobAfterDeadline(jobId) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return null;
  if (job.escrowSecondReleaseDone) return null;
  const meta = await getJobMeta(jobId);
  const { toFrontendStatus } = require("./jobMeta.service");
  if (toFrontendStatus(job.status, meta) !== "AWAITING_CONFIRMATION") return null;
  const existing = await prisma.jobCompletionEvidence.findUnique({ where: { jobId } });
  if (existing) return null;
  const existingDispute = await prisma.jobDispute.findFirst({
    where: { jobId, status: { in: ["OPEN", "UNDER_INVESTIGATION"] } },
  });
  if (existingDispute) return null;

  const result = await confirmJobCompletion(jobId, null, null, job.customerId, {
    images: [],
    videos: [],
    autoCompleted: true,
  });

  if (!result) return null;

  await logAudit(AUDIT_ACTIONS.JOB_AUTO_ACCEPTED, {
    actorType: "SYSTEM",
    entityType: ENTITY_TYPES.JOB,
    entityId: jobId,
    newValue: {
      customerId: job.customerId,
      providerId: job.providerId,
      confirmationDeadlineAt: meta.confirmationDeadlineAt,
      escrowSecondReleaseDone: true,
    },
  });

  if (job.customerId) {
    await notificationEvents.notifyUser(job.customerId, {
      type: "job_completed",
      title: "Job auto-completed",
      message: `The confirmation window expired. "${job.title || "Your job"}" was marked complete and payment released.`,
      jobId,
      dedupeKey: notificationEvents.jobDedupe(jobId, "job_auto_completed_customer"),
    });
  }
  return result;
}

function ensureStoreOrder(meta, storeId, fallback) {
  const idx = meta.storeOrders.findIndex((order) => String(order.storeId) === String(storeId));
  if (idx >= 0) return { index: idx, order: meta.storeOrders[idx] };
  const reuseOrderId =
    fallback && fallback.orderId ? String(fallback.orderId).trim() : "";
  const created = {
    storeId: String(storeId),
    orderId: reuseOrderId || randomUUID(),
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

async function setStoreDeliveryOption(jobId, storeId, params, customerUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertCustomerOwnsJob(job, customerUserId);
  await assertJobCategoryAllowsMaterials(job);
  const wantOrderId = params.orderId ? String(params.orderId).trim() : "";
  let resolvedStoreOrderId = wantOrderId || "";
  let courierUserId = null;
  let resolvedStoreOrderBranchId = null;
  const storeIdIsBranch = Boolean(
    await prisma.branch.findUnique({ where: { id: String(storeId) }, select: { id: true } })
  );
  let resolvedCourierUserId = null;
  if (params.deliveryType === "PROVIDER" && params.deliveryProviderId) {
    const materialOrderService = require("./materialOrder.service");
    resolvedCourierUserId = await materialOrderService.resolveCourierUserId(params.deliveryProviderId);
    if (!resolvedCourierUserId) {
      throw new AppError("Delivery provider not found", 400);
    }
  }

  let existingMaterialOrderId = wantOrderId || "";
  if (!existingMaterialOrderId) {
    const openMo = await prisma.materialOrder.findFirst({
      where: {
        jobId: String(jobId),
        branchId: String(storeId),
        source: "job_materials",
        fulfillmentStatus: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (openMo) existingMaterialOrderId = String(openMo.id);
  }

  const metaBefore = await getJobMeta(jobId);
  let storeOrderBefore = null;
  if (wantOrderId && Array.isArray(metaBefore?.storeOrders)) {
    storeOrderBefore = metaBefore.storeOrders.find(
      (o) => String(o.orderId) === wantOrderId && String(o.storeId) === String(storeId)
    );
  }
  if (!storeOrderBefore && Array.isArray(metaBefore?.storeOrders)) {
    const forStore = metaBefore.storeOrders.filter((o) => String(o.storeId) === String(storeId));
    storeOrderBefore =
      forStore.filter((o) => !o.payment?.materialsPaid).pop() ||
      forStore[forStore.length - 1];
  }
  const prevDeliveryType = storeOrderBefore?.deliveryType || null;
  const prevMaterialOrderId = String(
    storeOrderBefore?.orderId || existingMaterialOrderId || ""
  ).trim();

  const materialOrderService = require("./materialOrder.service");
  if (
    prevDeliveryType === "PROVIDER" &&
    params.deliveryType !== prevDeliveryType &&
    prevMaterialOrderId
  ) {
    await materialOrderService.assertCourierNotCollectingForMaterialOrder(prevMaterialOrderId);
  }

  const meta = await mutateJobMeta(jobId, (m) => {
    const materialForStore = Array.isArray(job.materials)
      ? job.materials.find(
          (x) => String(x.supplierId) === String(storeId) || String(x.branchId) === String(storeId)
        )
      : null;
    const fallbackStoreName = materialForStore?.supplierName || "Store";
    let order;
    if (wantOrderId && Array.isArray(m.storeOrders)) {
      const idx = m.storeOrders.findIndex(
        (o) => String(o.orderId) === wantOrderId && String(o.storeId) === String(storeId)
      );
      if (idx >= 0) order = m.storeOrders[idx];
    }
    if (!order && Array.isArray(m.storeOrders)) {
      const forStore = m.storeOrders.filter((o) => String(o.storeId) === String(storeId));
      order =
        forStore.filter((o) => !o.payment?.materialsPaid).pop() ||
        forStore[forStore.length - 1];
    }
    if (!order) {
      const found = ensureStoreOrder(m, storeId, {
        storeName: fallbackStoreName,
        orderId: existingMaterialOrderId || undefined,
        items: materialForStore
          ? [
              {
                productId: materialForStore.productId,
                name: materialForStore.name,
                qty: materialForStore.qty,
                unitPrice: materialForStore.unitPrice,
                qualityTier: materialForStore.qualityTier,
                imageUrl: materialForStore.imageUrl,
              },
            ]
          : undefined,
      });
      order = found.order;
    }
    if (!order.branchId && materialForStore?.branchId) {
      order.branchId = String(materialForStore.branchId);
    } else if (!order.branchId && storeIdIsBranch) {
      order.branchId = String(storeId);
    }
    order.deliveryType = params.deliveryType;
    order.deliveryFee = coerceNumber(params.deliveryFee);
    order.deliveryProviderId = resolvedCourierUserId || params.deliveryProviderId || undefined;
    order.deliveryStatus = params.deliveryType === "SELF" ? "SelfCollect" : "PendingApproval";
    order.delivery = {
      type: params.deliveryType,
      status: order.deliveryStatus,
      providerId: resolvedCourierUserId || params.deliveryProviderId || undefined,
      fee: order.deliveryFee,
    };
    order.payment = order.payment || { materialsPaid: false, deliveryPaid: false };
    resolvedStoreOrderId = String(order.orderId || resolvedStoreOrderId || "");
    resolvedStoreOrderBranchId = order.branchId ? String(order.branchId).trim() : null;
    if (params.deliveryType === "PROVIDER" && resolvedCourierUserId) {
      courierUserId = resolvedCourierUserId;
    }
    return m;
  });
  const enriched = await finalizeJob(job, meta);
  if (job.customerId) {
    await notificationEvents.notifyDeliveryUpdate(job.customerId, jobId, job.title, "Delivery option updated");
  }
  if (courierUserId && resolvedStoreOrderId) {
    const materialOrderService = require("./materialOrder.service");
    const materialsLines = Array.isArray(job.materials)
      ? job.materials.filter(
          (m) =>
            String(m.supplierId) === String(storeId) ||
            String(m.branchId) === String(storeId) ||
            (resolvedStoreOrderBranchId && String(m.branchId) === resolvedStoreOrderBranchId)
        )
      : [];
    const storeOrder =
      Array.isArray(meta.storeOrders) &&
      meta.storeOrders.find((o) => String(o.orderId) === String(resolvedStoreOrderId));
    const linesFromOrder =
      storeOrder && Array.isArray(storeOrder.items) && storeOrder.items.length > 0
        ? storeOrder.items.map((item) => ({
            supplierId: String(storeId),
            branchId: resolvedStoreOrderBranchId || storeOrder.branchId,
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
      storeOrderBranchId: resolvedStoreOrderBranchId,
      customerUserId: job.customerId,
      jobProviderUserId: job.providerId,
      courierUserId,
      materialsLines: linesFromOrder,
      jobSiteAddress: jobSiteAddressFromRow(job),
      jobSiteLocation: jobSiteLocationFromRow(job),
    });

    const moRow = await prisma.materialOrder.findUnique({
      where: { id: resolvedStoreOrderId },
      select: { payload: true },
    });
    const moPayload = moRow?.payload && typeof moRow.payload === "object" ? moRow.payload : {};
    let collectionPoint =
      moPayload.collectionPoint ||
      (moPayload.materialBatch?.pickupAddress
        ? { address: String(moPayload.materialBatch.pickupAddress), label: "Collection point" }
        : null);
    let destinationPoint =
      moPayload.destinationPoint ||
      (moPayload.materialBatch?.deliveryAddress
        ? { address: String(moPayload.materialBatch.deliveryAddress), label: "Delivery destination" }
        : null);
    if (!collectionPoint?.address || !destinationPoint?.address) {
      const geo = await materialOrderService.resolveCourierDeliveryGeoPoints({
        storeOrderBranchId: resolvedStoreOrderBranchId || storeId,
        supplierBranchId: storeId,
        materialsLines: linesFromOrder,
        jobProviderUserId: job.providerId,
        jobSiteAddress: jobSiteAddressFromRow(job),
        jobSiteLocation: jobSiteLocationFromRow(job),
      });
      if (geo) {
        if (!collectionPoint?.address) collectionPoint = geo.collectionPoint;
        if (!destinationPoint?.address) destinationPoint = geo.destinationPoint;
      }
    }
    const moItems = Array.isArray(moPayload.items) ? moPayload.items : linesFromOrder;
    const jobSite = jobSiteLocationFromRow(job);
    const jobSiteAddr = jobSiteAddressFromRow(job);

    if (!collectionPoint?.address) {
      throw new AppError(
        "Store pickup address is required before courier delivery can be arranged. Please ask the supplier to update their branch address.",
        400
      );
    }
    const deliveryRequestService = require("./deliveryRequest.service");
    const { courierJobId } = await deliveryRequestService.ensureMaterialCourierJobRequest({
      parentJobId: jobId,
      materialOrderId: resolvedStoreOrderId,
      courierUserId,
      customerUserId: job.customerId,
      collectionPoint,
      destinationPoint: destinationPoint?.address
        ? destinationPoint
        : {
            address: jobSiteAddr,
            ...(jobSite || {}),
          },
      items: moItems,
      storeName: storeOrder?.storeName || fallbackStoreNameFromJob(job, storeId),
      parentJobTitle: job.title,
    });

    if (courierJobId) {
      await mutateJobMeta(jobId, (m) => {
        const list = Array.isArray(m.storeOrders) ? m.storeOrders : [];
        const idx = list.findIndex((o) => String(o.orderId) === String(resolvedStoreOrderId));
        if (idx >= 0) {
          list[idx] = { ...list[idx], courierJobId: String(courierJobId) };
          m.storeOrders = list;
        }
        return m;
      });
    }
  }

  const moSyncId = String(resolvedStoreOrderId || prevMaterialOrderId || "").trim();
  if (moSyncId && prevDeliveryType !== params.deliveryType) {
    const moRow = await prisma.materialOrder.findUnique({ where: { id: moSyncId } });
    if (moRow) {
      if (prevDeliveryType === "PROVIDER" && params.deliveryType !== "PROVIDER") {
        await materialOrderService.updateMaterialOrderDelivery(moSyncId, {
          type: params.deliveryType,
          status: params.deliveryType === "SELF" ? "SelfCollect" : "PendingApproval",
          fee: coerceNumber(params.deliveryFee),
        });
      } else if (params.deliveryType !== "PROVIDER") {
        await materialOrderService.updateMaterialOrderDelivery(moSyncId, {
          type: params.deliveryType,
          status: params.deliveryType === "SELF" ? "SelfCollect" : "PendingApproval",
          fee: coerceNumber(params.deliveryFee),
        });
      }
      const refreshedJob = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
      const refreshedMeta = await getJobMeta(jobId);
      return await finalizeJob(refreshedJob, refreshedMeta);
    }
    if (prevDeliveryType === "PROVIDER" && params.deliveryType !== "PROVIDER") {
      const deliveryRequestService = require("./deliveryRequest.service");
      await deliveryRequestService.cancelCourierDeliveryForCustomer({
        materialOrderId: moSyncId || undefined,
        courierJobId: storeOrderBefore?.courierJobId || undefined,
        source: "customer_changed_delivery_option",
      });
      if (storeOrderBefore?.courierJobId) {
        await mutateJobMeta(jobId, (m) => {
          const list = Array.isArray(m.storeOrders) ? [...m.storeOrders] : [];
          const idx = list.findIndex((o) => String(o.orderId) === moSyncId);
          if (idx >= 0) {
            const next = { ...list[idx] };
            delete next.courierJobId;
            list[idx] = next;
            m.storeOrders = list;
          }
          return m;
        });
      }
      const refreshedJob = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
      const refreshedMeta = await getJobMeta(jobId);
      return await finalizeJob(refreshedJob, refreshedMeta);
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

async function approveStoreDeliveryRequest(jobId, storeId, customerUserId) {
  return updateStoreOrderDelivery(jobId, storeId, { status: "Approved" }, customerUserId);
}

async function updateStoreOrderDeliveryStatus(jobId, storeId, status, customerUserId) {
  return updateStoreOrderDelivery(jobId, storeId, { status }, customerUserId);
}

async function updateStoreOrderDelivery(jobId, storeId, updates, customerUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertCustomerOwnsJob(job, customerUserId);
  await assertJobCategoryAllowsMaterials(job);
  const metaBefore = await getJobMeta(jobId);
  const storeOrderBefore = Array.isArray(metaBefore.storeOrders)
    ? metaBefore.storeOrders.find((o) => String(o.storeId) === String(storeId))
    : null;
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

  const materialOrderId = storeOrderBefore?.orderId ? String(storeOrderBefore.orderId) : "";
  const courierJobId = storeOrderBefore?.courierJobId ? String(storeOrderBefore.courierJobId) : "";
  const prevProviderId = storeOrderBefore?.deliveryProviderId;
  const isCancelled = updates.status === "Cancelled";
  const providerChanged =
    updates.providerId !== undefined &&
    prevProviderId &&
    String(updates.providerId) !== String(prevProviderId);
  const isProviderDelivery =
    storeOrderBefore?.deliveryType === "PROVIDER" || updates.type === "PROVIDER";

  if (materialOrderId && (isCancelled || (providerChanged && isProviderDelivery))) {
    try {
      const deliveryRequestService = require("./deliveryRequest.service");
      if (isCancelled) {
        await deliveryRequestService.cancelCourierDeliveryForCustomer({
          materialOrderId,
          courierJobId: courierJobId || undefined,
          source: "customer_cancel",
        });
      } else {
        await deliveryRequestService.cancelCourierDeliveryForCustomer({
          materialOrderId,
          courierJobId: courierJobId || undefined,
          source: "customer_changed_provider",
          resetDeliveryRequest: true,
        });
      }
    } catch (e) {
      console.error("updateStoreOrderDelivery cancelCourier", jobId, storeId, e);
    }
  }

  return enriched;
}

async function approveStoreOrderDelivery(jobId, storeId, customerUserId) {
  return updateStoreOrderDelivery(jobId, storeId, { status: "Approved" }, customerUserId);
}

async function rejectStoreOrderDelivery(jobId, storeId, customerUserId) {
  return updateStoreOrderDelivery(jobId, storeId, { status: "Rejected" }, customerUserId);
}

async function payStoreOrderDelivery(jobId, storeId, cardLast4, fee, customerUserId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertCustomerOwnsJob(job, customerUserId);
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
      "The customer paid for delivery.",
      "delivery"
    );
  }
  return enriched;
}

async function payForStoreMaterials(jobId, supplierId, cardLast4, options = {}, customerUserId) {
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
  assertCustomerOwnsJob(job, customerUserId);
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
      if (!isTerminalJobState(m, job)) {
        const nextOverride = resolveMaterialPaymentStatusOverride(m, job, allPaidLegacy);
        m.statusOverride = nextOverride;
        if (nextOverride === "IN_PROGRESS") {
          m.hasStarted = true;
        }
      }
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
        "The customer paid for materials.",
        "materials"
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
    if (!isTerminalJobState(m, job)) {
      const nextOverride = resolveMaterialPaymentStatusOverride(m, job, allPaid);
      m.statusOverride = nextOverride;
      if (nextOverride === "IN_PROGRESS") {
        m.hasStarted = true;
      }
    }
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
      "The customer paid for materials.",
      "materials"
    );
  }
  return enriched;
}

async function releaseEscrowPayment(jobId, amount, idempotencyKey, requestHash, route, actingUserId, actorRole) {
  if (String(actorRole || "").toUpperCase() !== "ADMIN") {
    throw new AppError("Forbidden", 403);
  }
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  if (job.paymentReleased || (paymentService.isEscrowV2Job(job) && job.isFullyReleased)) {
    throw new AppError("Already released", 400);
  }
  if (!job.providerId) {
    throw new AppError("Job has no provider", 400);
  }

  const jobMeta = normalizeMeta(job.meta);
  if (jobMeta.statusOverride === "DISPUTED" || jobMeta.escrowFrozen === true) {
    throw new AppError("Escrow is frozen while a dispute is open", 400);
  }
  if (jobMeta.courierFlow && jobMeta.completionConfirmedByUser !== true) {
    throw new AppError(
      "Courier delivery funds can only be released after the customer confirms delivery",
      400
    );
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
  await logAudit(AUDIT_ACTIONS.PAYMENT_RELEASE_ESCROW, {
    userId: actingUserId != null ? String(actingUserId) : null,
    entityType: ENTITY_TYPES.JOB,
    entityId: jobId,
    newValue: { jobId, amount: release, providerId: providerRow.id },
  });
  await notificationEvents.notifyAdminEscrowReleased(job.providerId, jobId, job.title, release);

  return finalizeJob(jobRow, meta);
}

async function getLaborInvoiceByJobId(jobId, actorUserId, actorRole) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertActorCanAccessJob(job, actorUserId, actorRole);
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

async function createLaborInvoice(jobId, userId, laborAmount, cardLast4, actorUserId, actorRole) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  assertActorCanAccessJob(job, actorUserId, actorRole);
  const amount = coerceNumber(laborAmount, 0);
  const now = new Date().toISOString();
  return {
    id: `INV-LAB-${String(jobId).slice(-6)}-${Date.now()}`,
    jobId,
    userId: String(actorUserId),
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
  reselectJobProvider,
  deleteRejectedRequestFromProviderView,
  getCancelledRequestsForProvider,
  deleteCancelledRequestFromProviderView,
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
  autoCompleteJobAfterDeadline,
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
