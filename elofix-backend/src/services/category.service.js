const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const notificationEvents = require("./notificationEvents.service");
const { persistProfileCompleted } = require("./provider.service");

const SERVICE_AREAS = [
  "Johannesburg",
  "Pretoria",
  "Cape Town",
  "Durban",
  "Port Elizabeth",
  "Bloemfontein",
];

const ALLOWED_STEP3_TYPES = new Set(["measurements", "items", "issue", "none"]);
const ALLOWED_PAYMENT_MODES = new Set([
  "TWO_PAYMENT_50_50",
  "SINGLE_PAYMENT_UPFRONT",
  "SINGLE_PAYMENT_ON_COMPLETION",
]);

function emitSuggestionEvent(event, payload, userIds = []) {
  if (!global.io) return;
  global.io.emit(event, payload);
  for (const userId of userIds) {
    if (!userId) continue;
    global.io.to(String(userId)).emit(event, payload);
  }
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

async function ensureUniqueId(base) {
  let candidate = base || "category";
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.category.findUnique({ where: { id: candidate } });
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

function normalizeCategoryInput(input, { isCreate = false } = {}) {
  const name = input.name != null ? String(input.name).trim() : undefined;
  const icon = input.icon != null ? String(input.icon).trim() : undefined;
  const description = input.description != null ? String(input.description).trim() : undefined;
  const step3Type = input.step3Type != null ? String(input.step3Type).trim() : undefined;
  const requiresMaterials =
    input.requiresMaterials != null ? Boolean(input.requiresMaterials) : undefined;
  const requiresInspection =
    input.requiresInspection != null ? Boolean(input.requiresInspection) : undefined;
  const paymentMode =
    input.paymentMode != null ? String(input.paymentMode).trim().toUpperCase() : undefined;
  const isActive = input.isActive != null ? Boolean(input.isActive) : undefined;
  const sortOrder =
    input.sortOrder != null && input.sortOrder !== ""
      ? Number(input.sortOrder)
      : undefined;
  const skills = input.skills != null ? toArray(input.skills) : undefined;
  const issueTypes = input.issueTypes != null ? toArray(input.issueTypes) : undefined;
  const commonItems =
    input.commonItems != null ? input.commonItems : undefined;

  if (isCreate) {
    if (!name) throw new AppError("name is required", 400);
    if (!icon) throw new AppError("icon is required", 400);
    if (!description) throw new AppError("description is required", 400);
    if (!step3Type) throw new AppError("step3Type is required", 400);
  }

  if (step3Type && !ALLOWED_STEP3_TYPES.has(step3Type)) {
    throw new AppError("Invalid step3Type", 400);
  }
  if (paymentMode && !ALLOWED_PAYMENT_MODES.has(paymentMode)) {
    throw new AppError("Invalid paymentMode", 400);
  }
  if (sortOrder != null && Number.isNaN(sortOrder)) {
    throw new AppError("sortOrder must be a number", 400);
  }

  return {
    ...(name != null ? { name } : {}),
    ...(icon != null ? { icon } : {}),
    ...(description != null ? { description } : {}),
    ...(step3Type != null ? { step3Type } : {}),
    ...(requiresMaterials != null ? { requiresMaterials } : {}),
    ...(requiresInspection != null ? { requiresInspection } : {}),
    ...(paymentMode != null ? { paymentMode } : {}),
    ...(isActive != null ? { isActive } : {}),
    ...(sortOrder != null ? { sortOrder } : {}),
    ...(skills != null ? { skills } : {}),
    ...(issueTypes != null ? { issueTypes } : {}),
    ...(commonItems !== undefined ? { commonItems } : {}),
  };
}

async function listCategories({ includeInactive = false } = {}) {
  return prisma.category.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

async function getCategoryById(id) {
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw new AppError("Category not found", 404);
  return category;
}

async function createCategory(body) {
  const normalized = normalizeCategoryInput(body, { isCreate: true });
  const id = await ensureUniqueId(slugify(normalized.name));
  try {
    return await prisma.category.create({
      data: {
        id,
        ...normalized,
        skills: normalized.skills || [],
        issueTypes: normalized.issueTypes || [],
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError("Category with the same name already exists", 409);
    }
    throw error;
  }
}

async function updateCategory(id, body) {
  await getCategoryById(id);
  const normalized = normalizeCategoryInput(body);
  return prisma.category.update({
    where: { id },
    data: normalized,
  });
}

async function deleteCategory(id) {
  await getCategoryById(id);
  await prisma.category.delete({ where: { id } });
  return { id };
}

async function listServiceAreas() {
  return [...SERVICE_AREAS];
}

function normalizeSuggestionPayload(input) {
  if (!input || typeof input !== "object") return {};
  const serviceName = String(
    input.serviceName || input.name || input.suggestion || ""
  ).trim();
  const description = input.description != null ? String(input.description).trim() : "";
  const icon = input.icon != null ? String(input.icon).trim() : "";
  return {
    serviceName,
    ...(description ? { description } : {}),
    ...(icon ? { icon } : {}),
  };
}

async function createCategorySuggestion(userId, payload) {
  const normalized = normalizeSuggestionPayload(payload);
  const n = normalized.serviceName;
  if (n.length < 2) {
    throw new AppError("Suggestion must be at least 2 characters", 400);
  }

  const providerRow = await prisma.provider.findUnique({
    where: { userId: String(userId) },
    select: { id: true },
  });

  const created = await prisma.categorySuggestion.create({
    data: {
      name: n,
      description: normalized.description,
      icon: normalized.icon,
      userId,
      ...(providerRow ? { providerId: providerRow.id } : {}),
    },
  });

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  await Promise.all(
    admins.map((admin) => notificationEvents.notifyCategorySuggestion(admin.id, n, created.id))
  );
  emitSuggestionEvent(
    "category_suggestion:created",
    {
      suggestionId: created.id,
      providerId: created.providerId || null,
      userId: created.userId,
      status: created.status,
    },
    [created.userId]
  );

  if (providerRow) {
    await persistProfileCompleted(providerRow.id);
  }

  return created;
}

async function listCategorySuggestionsForProvider(userId, { status } = {}) {
  const providerRow = await prisma.provider.findUnique({
    where: { userId: String(userId) },
    select: { id: true },
  });
  if (!providerRow) return [];
  const st = status ? String(status).toUpperCase() : null;
  const where =
    st && ["PENDING", "APPROVED", "REJECTED"].includes(st) ? { status: st } : undefined;
  return prisma.categorySuggestion.findMany({
    where: {
      providerId: providerRow.id,
      ...(where || {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

async function listCategorySuggestionsForAdmin({ status } = {}) {
  const st = status ? String(status).toUpperCase() : null;
  const where =
    st && ["PENDING", "APPROVED", "REJECTED"].includes(st) ? { status: st } : undefined;
  return prisma.categorySuggestion.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      provider: { select: { id: true, businessName: true } },
    },
  });
}

async function approveCategorySuggestion(suggestionId, payload = {}) {
  const s = await prisma.categorySuggestion.findUnique({ where: { id: suggestionId } });
  if (!s) throw new AppError("Suggestion not found", 404);
  if (s.status !== "PENDING") {
    throw new AppError("Suggestion is not pending", 400);
  }

  const normalized = normalizeCategoryInput(
    {
      name: payload.serviceName || payload.name || s.name,
      icon: payload.icon || "🛠️",
      description:
        payload.description ||
        s.description ||
        `Community-suggested category: ${s.name}`,
      step3Type: "measurements",
      requiresMaterials: false,
      requiresInspection: true,
      skills: Array.isArray(payload.skills) ? payload.skills : [],
      issueTypes: [],
    },
    { isCreate: true }
  );

  const idBase = slugify(normalized.name);
  const id = await ensureUniqueId(idBase);

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.category.create({
        data: {
          id,
          ...normalized,
          skills: normalized.skills || [],
          issueTypes: normalized.issueTypes || [],
        },
      });

      await tx.categorySuggestion.update({
        where: { id: s.id },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
          approvedCategoryId: id,
          name: normalized.name,
          description: normalized.description,
          icon: normalized.icon,
        },
      });

      if (s.providerId) {
        const provider = await tx.provider.findUnique({
          where: { id: s.providerId },
          select: { skills: true, userId: true },
        });
        if (provider) {
          const skillSet = new Set(Array.isArray(provider.skills) ? provider.skills : []);
          skillSet.add(id);
          await tx.provider.update({
            where: { id: s.providerId },
            data: { skills: Array.from(skillSet) },
          });
          return { providerUserId: provider.userId };
        }
      }
      return { providerUserId: null };
    });

    if (result.providerUserId) {
      await notificationEvents.notifyUser(result.providerUserId, {
        type: "category_suggestion",
        title: "Service approved",
        message: `"${normalized.name}" has been approved and added to your profile.`,
      });
    }
    emitSuggestionEvent(
      "category_suggestion:updated",
      {
        suggestionId: s.id,
        providerId: s.providerId || null,
        userId: s.userId,
        status: "APPROVED",
        categoryId: id,
      },
      [s.userId, result.providerUserId]
    );
    return { suggestionId: s.id, categoryId: id, providerUserId: result.providerUserId };
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError("Category with the same name already exists", 409);
    }
    throw error;
  }
}

async function rejectCategorySuggestion(suggestionId) {
  const s = await prisma.categorySuggestion.findUnique({ where: { id: suggestionId } });
  if (!s) throw new AppError("Suggestion not found", 404);
  if (s.status !== "PENDING") {
    throw new AppError("Suggestion is not pending", 400);
  }

  const updated = await prisma.categorySuggestion.update({
    where: { id: s.id },
    data: { status: "REJECTED" },
  });
  if (updated.userId) {
    await notificationEvents.notifyUser(updated.userId, {
      type: "category_suggestion",
      title: "Service suggestion update",
      message: `"${updated.name}" was not approved this time.`,
    });
  }
  emitSuggestionEvent(
    "category_suggestion:updated",
    {
      suggestionId: updated.id,
      providerId: updated.providerId || null,
      userId: updated.userId,
      status: "REJECTED",
      categoryId: null,
    },
    [updated.userId]
  );

  if (updated.providerId) {
    await persistProfileCompleted(updated.providerId);
  }

  return { suggestionId: updated.id, providerId: updated.providerId || null };
}

module.exports = {
  listCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  listServiceAreas,
  createCategorySuggestion,
  listCategorySuggestionsForProvider,
  listCategorySuggestionsForAdmin,
  approveCategorySuggestion,
  rejectCategorySuggestion,
};

