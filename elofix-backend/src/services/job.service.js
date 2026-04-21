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
const notificationEvents = require("./notificationEvents.service");
const { logAudit } = require("./auditLog.service");
const { idempotencyGate, idempotencyCommit } = require("../utils/idempotencyTransaction");

const jobInclude = {
  customer: {
    select: { id: true, name: true, email: true, role: true },
  },
  provider: {
    select: { id: true, name: true, email: true, role: true },
  },
};

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

function computeJobMatchScore(job, providerSkillsSet, providerLocation, providerRating) {
  let score = providerRating;

  const category = normalizeValue(job.category);
  const location = normalizeValue(job.location);

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
          ...(plumbingIssuePayload && typeof plumbingIssuePayload === "object"
            ? { plumbingIssue: plumbingIssuePayload }
            : {}),
        }
      : {}),
    ...(cameraAssistParsed ? { cameraAssist: cameraAssistParsed } : {}),
  };

  const { location: normalizedLocation, locationDetails } = parseLocation(location);
  const providerUserId = await resolveProviderUserId(selectedProviderId);

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
        providerRating
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

async function getJobs() {
  const jobs = await prisma.job.findMany({
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

async function finalizeJob(job, meta) {
  const base = enrichJob(job, meta);
  const slug = String(base.category || "").trim();
  let requiresInspection = true;
  if (slug) {
    try {
      const cat = await prisma.category.findUnique({
        where: { id: slug },
        select: { requiresInspection: true },
      });
      if (cat && typeof cat.requiresInspection === "boolean") {
        requiresInspection = cat.requiresInspection;
      }
    } catch {
      requiresInspection = true;
    }
  }
  return { ...base, requiresInspection };
}

async function updateJobStatus(jobId, status) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
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

async function deleteJob(jobId) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError("Job not found", 404);
  await prisma.job.delete({ where: { id: jobId } });
  return { id: jobId };
}

async function addMaterials(jobId, newMaterials = []) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
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

async function submitServicePrice(jobId, amount, note) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
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
  const existingMeta = await getJobMeta(jobId);
  if (existingMeta.laborPaid) {
    throw new AppError("Labor already paid", 400);
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

  const amount = existingMeta.servicePrice?.amount || Number(job.price) || 0;
  if (amount <= 0) {
    throw new AppError("Invalid labor amount", 400);
  }

  const paymentRef = `LAB-${String(jobId).slice(-6)}-${Date.now()}`;
  const paidAt = new Date().toISOString();

  const txResult = await prisma.$transaction(
    async (tx) => {
      const gate = await idempotencyGate(tx, { idempotencyKey, requestHash, route });
      if (gate.replay) {
        return { replay: true };
      }

      const meta = await mutateJobMetaInTransaction(tx, jobId, (m) => ({
        ...m,
        laborPaid: true,
        servicePayment: {
          status: "paid",
          amount,
          paidAt,
          paymentRef,
          paidBy: userId,
          maskedPaymentMethod: `**** **** **** ${cardLast4 || "****"}`,
        },
        escrow: {
          heldAmount: amount,
          releasedAmount: Number(m.escrow?.releasedAmount) || 0,
        },
        statusOverride: "SERVICE_PAID",
      }));

      let jobRow = job;
      if (job.status === "ACCEPTED") {
        jobRow = await tx.job.update({
          where: { id: jobId },
          data: { status: "IN_PROGRESS", laborPaid: true },
          include: jobInclude,
        });
      } else {
        jobRow = await tx.job.update({
          where: { id: jobId },
          data: { laborPaid: true },
          include: jobInclude,
        });
      }

      await earningService.createLaborCreditPending(tx, {
        providerId: providerRow.id,
        jobId,
        amount,
        idempotencyKey,
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

async function submitMaterials(jobId, materials) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const nextMaterials = Array.isArray(materials) ? materials : [];
  const updated = await prisma.job.update({
    where: { id: jobId },
    data: { materials: nextMaterials },
    include: jobInclude,
  });
  const meta = await mutateJobMeta(jobId, (m) => ({ ...m, statusOverride: "MATERIALS_SUBMITTED" }));
  return await finalizeJob(updated, meta);
}

async function rejectJobByProvider(jobId, reason, details) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const meta = await mutateJobMeta(jobId, (m) => ({
    ...m,
    statusOverride: "REJECTED",
    rejectionReason: reason || null,
    rejectionDetails: details || null,
    rejectedAt: new Date().toISOString(),
  }));
  return await finalizeJob(job, meta);
}

async function rejectJob(jobId, reason, details) {
  return rejectJobByProvider(jobId, reason, details);
}

async function deleteRejectedRequestFromProviderView(jobId) {
  const meta = await getJobMeta(jobId);
  if (meta.statusOverride !== "REJECTED") {
    throw new AppError("Only rejected requests can be removed", 400);
  }
  await prisma.job.delete({ where: { id: jobId } });
  return { id: jobId };
}

async function updateProviderRequirements(jobId, updates) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const payload = updates && typeof updates === "object" ? updates : {};
  const meta = await mutateJobMeta(jobId, (m) => ({
    ...m,
    providerAdjustedRequirements: {
      measurements: payload.measurements || undefined,
      requirementNotes: payload.requirementNotes || "",
    },
  }));
  return await finalizeJob(job, meta);
}

async function addUserMaterialSuggestion(jobId, suggested, message) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
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
  const meta = await mutateJobMeta(jobId, (m) => {
    const suggestions = m.userMaterialSuggestions.map((s) =>
      s.id === suggestionId ? { ...s, status: "accepted" } : s
    );
    const accepted = suggestions.find((s) => s.id === suggestionId);
    let storeOrders = m.storeOrders;
    if (accepted) {
      const storeId = accepted.suggested.supplierId;
      const existingOrder = storeOrders.find((o) => o.storeId === storeId && o.deliveryStatus !== "Delivered");
      if (existingOrder) {
        existingOrder.items.push({
          productId: accepted.suggested.productId,
          name: accepted.suggested.name,
          qty: accepted.suggested.qty,
          unitPrice: accepted.suggested.unitPrice,
          qualityTier: accepted.suggested.qualityTier,
          imageUrl: accepted.suggested.imageUrl,
        });
      } else {
        storeOrders = [
          ...storeOrders,
          {
            storeId,
            orderId: randomUUID(),
            sourceUserSuggestionId: suggestionId,
            items: [
              {
                productId: accepted.suggested.productId,
                name: accepted.suggested.name,
                qty: accepted.suggested.qty,
                unitPrice: accepted.suggested.unitPrice,
                qualityTier: accepted.suggested.qualityTier,
                imageUrl: accepted.suggested.imageUrl,
              },
            ],
            storeName: accepted.suggested.supplierName,
            deliveryType: "SELF",
            deliveryFee: 0,
            deliveryStatus: "SelfCollect",
            paymentStatus: "Paid",
            invoiceId: "",
            createdAt: new Date().toISOString(),
            payment: { materialsPaid: false, deliveryPaid: false },
          },
        ];
      }
    }
    return { ...m, userMaterialSuggestions: suggestions, storeOrders };
  });
  return await finalizeJob(job, meta);
}

async function rejectUserSuggestion(jobId, suggestionId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const meta = await mutateJobMeta(jobId, (m) => ({
    ...m,
    userMaterialSuggestions: m.userMaterialSuggestions.map((s) =>
      s.id === suggestionId ? { ...s, status: "rejected" } : s
    ),
  }));
  return await finalizeJob(job, meta);
}

async function addProviderMaterialSuggestion(jobId, suggested, message) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
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

async function cancelJob(jobId, reason, details) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const updated = await prisma.job.update({
    where: { id: jobId },
    data: { status: "CANCELLED" },
    include: jobInclude,
  });
  const meta = await mutateJobMeta(jobId, (m) => ({
    ...m,
    statusOverride: "CANCELLED",
    cancellationReason: reason || null,
    cancellationDetails: details || null,
    cancelledAt: new Date().toISOString(),
  }));
  const refundAmount = Number(updated.price) || 0;
  return { job: await finalizeJob(updated, meta), refundAmount };
}

async function confirmJobCompletion(jobId, rating, review) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const r = Number(rating);
  if (!Number.isFinite(r) || r < 1 || r > 5) {
    throw new AppError("rating must be between 1 and 5", 400);
  }

  const existingReview = await prisma.review.findUnique({ where: { jobId } });
  if (existingReview) {
    const ageMs = Date.now() - existingReview.createdAt.getTime();
    if (ageMs > 10 * 60 * 1000) {
      throw new AppError("Review can only be edited within 10 minutes of submission", 400);
    }
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: { status: "COMPLETED" },
    include: jobInclude,
  });
  const meta = await mutateJobMeta(jobId, (m) => ({
    ...m,
    statusOverride: "COMPLETED",
    completionConfirmedByUser: true,
    userRating: r,
    userReview: review,
  }));

  await prisma.review.upsert({
    where: { jobId },
    create: {
      id: randomUUID(),
      jobId,
      rating: Math.round(r),
      comment: review != null && String(review).trim() !== "" ? String(review).trim() : null,
    },
    update: {
      rating: Math.round(r),
      comment: review != null && String(review).trim() !== "" ? String(review).trim() : null,
    },
  });

  await logAudit("review.upsert", {
    userId: job.customerId,
    metadata: { jobId, rating: Math.round(r) },
  });

  if (job.providerId) {
    const providerRow = await prisma.provider.findUnique({
      where: { userId: job.providerId },
      select: { id: true },
    });
    if (providerRow) {
      const agg = await prisma.review.aggregate({
        where: { job: { providerId: job.providerId } },
        _avg: { rating: true },
      });
      const nextRating = agg._avg.rating != null ? Number(agg._avg.rating) : r;
      await prisma.provider.update({
        where: { id: providerRow.id },
        data: { rating: nextRating },
      });
    }
  }

  return await finalizeJob(updated, meta);
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
  const meta = await mutateJobMeta(jobId, (m) => {
    const fallbackStoreName =
      (Array.isArray(job.materials) ? job.materials.find((x) => String(x.supplierId) === String(storeId))?.supplierName : null) ||
      "Store";
    const { order } = ensureStoreOrder(m, storeId, { storeName: fallbackStoreName });
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
    return m;
  });
  const enriched = await finalizeJob(job, meta);
  if (job.customerId) {
    await notificationEvents.notifyDeliveryUpdate(job.customerId, jobId, job.title, "Delivery option updated");
  }
  return enriched;
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
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw new AppError("Job not found", 404);
  const materials = Array.isArray(job.materials)
    ? job.materials.filter((m) => String(m.supplierId) === String(supplierId))
    : [];
  const amount = materials.reduce((sum, item) => sum + coerceNumber(item.qty) * coerceNumber(item.unitPrice), 0);
  const paidAt = new Date().toISOString();
  const meta = await mutateJobMeta(jobId, (m) => {
    const payment = {
      orderId: options.orderId || randomUUID(),
      supplierId: String(supplierId),
      supplierName: materials[0]?.supplierName || "Store",
      amount,
      status: "paid",
      paidAt,
      deliveryProviderId: options.deliveryProviderId,
      deliveryFee: coerceNumber(options.deliveryFee, 0),
    };
    const idx = m.materialPayments.findIndex((p) => String(p.supplierId) === String(supplierId));
    if (idx >= 0) m.materialPayments[idx] = payment;
    else m.materialPayments.push(payment);

    const { order } = ensureStoreOrder(m, supplierId, {
      storeName: materials[0]?.supplierName || "Store",
      items: materials.map((item) => ({
        productId: item.productId,
        name: item.name,
        qty: item.qty,
        unitPrice: item.unitPrice,
        qualityTier: item.qualityTier,
        imageUrl: item.imageUrl,
      })),
      invoiceId: `INV-MAT-${String(jobId).slice(-6)}-${Date.now()}`,
    });
    order.items = materials.map((item) => ({
      productId: item.productId,
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice,
      qualityTier: item.qualityTier,
      imageUrl: item.imageUrl,
    }));
    order.deliveryType = options.deliveryType || order.deliveryType || "SELF";
    order.deliveryProviderId = options.deliveryProviderId || order.deliveryProviderId;
    order.deliveryFee = coerceNumber(options.deliveryFee, order.deliveryFee || 0);
    order.payment = { materialsPaid: true, deliveryPaid: Boolean(order.payment?.deliveryPaid) };
    order.deliveryStatus = order.deliveryType === "SELF" ? "SelfCollect" : "PendingApproval";
    order.delivery = {
      type: order.deliveryType,
      status: order.deliveryStatus,
      providerId: order.deliveryProviderId,
      fee: order.deliveryFee,
    };
    order.invoiceId = order.invoiceId || `INV-MAT-${String(jobId).slice(-6)}-${Date.now()}`;
    m.statusOverride = "MATERIALS_PAID";
    return m;
  });
  const enriched = await finalizeJob(job, meta);
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
  if (job.paymentReleased) {
    throw new AppError("Already released", 400);
  }
  const release = coerceNumber(amount, 0);
  if (release <= 0) throw new AppError("amount must be positive", 400);
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
        select: { meta: true, laborPaid: true, paymentReleased: true },
      });
      if (!row) {
        throw new AppError("Job not found", 404);
      }
      if (row.paymentReleased) {
        throw new AppError("Already released", 400);
      }
      const current = normalizeMeta(row.meta);
      const held = Number(current.escrow?.heldAmount) || 0;
      if (release > held) {
        throw new AppError("Release amount exceeds held escrow", 400);
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
      if (laborPaidFlag && heldAfter === 0) {
        jobRow = await tx.job.update({
          where: { id: jobId },
          data: { paymentReleased: true },
          include: jobInclude,
        });
      }

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

module.exports = {
  createJob,
  getMatchedJobsForProvider,
  acceptJob,
  getJobById,
  getJobs,
  deleteJob,
  addMaterials,
  removeMaterial,
  addJobNote,
  addChatMessage,
  submitServicePrice,
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
};
