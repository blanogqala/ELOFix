const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const notificationEvents = require("./notificationEvents.service");
const fraudDetection = require("./fraudDetection.service");
const providerTrustScore = require("./providerTrustScore.service");
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES, ACTOR_TYPES } = require("../constants/auditActions");
const { getTrustLevel } = require("../utils/trustLevel.util");
const { sha256File } = require("../utils/identityHash.util");
const fs = require("fs");
const { randomUUID } = require("crypto");
const { countJobsByStatus } = require("../utils/jobStatusCounts.util");
const {
  toApiFileUrl,
  registerUploadedFile,
  resolveExistingFileReference,
} = require("./fileStorage.service");
const { signDocumentFields } = require("./fileAccess.service");
const { scanUploadedFile } = require("./fileScan.service");
const { validateUploadedImageFile, unlinkQuietly } = require("../utils/uploadSecurity.util");

const { normalizeMeta } = require("./jobMeta.service");

const REQUIRED_DOCUMENT_TYPES = ["idDoc", "companyReg", "proofOfAddress"];
const OPTIONAL_DOCUMENT_TYPES = ["proofOfSkill", "certifications"];
const DOCUMENT_TYPES = [...REQUIRED_DOCUMENT_TYPES, ...OPTIONAL_DOCUMENT_TYPES];

function normalizeDocuments(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}

function hasDocUrl(doc) {
  return Boolean(doc && typeof doc.url === "string" && doc.url.trim().length > 0);
}

function hasDocApproved(doc) {
  return Boolean(doc && doc.status === "approved" && hasDocUrl(doc));
}

async function normalizeDocumentReference(ownerUserId, docType, doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return doc;

  const candidateUrl = typeof doc.url === "string" ? doc.url.trim() : "";
  const candidateFileId = typeof doc.fileId === "string" ? doc.fileId.trim() : "";

  if (candidateFileId) {
    return {
      ...doc,
      fileId: candidateFileId,
      url: toApiFileUrl(candidateFileId),
      originalName: doc.originalName || undefined,
      type: docType,
    };
  }

  if (!candidateUrl) return doc;

  const resolved = await resolveExistingFileReference(candidateUrl, {
    ownerUserId,
    kind: "document",
    docType,
    type: docType,
  });
  if (!resolved) return doc;

  return {
    ...doc,
    fileId: resolved.fileId,
    url: resolved.url,
    originalName: doc.originalName || resolved.originalName || undefined,
    type: docType,
  };
}

async function normalizeSingleImageReference(value, context) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw === "/placeholder.svg") return raw;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) return raw;

  const resolved = await resolveExistingFileReference(raw, context);
  if (!resolved) return raw;
  return resolved.url;
}

async function normalizeProviderFileFields(profile) {
  if (!profile) return profile;
  const providerId = profile.id;
  const ownerUserId = profile.userId;
  const updates = {};
  let changed = false;

  const currentDocuments = normalizeDocuments(profile.documents);
  const nextDocuments = { ...currentDocuments };

  for (const docType of DOCUMENT_TYPES) {
    const existingDoc = currentDocuments[docType];
    if (!existingDoc || typeof existingDoc !== "object" || Array.isArray(existingDoc)) continue;
    const normalizedDoc = await normalizeDocumentReference(ownerUserId, docType, existingDoc);
    if (JSON.stringify(normalizedDoc) !== JSON.stringify(existingDoc)) {
      nextDocuments[docType] = normalizedDoc;
      changed = true;
    }
  }
  if (changed) {
    updates.documents = nextDocuments;
  }

  const normalizedProfileImage = await normalizeSingleImageReference(profile.profileImage, {
    ownerUserId,
    kind: "avatar",
    type: "avatar",
  });
  if ((profile.profileImage || "") !== normalizedProfileImage) {
    updates.profileImage = normalizedProfileImage || null;
    changed = true;
  }

  const portfolioImages = Array.isArray(profile.portfolioImages) ? profile.portfolioImages : [];
  const nextPortfolioImages = [];
  let portfolioChanged = false;
  for (const image of portfolioImages) {
    const normalized = await normalizeSingleImageReference(image, {
      ownerUserId,
      kind: "workImage",
      type: "workImage",
    });
    nextPortfolioImages.push(normalized);
    if (normalized !== image) portfolioChanged = true;
  }
  if (portfolioChanged) {
    updates.portfolioImages = nextPortfolioImages;
    changed = true;
  }

  if (Array.isArray(profile.workPosts) && profile.workPosts.length > 0) {
    for (const wp of profile.workPosts) {
      if (!Array.isArray(wp.images) || wp.images.length === 0) continue;
      const normalizedImages = [];
      let wpChanged = false;
      for (const image of wp.images) {
        const normalized = await normalizeSingleImageReference(image, {
          ownerUserId,
          kind: "workImage",
          type: "workImage",
        });
        normalizedImages.push(normalized);
        if (normalized !== image) wpChanged = true;
      }
      if (wpChanged) {
        await prisma.workPost.update({
          where: { id: wp.id },
          data: { images: normalizedImages },
        });
        wp.images = normalizedImages;
      }
    }
  }

  if (changed) {
    await prisma.provider.update({
      where: { id: providerId },
      data: updates,
    });
    if (updates.documents) profile.documents = updates.documents;
    if (Object.prototype.hasOwnProperty.call(updates, "profileImage")) {
      profile.profileImage = updates.profileImage || "";
    }
    if (updates.portfolioImages) profile.portfolioImages = updates.portfolioImages;
  }

  return profile;
}

/**
 * @param {object} profile - Provider row (+ nested user, workPosts optional)
 * @param {{ phone?: string|null }} user
 * @param {number} workPostCount
 */
function businessHoursComplete(settings) {
  const hours = settings && typeof settings === "object" ? settings.businessHours : null;
  if (!hours || typeof hours !== "object") return false;
  return Object.values(hours).some((day) => {
    if (!day || typeof day !== "object" || !day.enabled) return false;
    const open = String(day.open || "").trim();
    const close = String(day.close || "").trim();
    if (!open || !close) return false;
    return open < close;
  });
}

function checkProviderProfileCompletion(profile, user) {
  const phone = String(user?.phone || "").trim();
  const bio = String(profile.bio || "").trim();
  const serviceAreas = Array.isArray(profile.serviceAreas) ? profile.serviceAreas : [];
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  const laborPricing = profile.laborPricing && typeof profile.laborPricing === "object" ? profile.laborPricing : {};
  const documents = normalizeDocuments(profile.documents);
  const settings =
    profile.settings && typeof profile.settings === "object" && !Array.isArray(profile.settings)
      ? profile.settings
      : null;

  if (!phone) return false;
  if (!profile.saIdNumberHash) return false;
  if (!profile.companyRegistrationHash) return false;
  if (bio.length < 20) return false;
  if (serviceAreas.length < 1) return false;
  if (skills.length < 1) return false;

  for (const sk of skills) {
    const raw = laborPricing[sk];
    const pr = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const low = pr.jobFeeLow != null && pr.jobFeeLow !== "" ? Number(pr.jobFeeLow) : null;
    const high = pr.jobFeeHigh != null && pr.jobFeeHigh !== "" ? Number(pr.jobFeeHigh) : null;
    const hasLow = low != null && !Number.isNaN(low) && low > 0;
    const hasHigh = high != null && !Number.isNaN(high) && high > 0;
    const legacyOk = Number(pr.rate) > 0;

    if (hasLow !== hasHigh) {
      return false;
    }
    if (hasLow && hasHigh && low > high) {
      return false;
    }
    if (!hasLow && !hasHigh && !legacyOk) {
      /* empty range allowed for new providers */
      continue;
    }
    if (hasLow && hasHigh) {
      continue;
    }
    if (legacyOk) {
      continue;
    }
    return false;
  }

  for (const docType of REQUIRED_DOCUMENT_TYPES) {
    if (!hasDocUrl(documents[docType])) return false;
  }

  if (!businessHoursComplete(settings)) return false;

  return true;
}

function prismaDecimalToNumber(v) {
  if (v == null) return Number.NaN;
  if (typeof v === "number") return v;
  if (typeof v === "object" && typeof v.toNumber === "function") return v.toNumber();
  return Number(v);
}

async function aggregateCompletedLaborByCategoryForProviders(userIds) {
  const ids = [...new Set((userIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return {};
  const jobs = await prisma.job.findMany({
    where: {
      providerId: { in: ids },
      status: "COMPLETED",
      laborPaid: true,
    },
    select: {
      providerId: true,
      category: true,
      price: true,
      totalPrice: true,
    },
  });
  /** @type {Record<string, Record<string, { min: number; max: number; jobCount: number }>>} */
  const out = {};
  for (const j of jobs) {
    const pid = j.providerId != null ? String(j.providerId) : "";
    if (!pid) continue;
    let amt = j.totalPrice != null ? prismaDecimalToNumber(j.totalPrice) : Number.NaN;
    if (!Number.isFinite(amt) || amt <= 0) {
      amt = prismaDecimalToNumber(j.price);
    }
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const cat = String(j.category || "").trim();
    if (!cat) continue;
    if (!out[pid]) out[pid] = {};
    const prev = out[pid][cat];
    if (!prev) {
      out[pid][cat] = { min: amt, max: amt, jobCount: 1 };
    } else {
      prev.min = Math.min(prev.min, amt);
      prev.max = Math.max(prev.max, amt);
      prev.jobCount += 1;
    }
  }
  return out;
}

function buildVerificationSummary(profile, trustSummary) {
  const docs = normalizeDocuments(profile.documents);
  return {
    verifiedId: docs.idDoc?.status === "approved",
    verifiedCompany: docs.companyReg?.status === "approved",
    verifiedBankAccount: Boolean(profile.bankVerifiedAt),
    trustScore: trustSummary?.trustScore ?? 100,
    trustLevel: trustSummary?.trustLevel ?? getTrustLevel(100),
    jobsCompleted: trustSummary?.completedJobs ?? 0,
    customerSatisfaction: profile.rating ?? 0,
  };
}

function toProviderResponse(
  profile,
  user,
  completedJobs,
  workPosts,
  reviewRows = [],
  {
    pendingSuggestionsCount = 0,
    pendingSuggestions = [],
    completedLaborByCategory = undefined,
    ratingBreakdown = undefined,
    includeLaborHistory = false,
    trustSummary = undefined,
    verificationSummary = undefined,
  } = {}
) {
  const documents = signDocumentFields(normalizeDocuments(profile.documents));
  const laborPricing =
    profile.laborPricing && typeof profile.laborPricing === "object" ? profile.laborPricing : {};
  const settings =
    profile.settings && typeof profile.settings === "object" ? profile.settings : undefined;

  const areasList = Array.isArray(profile.serviceAreas)
    ? profile.serviceAreas.map((a) => String(a).trim()).filter(Boolean)
    : [];
  const realLocation =
    profile.location && profile.location !== "UNKNOWN" ? profile.location : "";

  const mappedPosts = (workPosts || []).map((wp) => ({
    id: wp.id,
    categoryId: wp.categoryId,
    title: wp.title,
    description: wp.description,
    images: Array.isArray(wp.images) ? wp.images : [],
    createdAt: wp.createdAt instanceof Date ? wp.createdAt.toISOString() : String(wp.createdAt),
  }));

  return {
    id: user.id,
    profileId: profile.id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    role: "provider",
    city: realLocation || areasList[0] || "",
    serviceAreas: areasList,
    skills: Array.isArray(profile.skills) ? profile.skills : [],
    laborPricing,
    documents,
    portfolioImages: Array.isArray(profile.portfolioImages) ? profile.portfolioImages : [],
    profileImage: profile.profileImage || "",
    workPosts: mappedPosts,
    settings,
    approved: profile.approved,
    profileCompleted: profile.profileCompleted,
    blocked: profile.blocked,
    blockedReason: profile.blockedReason || undefined,
    blockedAt: profile.blockedAt ? profile.blockedAt.toISOString() : undefined,
    refundDebtBlockedAt: profile.refundDebtBlockedAt
      ? profile.refundDebtBlockedAt.toISOString()
      : undefined,
    rating: Number(profile.rating) || 0,
    totalReviews: Number(profile.totalReviews) || 0,
    completedJobs,
    responseTime: "N/A",
    bio: profile.bio || "",
    businessName: profile.businessName || "",
    hasSaIdNumber: Boolean(profile.saIdNumberHash),
    companyRegistrationNumber: profile.companyRegistrationNumber || undefined,
    fraudReviewStatus: profile.fraudReviewStatus || "NONE",
    vehicleType: profile.vehicleType || undefined,
    numberPlate: profile.numberPlate || undefined,
    certifications: [],
    reviews: (reviewRows || []).map((r) => ({
      id: r.id,
      userId: r.customerId || r.customer?.id || "",
      userName: r.customer?.name || r.job?.customer?.name || "Customer",
      rating: r.rating,
      comment: r.comment || "",
      jobId: r.jobId,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      jobTitle: r.job?.title || "",
      jobCategory: r.job?.category || "",
    })),
    ...(ratingBreakdown && typeof ratingBreakdown === "object"
      ? { ratingBreakdown }
      : {}),
    ...(trustSummary ? { trustScore: trustSummary.trustScore, trustLevel: trustSummary.trustLevel } : {}),
    ...(verificationSummary ? { verificationSummary } : {}),
    createdAt: user.createdAt,
    rejectionReason: profile.rejectionReason || undefined,
    rejectedAt: profile.rejectedAt ? profile.rejectedAt.toISOString() : undefined,
    deletedAt: profile.deletedAt ? profile.deletedAt.toISOString() : undefined,
    reviewSubmittedAt: profile.reviewSubmittedAt
      ? profile.reviewSubmittedAt.toISOString()
      : undefined,
    pendingSuggestionsCount,
    pendingSuggestions,
    ...(includeLaborHistory &&
    completedLaborByCategory &&
    typeof completedLaborByCategory === "object" &&
    !Array.isArray(completedLaborByCategory) &&
    Object.keys(completedLaborByCategory).length > 0
      ? { completedLaborByCategory }
      : {}),
  };
}

async function loadProviderBundleByUserId(userId) {
  const profile = await prisma.provider.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          createdAt: true,
        },
      },
      workPosts: { orderBy: { createdAt: "desc" } },
    },
  });
  return normalizeProviderFileFields(profile);
}

async function loadProviderBundleByAnyId(id) {
  const normalized = String(id || "").trim();
  if (!normalized) return null;

  const profile = await prisma.provider.findFirst({
    where: {
      OR: [{ userId: normalized }, { id: normalized }],
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          createdAt: true,
        },
      },
      workPosts: { orderBy: { createdAt: "desc" } },
    },
  });
  return normalizeProviderFileFields(profile);
}

async function persistProfileCompleted(profileId) {
  const profile = await prisma.provider.findUnique({
    where: { id: profileId },
    include: {
      user: { select: { phone: true } },
      workPosts: { select: { id: true } },
    },
  });
  if (!profile) return false;

  const complete = checkProviderProfileCompletion(profile, profile.user);

  if (complete !== profile.profileCompleted) {
    await prisma.provider.update({
      where: { id: profileId },
      data: { profileCompleted: complete },
    });
  }
  return complete;
}

async function syncWorkPosts(providerId, incomingPosts) {
  if (!Array.isArray(incomingPosts)) return;

  const nextIds = new Set();

  for (const post of incomingPosts) {
    if (!post || typeof post !== "object") continue;
    const title = String(post.title || "").trim();
    const description = String(post.description || "").trim();
    const categoryId = String(post.categoryId || "").trim();
    if (!title || !categoryId) continue;

    const images = Array.isArray(post.images)
      ? post.images.map((x) => String(x)).filter(Boolean)
      : [];

    const rawId = post.id != null ? String(post.id).trim() : "";
    const id = rawId || randomUUID();
    nextIds.add(id);

    await prisma.workPost.upsert({
      where: { id },
      create: {
        id,
        providerId,
        categoryId,
        title,
        description,
        images: images.length ? images : ["/placeholder.svg"],
      },
      update: {
        categoryId,
        title,
        description,
        images: images.length ? images : ["/placeholder.svg"],
      },
    });
  }

  if (nextIds.size > 0) {
    await prisma.workPost.deleteMany({
      where: {
        providerId,
        id: { notIn: Array.from(nextIds) },
      },
    });
  } else {
    await prisma.workPost.deleteMany({ where: { providerId } });
  }
}

function mergeDocuments(prev, next) {
  const base = normalizeDocuments(prev);
  if (!next || typeof next !== "object") return base;
  const merged = { ...base };
  for (const key of Object.keys(next)) {
    const v = next[key];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      merged[key] = { ...base[key], ...v };
    }
  }
  return merged;
}

function coerceFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeLaborPricing(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const slug = String(key).trim();
    if (!slug) continue;
    const next = { ...entry };
    const rate = coerceFiniteNumber(next.rate);
    if (rate != null && rate >= 0) next.rate = rate;
    else delete next.rate;

    let low = coerceFiniteNumber(next.jobFeeLow);
    let high = coerceFiniteNumber(next.jobFeeHigh);
    if (low != null && low < 0) low = null;
    if (high != null && high < 0) high = null;
    if (low != null) next.jobFeeLow = low;
    else delete next.jobFeeLow;
    if (high != null) next.jobFeeHigh = high;
    else delete next.jobFeeHigh;

    const units = ["sqm", "hour", "job", "meter"];
    if (units.includes(String(next.unit))) {
      next.unit = String(next.unit);
    } else if (rate != null && next.rate > 0) {
      next.unit = "job";
    } else {
      delete next.unit;
    }

    out[slug] = next;
  }
  return out;
}

function isProviderAvailable(settings) {
  return !(settings && typeof settings === "object" && settings.availability === false);
}

function sanitizeSettingsPatch(prev, incoming) {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    return prev && typeof prev === "object" ? { ...prev } : {};
  }
  const base = prev && typeof prev === "object" ? { ...prev } : {};
  const merged = { ...base, ...incoming };
  if (Object.prototype.hasOwnProperty.call(merged, "deliveryRatePerKm")) {
    const v = merged.deliveryRatePerKm;
    if (v === null || v === "" || v === undefined) {
      delete merged.deliveryRatePerKm;
    } else {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        delete merged.deliveryRatePerKm;
      } else {
        merged.deliveryRatePerKm = n;
      }
    }
  }
  return merged;
}

async function expandLaborPricingFromPaidJob(providerUserId, categorySlug, laborGross) {
  const amount = Number(laborGross);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const slug = String(categorySlug || "").trim();
  if (!slug || !providerUserId) return;

  const profile = await prisma.provider.findUnique({
    where: { userId: String(providerUserId) },
    select: { id: true, laborPricing: true },
  });
  if (!profile) return;

  const lpRaw =
    profile.laborPricing && typeof profile.laborPricing === "object" && !Array.isArray(profile.laborPricing)
      ? profile.laborPricing
      : {};
  const lp = { ...lpRaw };
  const prev = lp[slug] && typeof lp[slug] === "object" && !Array.isArray(lp[slug]) ? { ...lp[slug] } : {};

  let prevLow =
    prev.jobFeeLow !== undefined && prev.jobFeeLow !== null ? Number(prev.jobFeeLow) : Number.NaN;
  let prevHigh =
    prev.jobFeeHigh !== undefined && prev.jobFeeHigh !== null ? Number(prev.jobFeeHigh) : Number.NaN;

  prevLow = Number.isFinite(prevLow) && prevLow > 0 ? prevLow : null;
  prevHigh = Number.isFinite(prevHigh) && prevHigh > 0 ? prevHigh : null;

  const nextLow = prevLow != null ? Math.min(prevLow, amount) : amount;
  const nextHigh = prevHigh != null ? Math.max(prevHigh, amount) : amount;

  lp[slug] = {
    ...prev,
    jobFeeLow: nextLow,
    jobFeeHigh: nextHigh,
  };

  await prisma.provider.update({
    where: { id: profile.id },
    data: { laborPricing: lp },
  });
}

async function updateProviderForUser(requestUserId, body) {
  const profile = await loadProviderBundleByUserId(requestUserId);
  if (!profile || profile.user.role !== "PROVIDER") {
    throw new AppError("Provider profile not found", 404);
  }

  const profileRowId = profile.id;
  const data = body && typeof body === "object" ? body : {};

  if (data.phone !== undefined) {
    const phone = data.phone != null ? String(data.phone).trim() : null;
    const phoneNormalized = phone
      ? await fraudDetection.assertPhoneAvailable(phone, requestUserId, {
          attemptUserId: requestUserId,
          providerId: profileRowId,
        })
      : null;
    await prisma.user.update({
      where: { id: requestUserId },
      data: { phone, phoneNormalized },
    });
  }

  const providerUpdate = {};
  if (data.saIdNumber !== undefined) {
    const { hash, encrypted } = await fraudDetection.assertSaIdAvailable(
      data.saIdNumber,
      profileRowId,
      profileRowId
    );
    providerUpdate.saIdNumber = encrypted;
    providerUpdate.saIdNumberHash = hash;
  }
  if (data.companyRegistrationNumber !== undefined) {
    const result = await fraudDetection.checkCompanyRegistration(
      data.companyRegistrationNumber,
      profileRowId
    );
    providerUpdate.companyRegistrationNumber = result.normalized;
    providerUpdate.companyRegistrationHash = result.hash;
    if (result.duplicate) {
      notificationEvents.notifyProviderFraudReview(requestUserId).catch(() => {});
    }
  }
  if (data.businessName !== undefined) {
    providerUpdate.businessName = data.businessName != null ? String(data.businessName).trim() : null;
  }
  if (data.bio !== undefined) {
    providerUpdate.bio = data.bio != null ? String(data.bio) : null;
  }
  if (data.serviceAreas !== undefined) {
    providerUpdate.serviceAreas = Array.isArray(data.serviceAreas)
      ? data.serviceAreas.map((s) => String(s).trim()).filter(Boolean)
      : [];
  }
  if (data.skills !== undefined) {
    providerUpdate.skills = Array.isArray(data.skills)
      ? data.skills.map((s) => String(s).trim()).filter(Boolean)
      : [];
  }
  if (data.laborPricing !== undefined) {
    providerUpdate.laborPricing = sanitizeLaborPricing(data.laborPricing);
  }
  if (data.documents !== undefined) {
    providerUpdate.documents = mergeDocuments(profile.documents, data.documents);
  }
  if (data.settings !== undefined) {
    providerUpdate.settings = sanitizeSettingsPatch(profile.settings, data.settings);
  }
  if (data.portfolioImages !== undefined) {
    providerUpdate.portfolioImages = Array.isArray(data.portfolioImages) ? data.portfolioImages : [];
  }
  if (data.profileImage !== undefined) {
    providerUpdate.profileImage =
      data.profileImage != null && String(data.profileImage).trim()
        ? String(data.profileImage).trim()
        : null;
  }
  if (data.location !== undefined) {
    const loc = String(data.location || "").trim();
    providerUpdate.location = loc || "UNKNOWN";
  }
  if (data.vehicleType !== undefined) {
    providerUpdate.vehicleType =
      data.vehicleType != null && String(data.vehicleType).trim()
        ? String(data.vehicleType).trim()
        : null;
  }
  if (data.numberPlate !== undefined) {
    providerUpdate.numberPlate =
      data.numberPlate != null && String(data.numberPlate).trim()
        ? String(data.numberPlate).trim()
        : null;
  }

  if (Object.keys(providerUpdate).length > 0) {
    await prisma.provider.update({
      where: { id: profileRowId },
      data: providerUpdate,
    });
  }

  if (data.workPosts !== undefined) {
    await syncWorkPosts(profileRowId, data.workPosts);
  }

  await persistProfileCompleted(profileRowId);

  if (data.submitForReview === true) {
    const fresh = await prisma.provider.findUnique({
      where: { id: profileRowId },
      select: { profileCompleted: true },
    });
    if (!fresh?.profileCompleted) {
      throw new AppError("Complete your profile before submitting for review", 400);
    }
    await prisma.provider.update({
      where: { id: profileRowId },
      data: { reviewSubmittedAt: new Date() },
    });
  }

  return getProviderByUserId(requestUserId);
}

async function saveDocumentFromUpload(requestUserId, docType, file) {
  if (!DOCUMENT_TYPES.includes(docType)) {
    throw new AppError("Invalid document type", 400);
  }
  if (!file || !file.path) {
    throw new AppError("File is required", 400);
  }

  const { ext } = validateProviderDocumentFileMeta(
    file.originalname,
    file.mimetype,
    file.size
  );
  await assertProviderDocumentFileMagic(file.path, ext);
  try {
    await scanUploadedFile(file.path, { originalName: file.originalname });
  } catch (err) {
    await unlinkQuietly(file.path);
    throw err;
  }

  const prof = await loadProviderBundleByUserId(requestUserId);
  if (!prof) {
    throw new AppError("Provider profile not found", 404);
  }

  if (!prof.saIdNumberHash || !prof.companyRegistrationHash) {
    throw new AppError(
      "SA ID number and company registration number are required before uploading documents",
      400
    );
  }

  let fileHash = null;
  try {
    const buf = fs.readFileSync(file.path);
    fileHash = sha256File(buf);
    const isDuplicate = await fraudDetection.checkDocumentHashDuplicate(fileHash, prof.id);
    if (isDuplicate) {
      throw new AppError("This document matches an existing verified provider document", 409);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.warn("[provider] document hash check failed", err?.message);
  }

  const stored = await registerUploadedFile(file, {
    ownerUserId: requestUserId,
    type: docType,
  });
  const prev = normalizeDocuments(prof.documents);
  const next = {
    ...prev,
    [docType]: {
      url: stored.url,
      fileId: stored.fileId,
      originalName: stored.originalName,
      type: docType,
      status: "pending",
      ...(fileHash ? { fileHash } : {}),
    },
  };

  await prisma.provider.update({
    where: { id: prof.id },
    data: { documents: next },
  });

  await persistProfileCompleted(prof.id);

  return getProviderByUserId(requestUserId);
}

async function saveAvatarFromUpload(requestUserId, file) {
  if (!file || !file.path) {
    throw new AppError("File is required", 400);
  }
  await validateUploadedImageFile(file);
  const prof = await loadProviderBundleByUserId(requestUserId);
  if (!prof) {
    throw new AppError("Provider profile not found", 404);
  }

  const stored = await registerUploadedFile(file, {
    ownerUserId: requestUserId,
    type: "avatar",
  });
  await prisma.provider.update({
    where: { id: prof.id },
    data: { profileImage: stored.url },
  });

  await persistProfileCompleted(prof.id);
  return getProviderByUserId(requestUserId);
}

async function publicUrlFromUploadedFile(requestUserId, file) {
  if (!file || !file.path) {
    throw new AppError("File is required", 400);
  }
  await validateUploadedImageFile(file);
  const stored = await registerUploadedFile(file, {
    ownerUserId: requestUserId,
    type: "workImage",
  });
  return { url: stored.url, fileId: stored.fileId };
}

async function listProviders({ category, forAdmin = false, nearCity } = {}) {
  const normalizedCategory = String(category || "").trim();
  const nearCityTrim = String(nearCity || "").trim();

  const baseWhere = forAdmin
    ? {}
    : {
        approved: true,
        profileCompleted: true,
        blocked: false,
        deletedAt: null,
      };

  const courierCategory =
    normalizedCategory === "delivery" || normalizedCategory === "moving";

  const where = {
    ...baseWhere,
    ...(normalizedCategory && !courierCategory
      ? {
          skills: { has: normalizedCategory },
        }
      : {}),
    ...(courierCategory
      ? {
          OR: [{ skills: { has: "delivery" } }, { skills: { has: "moving" } }],
        }
      : {}),
  };

  const profiles = await prisma.provider.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          phone: true,
        },
      },
      workPosts: { orderBy: { createdAt: "desc" } },
    },
    orderBy: {
      user: {
        createdAt: "desc",
      },
    },
  });

  const visibleProfiles = forAdmin
    ? profiles
    : profiles.filter((profile) => isProviderAvailable(profile.settings));

  const laborByProviderUserId = await aggregateCompletedLaborByCategoryForProviders(
    visibleProfiles.map((p) => p.userId)
  );

  const providerUserIds = visibleProfiles.map((p) => p.userId);
  const providerJobs =
    providerUserIds.length > 0
      ? await prisma.job.findMany({
          where: { providerId: { in: providerUserIds } },
          select: { providerId: true, status: true, meta: true },
        })
      : [];
  const jobsByProviderUserId = new Map();
  providerJobs.forEach((job) => {
    const key = String(job.providerId);
    if (!jobsByProviderUserId.has(key)) jobsByProviderUserId.set(key, []);
    jobsByProviderUserId.get(key).push(job);
  });

  const providers = await Promise.all(
    visibleProfiles.map(async (profile) => {
      const providerJobRows = jobsByProviderUserId.get(String(profile.userId)) || [];
      const completedJobs = countJobsByStatus(providerJobRows).completed;
      const pendingSuggestionsCount = forAdmin
        ? await prisma.categorySuggestion.count({
            where: {
              providerId: profile.id,
              status: "PENDING",
            },
          })
        : 0;
      const pendingSuggestions = forAdmin
        ? await prisma.categorySuggestion.findMany({
            where: { providerId: profile.id, status: "PENDING" },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              status: true,
              createdAt: true,
            },
          })
        : [];
      return toProviderResponse(profile, profile.user, completedJobs, profile.workPosts, [], {
        pendingSuggestionsCount,
        pendingSuggestions: pendingSuggestions.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
        })),
      });
    })
  );

  if (courierCategory && nearCityTrim) {
    const needle = nearCityTrim.toLowerCase();
    return providers.filter((p) => {
      const c = String(p.city || "")
        .trim()
        .toLowerCase();
      if (c && (c.includes(needle) || needle.includes(c))) return true;
      const areas = Array.isArray(p.serviceAreas) ? p.serviceAreas : [];
      return areas.some((a) => {
        const s = String(a).toLowerCase();
        return s.includes(needle) || needle.includes(s);
      });
    });
  }

  return providers;
}

/**
 * Admin-only: per-provider labor job stats.
 * grossRevenue = provider received + 7% commission per job (released + commission for
 * active/cancelled-partial; full total for completed).
 * platformCommission = sum(job.commissionAmount) on the same job set.
 */
async function listProviderNetRevenues() {
  const providers = await prisma.provider.findMany({
    where: { deletedAt: null },
    select: { userId: true },
  });

  const ids = [...new Set((providers || []).map((p) => String(p.userId || '').trim()).filter(Boolean))];
  if (!ids.length) return [];

  const jobs = await prisma.job.findMany({
    where: {
      providerId: { in: ids },
      laborPaid: true,
      providerAmount: { not: null },
    },
    select: {
      providerId: true,
      status: true,
      totalPrice: true,
      providerAmount: true,
      commissionAmount: true,
      releasedAmount: true,
      meta: true,
    },
  });

  const statsByProviderId = new Map();

  const mergeStats = (providerId, patch) => {
    const key = String(providerId);
    const cur = statsByProviderId.get(key) || {
      netRevenue: 0,
      grossRevenue: 0,
      platformCommission: 0,
      paidJobCount: 0,
    };
    statsByProviderId.set(key, {
      netRevenue: cur.netRevenue + patch.netRevenue,
      grossRevenue: cur.grossRevenue + patch.grossRevenue,
      platformCommission: cur.platformCommission + patch.platformCommission,
      paidJobCount: cur.paidJobCount + patch.paidJobCount,
    });
  };

  for (const job of jobs) {
    const providerId = job.providerId;
    if (!providerId) continue;

    const commission = prismaDecimalToNumber(job.commissionAmount);
    const providerAmt = prismaDecimalToNumber(job.providerAmount);
    const total = prismaDecimalToNumber(job.totalPrice);
    const comm = Number.isFinite(commission) ? commission : 0;
    const meta = normalizeMeta(job.meta);
    const escrowApplied = Number(meta?.refund?.escrowApplied) || 0;
    const clawbackApplied = Number(meta?.refund?.clawbackApplied) || 0;
    const providerDebtAdded = Number(meta?.refund?.providerDebtAdded) || 0;
    const netLaborRefunded =
      Number(meta?.refund?.cumulativeCustomerNet) ||
      Number(meta?.refund?.customerNet) ||
      escrowApplied + clawbackApplied + providerDebtAdded;
    const net = Math.max(
      0,
      (Number.isFinite(providerAmt) ? providerAmt : 0) - netLaborRefunded
    );
    const gross =
      Number.isFinite(total) && total > 0 ? total : net + comm;

    mergeStats(providerId, {
      netRevenue: net,
      grossRevenue: gross,
      platformCommission: comm,
      paidJobCount: 1,
    });
  }

  const completedGrouped = await prisma.job.groupBy({
    by: ['providerId'],
    where: {
      providerId: { in: ids },
      laborPaid: true,
      providerAmount: { not: null },
      status: 'COMPLETED',
    },
    _count: { _all: true },
  });

  const completedCountByProviderId = new Map();
  for (const row of completedGrouped) {
    if (!row.providerId) continue;
    completedCountByProviderId.set(String(row.providerId), row._count?._all ?? 0);
  }

  return ids.map((id) => {
    const stats = statsByProviderId.get(id);
    const grossRevenue = stats?.grossRevenue ?? 0;
    const netRevenue = stats?.netRevenue ?? 0;
    const platformCommission = stats?.platformCommission ?? 0;
    return {
      providerId: id,
      netRevenue,
      grossRevenue,
      // Keep commission aligned with gross − provider received on the same job set.
      platformCommission:
        platformCommission > 0 ? platformCommission : Math.max(0, grossRevenue - netRevenue),
      completedJobCount: completedCountByProviderId.get(id) ?? 0,
      paidJobCount: stats?.paidJobCount ?? 0,
    };
  });
}

async function getProviderById(id) {
  const profile = await loadProviderBundleByAnyId(id);
  if (!profile) {
    throw new AppError("Provider not found", 404);
  }

  const completedJobs = await prisma.job.count({
    where: {
      providerId: profile.userId,
      status: "COMPLETED",
    },
  });

  const reviewRows = await prisma.providerReview.findMany({
    where: { providerId: profile.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      customer: { select: { id: true, name: true } },
      job: {
        select: {
          title: true,
          category: true,
        },
      },
    },
  });

  const { aggregateRatingBreakdown } = require("./providerReview.service");
  const ratingBreakdown = await aggregateRatingBreakdown(profile.id);

  const trustRow = await providerTrustScore.getTrustScoreForProviderProfile(profile.id, profile);
  const trustSummary = trustRow
    ? { trustScore: trustRow.score, trustLevel: trustRow.trustLevel, completedJobs: trustRow.completedJobs }
    : { trustScore: 100, trustLevel: getTrustLevel(100), completedJobs: completedJobs };
  const verificationSummary = buildVerificationSummary(profile, trustSummary);

  const pendingSuggestions = await prisma.categorySuggestion.findMany({
    where: { providerId: profile.id, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
    },
  });

  return toProviderResponse(profile, profile.user, completedJobs, profile.workPosts, reviewRows, {
    pendingSuggestionsCount: pendingSuggestions.length,
    pendingSuggestions: pendingSuggestions.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
    })),
    ratingBreakdown,
    trustSummary,
    verificationSummary,
  });
}

async function getProviderByUserId(userId) {
  return getProviderById(userId);
}

/** Resolve public route :id (user id or provider profile id) to user id. */
async function resolveProviderUserIdFromRouteParam(id) {
  const profile = await loadProviderBundleByAnyId(id);
  return profile ? profile.userId : null;
}

function assertRequiredDocsForApproval(profile) {
  const documents = normalizeDocuments(profile.documents);
  const labels = {
    idDoc: "ID document",
    companyReg: "Company registration",
    proofOfAddress: "Proof of address",
  };
  for (const docType of REQUIRED_DOCUMENT_TYPES) {
    if (!hasDocUrl(documents[docType])) {
      throw new AppError(`Cannot approve: ${labels[docType]} is required`, 400);
    }
    if (!hasDocApproved(documents[docType])) {
      throw new AppError(`Cannot approve: ${labels[docType]} must be approved by admin`, 400);
    }
  }
}

async function approveProviderDocumentByUserId(targetUserId, docType, auditOpts = {}) {
  if (!DOCUMENT_TYPES.includes(docType)) {
    throw new AppError("Invalid document type", 400);
  }
  const profile = await loadProviderBundleByUserId(targetUserId);
  if (!profile) {
    throw new AppError("Provider not found", 404);
  }
  const prev = normalizeDocuments(profile.documents);
  const existing = prev[docType];
  if (!existing || !hasDocUrl(existing)) {
    throw new AppError("No document uploaded for this type", 400);
  }
  if (docType === "idDoc" && profile.saIdNumberHash) {
    const dup = await fraudDetection.findProviderBySaIdHash(profile.saIdNumberHash, profile.id);
    if (dup) {
      throw new AppError("Cannot approve: duplicate SA ID on another verified provider", 400);
    }
  }
  const next = {
    ...prev,
    [docType]: {
      ...existing,
      status: "approved",
      feedback: null,
    },
  };
  await prisma.provider.update({
    where: { id: profile.id },
    data: { documents: next },
  });
  await persistProfileCompleted(profile.id);
  if (docType === "idDoc") await providerTrustScore.onVerifiedId(profile.id);
  if (docType === "companyReg") await providerTrustScore.onVerifiedCompany(profile.id);
  await logAudit(AUDIT_ACTIONS.VERIFICATION_PROVIDER_DOC_APPROVED, {
    userId: auditOpts.userId,
    actorType: ACTOR_TYPES.ADMIN,
    entityType: ENTITY_TYPES.PROVIDER,
    entityId: profile.id,
    oldValue: { docType, status: existing?.status || null },
    newValue: { docType, status: "approved" },
    ipAddress: auditOpts.ipAddress,
    deviceFingerprint: auditOpts.deviceFingerprint,
  });
  return getProviderById(targetUserId);
}

async function rejectProviderDocumentByUserId(targetUserId, docType, feedback, auditOpts = {}) {
  if (!DOCUMENT_TYPES.includes(docType)) {
    throw new AppError("Invalid document type", 400);
  }
  const profile = await loadProviderBundleByUserId(targetUserId);
  if (!profile) {
    throw new AppError("Provider not found", 404);
  }
  const prev = normalizeDocuments(profile.documents);
  const existing = prev[docType];
  if (!existing || !hasDocUrl(existing)) {
    throw new AppError("No document uploaded for this type", 400);
  }
  const next = {
    ...prev,
    [docType]: {
      ...existing,
      status: "rejected",
      feedback: String(feedback || "").trim() || null,
    },
  };
  await prisma.provider.update({
    where: { id: profile.id },
    data: { documents: next },
  });
  await persistProfileCompleted(profile.id);
  await logAudit(AUDIT_ACTIONS.VERIFICATION_PROVIDER_DOC_REJECTED, {
    userId: auditOpts.userId,
    actorType: ACTOR_TYPES.ADMIN,
    entityType: ENTITY_TYPES.PROVIDER,
    entityId: profile.id,
    oldValue: { docType, status: existing?.status || null },
    newValue: { docType, status: "rejected", feedback: String(feedback || "").trim() || null },
    ipAddress: auditOpts.ipAddress,
    deviceFingerprint: auditOpts.deviceFingerprint,
  });
  return getProviderById(targetUserId);
}

async function approveProviderByUserId(targetUserId, auditOpts = {}) {
  const profile = await loadProviderBundleByUserId(targetUserId);
  if (!profile) {
    throw new AppError("Provider not found", 404);
  }
  assertRequiredDocsForApproval(profile);
  await fraudDetection.assertProviderApprovalAllowed(profile);

  await persistProfileCompleted(profile.id);
  const refreshed = await prisma.provider.findUnique({ where: { id: profile.id } });
  if (!refreshed.profileCompleted) {
    throw new AppError("Cannot approve: provider profile is not complete", 400);
  }

  await prisma.provider.update({
    where: { id: profile.id },
    data: { approved: true },
  });

  await notificationEvents.notifyProviderApproved(targetUserId);

  await logAudit(AUDIT_ACTIONS.VERIFICATION_PROVIDER_APPROVED, {
    userId: auditOpts.userId,
    actorType: ACTOR_TYPES.ADMIN,
    entityType: ENTITY_TYPES.PROVIDER,
    entityId: profile.id,
    oldValue: { approved: profile.approved },
    newValue: { approved: true },
    ipAddress: auditOpts.ipAddress,
    deviceFingerprint: auditOpts.deviceFingerprint,
  });

  return getProviderById(targetUserId);
}

async function rejectProviderByUserId(targetUserId, reason, auditOpts = {}) {
  const profile = await loadProviderBundleByUserId(targetUserId);
  if (!profile) {
    throw new AppError("Provider not found", 404);
  }

  await prisma.provider.update({
    where: { id: profile.id },
    data: {
      approved: false,
      rejectionReason: String(reason || "").trim() || null,
      rejectedAt: new Date(),
    },
  });

  await logAudit(AUDIT_ACTIONS.VERIFICATION_PROVIDER_REJECTED, {
    userId: auditOpts.userId,
    actorType: ACTOR_TYPES.ADMIN,
    entityType: ENTITY_TYPES.PROVIDER,
    entityId: profile.id,
    oldValue: { approved: profile.approved },
    newValue: { approved: false, rejectionReason: String(reason || "").trim() || null },
    ipAddress: auditOpts.ipAddress,
    deviceFingerprint: auditOpts.deviceFingerprint,
  });

  return getProviderById(targetUserId);
}

async function blockProviderByUserId(targetUserId, auditOpts = {}) {
  const profile = await loadProviderBundleByUserId(targetUserId);
  if (!profile) {
    throw new AppError("Provider not found", 404);
  }
  const reason = String(auditOpts.reason || "").trim();
  if (!reason) {
    throw new AppError("Block reason is required", 400);
  }
  const now = new Date();

  await prisma.provider.update({
    where: { id: profile.id },
    data: { blocked: true, blockedReason: reason, blockedAt: now },
  });

  await logAudit(AUDIT_ACTIONS.ADMIN_PROVIDER_BLOCKED, {
    userId: auditOpts.userId,
    actorType: ACTOR_TYPES.ADMIN,
    entityType: ENTITY_TYPES.PROVIDER,
    entityId: profile.id,
    oldValue: { blocked: profile.blocked, blockedReason: profile.blockedReason || null },
    newValue: { blocked: true, blockedReason: reason },
    ipAddress: auditOpts.ipAddress,
    deviceFingerprint: auditOpts.deviceFingerprint,
  });

  const notificationEvents = require("./notificationEvents.service");
  await notificationEvents.notifyAccountBlocked(targetUserId, reason);

  return getProviderById(targetUserId);
}

async function unblockProviderByUserId(targetUserId, auditOpts = {}) {
  const profile = await loadProviderBundleByUserId(targetUserId);
  if (!profile) {
    throw new AppError("Provider not found", 404);
  }

  await prisma.provider.update({
    where: { id: profile.id },
    data: {
      blocked: false,
      blockedReason: null,
      blockedAt: null,
      refundDebtBlockedAt: null,
    },
  });

  await logAudit(AUDIT_ACTIONS.ADMIN_PROVIDER_UNBLOCKED, {
    userId: auditOpts.userId,
    actorType: ACTOR_TYPES.ADMIN,
    entityType: ENTITY_TYPES.PROVIDER,
    entityId: profile.id,
    oldValue: { blocked: profile.blocked },
    newValue: { blocked: false },
    ipAddress: auditOpts.ipAddress,
    deviceFingerprint: auditOpts.deviceFingerprint,
  });

  const notificationEvents = require("./notificationEvents.service");
  await notificationEvents.notifyAccountUnblocked(targetUserId);

  return getProviderById(targetUserId);
}

async function softDeleteProviderByUserId(targetUserId) {
  const profile = await loadProviderBundleByUserId(targetUserId);
  if (!profile) {
    throw new AppError("Provider not found", 404);
  }

  await prisma.provider.update({
    where: { id: profile.id },
    data: { deletedAt: new Date() },
  });

  return getProviderById(targetUserId);
}

function isProviderActiveRow(profile) {
  return profile.approved === true && profile.profileCompleted === true && profile.blocked !== true;
}

module.exports = {
  REQUIRED_DOCUMENT_TYPES,
  OPTIONAL_DOCUMENT_TYPES,
  DOCUMENT_TYPES,
  checkProviderProfileCompletion,
  toProviderResponse,
  listProviders,
  listProviderNetRevenues,
  getProviderById,
  getProviderByUserId,
  resolveProviderUserIdFromRouteParam,
  updateProviderForUser,
  saveDocumentFromUpload,
  saveAvatarFromUpload,
  publicUrlFromUploadedFile,
  approveProviderByUserId,
  rejectProviderByUserId,
  approveProviderDocumentByUserId,
  rejectProviderDocumentByUserId,
  blockProviderByUserId,
  unblockProviderByUserId,
  softDeleteProviderByUserId,
  persistProfileCompleted,
  isProviderActiveRow,
  isProviderAvailable,
  expandLaborPricingFromPaidJob,
};
