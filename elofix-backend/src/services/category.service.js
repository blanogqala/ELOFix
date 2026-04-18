const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");

const SERVICE_AREAS = [
  "Johannesburg",
  "Pretoria",
  "Cape Town",
  "Durban",
  "Port Elizabeth",
  "Bloemfontein",
];

const ALLOWED_STEP3_TYPES = new Set(["measurements", "items", "issue"]);

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
  if (sortOrder != null && Number.isNaN(sortOrder)) {
    throw new AppError("sortOrder must be a number", 400);
  }

  return {
    ...(name != null ? { name } : {}),
    ...(icon != null ? { icon } : {}),
    ...(description != null ? { description } : {}),
    ...(step3Type != null ? { step3Type } : {}),
    ...(requiresMaterials != null ? { requiresMaterials } : {}),
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

async function createCategorySuggestion(userId, name) {
  const n = String(name || "").trim();
  if (n.length < 2) {
    throw new AppError("Suggestion must be at least 2 characters", 400);
  }

  return prisma.categorySuggestion.create({
    data: {
      name: n,
      userId,
    },
  });
}

module.exports = {
  listCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  listServiceAreas,
  createCategorySuggestion,
};

