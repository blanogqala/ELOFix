const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const notificationEvents = require("./notificationEvents.service");
const { randomUUID } = require("crypto");
const {
  toApiFileUrl,
  registerUploadedFile,
  resolveExistingFileReference,
} = require("./fileStorage.service");

const {
  validateProviderDocumentFileMeta,
  assertProviderDocumentFileMagic,
} = require("../utils/providerDocumentFile.util");

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
function checkProviderProfileCompletion(profile, user, workPostCount) {
  const phone = String(user?.phone || "").trim();
  const businessName = String(profile.businessName || "").trim();
  const bio = String(profile.bio || "").trim();
  const serviceAreas = Array.isArray(profile.serviceAreas) ? profile.serviceAreas : [];
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  const laborPricing = profile.laborPricing && typeof profile.laborPricing === "object" ? profile.laborPricing : {};
  const documents = normalizeDocuments(profile.documents);

  if (!phone) return false;
  if (!businessName) return false;
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

  if (workPostCount < 1) return false;

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
    includeDocuments = true,
  } = {}
) {
  const documents = normalizeDocuments(profile.documents);
  const laborPricing =
    profile.laborPricing && typeof profile.laborPricing === "object" ? profile.laborPricing : {};
  const settings =
    profile.settings && typeof profile.settings === "object" ? profile.settings : undefined;

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
    city: profile.location === "UNKNOWN" ? "" : profile.location,
    serviceAreas: Array.isArray(profile.serviceAreas) ? profile.serviceAreas : [],
    skills: Array.isArray(profile.skills) ? profile.skills : [],
    laborPricing,
    ...(includeDocuments ? { documents } : {}),
    portfolioImages: Array.isArray(profile.portfolioImages) ? profile.portfolioImages : [],
    profileImage: profile.profileImage || "",
    workPosts: mappedPosts,
    settings,
    approved: profile.approved,
    profileCompleted: profile.profileCompleted,
    blocked: profile.blocked,
    rating: Number(profile.rating) || 0,
    totalReviews: Number(profile.totalReviews) || 0,
    completedJobs,
    responseTime: "N/A",
    bio: profile.bio || "",
    businessName: profile.businessName || "",
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

  const complete = checkProviderProfileCompletion(
    profile,
    profile.user,
    profile.workPosts.length
  );

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
    await prisma.user.update({
      where: { id: requestUserId },
      data: { phone: data.phone != null ? String(data.phone).trim() : null },
    });
  }

  const providerUpdate = {};
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

  const prof = await loadProviderBundleByUserId(requestUserId);
  if (!prof) {
    throw new AppError("Provider profile not found", 404);
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

  const where = {
    ...baseWhere,
    ...(normalizedCategory
      ? {
          skills: { has: normalizedCategory },
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

  const laborByProviderUserId = await aggregateCompletedLaborByCategoryForProviders(profiles.map((p) => p.userId));

  const providers = await Promise.all(
    profiles.map(async (profile) => {
      const completedJobs = await prisma.job.count({
        where: {
          providerId: profile.userId,
          status: "COMPLETED",
        },
      });
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
        includeDocuments: Boolean(forAdmin),
      });
    })
  );

  if (normalizedCategory === "delivery" && nearCityTrim) {
    const needle = nearCityTrim.toLowerCase();
    return providers.filter((p) => {
      const c = String(p.city || "")
        .trim()
        .toLowerCase();
      if (c && c.includes(needle)) return true;
      const areas = Array.isArray(p.serviceAreas) ? p.serviceAreas : [];
      if (areas.some((a) => String(a).toLowerCase().includes(needle))) return true;
      return false;
    });
  }

  return providers;
}

async function getProviderById(id, options = {}) {
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
    includeDocuments: options.includeDocuments !== false,
  });
}

async function getPublicProviderById(id) {
  return getProviderById(id, { includeDocuments: false });
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

async function approveProviderDocumentByUserId(targetUserId, docType) {
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
      status: "approved",
      feedback: null,
    },
  };
  await prisma.provider.update({
    where: { id: profile.id },
    data: { documents: next },
  });
  await persistProfileCompleted(profile.id);
  return getProviderById(targetUserId);
}

async function rejectProviderDocumentByUserId(targetUserId, docType, feedback) {
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
  return getProviderById(targetUserId);
}

async function approveProviderByUserId(targetUserId) {
  const profile = await loadProviderBundleByUserId(targetUserId);
  if (!profile) {
    throw new AppError("Provider not found", 404);
  }
  assertRequiredDocsForApproval(profile);

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

  return getProviderById(targetUserId);
}

async function rejectProviderByUserId(targetUserId, reason) {
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

  return getProviderById(targetUserId);
}

async function blockProviderByUserId(targetUserId) {
  const profile = await loadProviderBundleByUserId(targetUserId);
  if (!profile) {
    throw new AppError("Provider not found", 404);
  }

  await prisma.provider.update({
    where: { id: profile.id },
    data: { blocked: true },
  });

  return getProviderById(targetUserId);
}

async function unblockProviderByUserId(targetUserId) {
  const profile = await loadProviderBundleByUserId(targetUserId);
  if (!profile) {
    throw new AppError("Provider not found", 404);
  }

  await prisma.provider.update({
    where: { id: profile.id },
    data: { blocked: false },
  });

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
  getProviderById,
  getPublicProviderById,
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
  expandLaborPricingFromPaidJob,
};
