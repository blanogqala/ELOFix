const { Prisma } = require("@prisma/client");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MARKETPLACE_ICON_KEYS = [
  "paint",
  "electrical",
  "plumbing",
  "tiles",
  "building",
  "timber",
  "roofing",
  "tools",
];

const ICON_SET = new Set(MARKETPLACE_ICON_KEYS);

function slugifyMarketplaceName(raw) {
  const slug = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug;
}

function assertSlug(slug) {
  if (!slug) throw new AppError("Category name is required", 400);
  return slug;
}

function parseIcon(raw) {
  if (raw === undefined) return Symbol.for("omit");
  if (raw === null || String(raw).trim() === "") return null;
  const key = String(raw).trim().toLowerCase();
  if (!ICON_SET.has(key)) {
    throw new AppError(`icon must be one of: ${MARKETPLACE_ICON_KEYS.join(", ")}`, 400);
  }
  return key;
}

function parseImageUrl(raw) {
  if (raw === undefined) return Symbol.for("omit");
  if (raw === null || String(raw).trim() === "") return null;
  const s = String(raw).trim();
  if (s.length > 2048) throw new AppError("imageUrl is too long", 400);
  if (/^\s*javascript:/i.test(s)) throw new AppError("imageUrl is invalid", 400);
  return s;
}

function parseDescription(raw) {
  if (raw === undefined) return Symbol.for("omit");
  if (raw === null || String(raw).trim() === "") return null;
  const s = String(raw).trim();
  if (s.length > 500) throw new AppError("description is too long", 400);
  return s;
}

function parseSortOrder(raw) {
  if (raw === undefined) return Symbol.for("omit");
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
    throw new AppError("sortOrder must be a non-negative number", 400);
  }
  return Math.floor(n);
}

function serializeCategory(row, { includeCount = false } = {}) {
  if (!row) return null;
  const imageUrl =
    row.imageUrl != null && String(row.imageUrl).trim() ? String(row.imageUrl).trim() : undefined;
  const description =
    row.description != null && String(row.description).trim()
      ? String(row.description).trim()
      : undefined;
  const icon = row.icon != null && String(row.icon).trim() ? String(row.icon).trim() : undefined;
  const out = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description,
    icon,
    imageUrl,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : 0,
    isActive: row.isActive !== false,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
  if (includeCount) {
    out.branchCount = Number(row._count?.branches ?? row.branchCount ?? 0);
  }
  return out;
}

function serializePublicCategory(row) {
  const full = serializeCategory(row);
  return {
    id: full.id,
    name: full.name,
    slug: full.slug,
    description: full.description,
    icon: full.icon,
    imageUrl: full.imageUrl,
    sortOrder: full.sortOrder,
  };
}

async function assertUniqueSlug(slug, exceptId) {
  const existing = await prisma.marketplaceMaterialCategory.findUnique({ where: { slug } });
  if (existing && existing.id !== exceptId) {
    throw new AppError("A marketplace category with this name already exists", 409);
  }
}

function rethrowUnique(err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new AppError("A marketplace category with this name already exists", 409);
  }
  throw err;
}

async function listForAdmin() {
  const rows = await prisma.marketplaceMaterialCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { branches: true } } },
  });
  return rows.map((row) => serializeCategory(row, { includeCount: true }));
}

async function listActivePublic() {
  const rows = await prisma.marketplaceMaterialCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(serializePublicCategory);
}

async function createCategory(body = {}) {
  const name = String(body.name || "").trim();
  if (!name || name.length > 80) throw new AppError("Category name is required", 400);
  const slug = assertSlug(slugifyMarketplaceName(body.slug != null && String(body.slug).trim() ? body.slug : name));
  await assertUniqueSlug(slug);
  const description = parseDescription(body.description);
  const icon = parseIcon(body.icon);
  const imageUrl = parseImageUrl(body.imageUrl);
  const sortOrder = parseSortOrder(body.sortOrder);
  try {
    const row = await prisma.marketplaceMaterialCategory.create({
      data: {
        name,
        slug,
        description: description === Symbol.for("omit") ? null : description,
        icon: icon === Symbol.for("omit") ? null : icon,
        imageUrl: imageUrl === Symbol.for("omit") ? null : imageUrl,
        sortOrder: sortOrder === Symbol.for("omit") ? 0 : sortOrder,
        isActive: body.isActive !== false,
      },
      include: { _count: { select: { branches: true } } },
    });
    return serializeCategory(row, { includeCount: true });
  } catch (err) {
    rethrowUnique(err);
  }
}

async function updateCategory(id, body = {}) {
  const existing = await prisma.marketplaceMaterialCategory.findUnique({ where: { id: String(id || "") } });
  if (!existing) throw new AppError("Marketplace category not found", 404);
  const data = {};
  if (body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (!name || name.length > 80) throw new AppError("Category name is required", 400);
    data.name = name;
    if (body.slug === undefined) {
      const slug = assertSlug(slugifyMarketplaceName(name));
      await assertUniqueSlug(slug, existing.id);
      data.slug = slug;
    }
  }
  if (body.slug !== undefined) {
    const slug = assertSlug(slugifyMarketplaceName(body.slug));
    await assertUniqueSlug(slug, existing.id);
    data.slug = slug;
  }
  const description = parseDescription(body.description);
  if (description !== Symbol.for("omit")) data.description = description;
  const icon = parseIcon(body.icon);
  if (icon !== Symbol.for("omit")) data.icon = icon;
  const imageUrl = parseImageUrl(body.imageUrl);
  if (imageUrl !== Symbol.for("omit")) data.imageUrl = imageUrl;
  const sortOrder = parseSortOrder(body.sortOrder);
  if (sortOrder !== Symbol.for("omit")) data.sortOrder = sortOrder;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  try {
    const row =
      Object.keys(data).length > 0
        ? await prisma.marketplaceMaterialCategory.update({
            where: { id: existing.id },
            data,
            include: { _count: { select: { branches: true } } },
          })
        : await prisma.marketplaceMaterialCategory.findUnique({
            where: { id: existing.id },
            include: { _count: { select: { branches: true } } },
          });
    return serializeCategory(row, { includeCount: true });
  } catch (err) {
    rethrowUnique(err);
  }
}

function normalizeCategoryIdList(categoryIds) {
  if (!Array.isArray(categoryIds)) {
    throw new AppError("categoryIds must be an array", 400);
  }
  const ids = [];
  for (const raw of categoryIds) {
    const id = String(raw || "").trim();
    if (!id) continue;
    if (!UUID_RE.test(id)) throw new AppError("Invalid marketplace category id", 400);
    ids.push(id);
  }
  return [...new Set(ids)];
}

/**
 * Replace the branch's marketplace category set.
 * activeOnly: supplier owners may assign only active categories. Admin may assign inactive ones.
 */
async function replaceBranchMarketplaceCategories(branchId, categoryIds, { activeOnly = false } = {}) {
  const ids = normalizeCategoryIdList(categoryIds);
  if (ids.length) {
    const rows = await prisma.marketplaceMaterialCategory.findMany({
      where: { id: { in: ids } },
    });
    if (rows.length !== ids.length) {
      throw new AppError("One or more marketplace categories were not found", 400);
    }
    if (activeOnly && rows.some((row) => row.isActive === false)) {
      throw new AppError("Suppliers can only assign active marketplace categories", 400);
    }
  }
  await prisma.$transaction([
    prisma.branchMarketplaceCategory.deleteMany({ where: { branchId: String(branchId) } }),
    ...(ids.length
      ? [
          prisma.branchMarketplaceCategory.createMany({
            data: ids.map((categoryId) => ({ branchId: String(branchId), categoryId })),
          }),
        ]
      : []),
  ]);
  return ids;
}

async function assignCategoriesForAdmin(supplierId, branchId, categoryIds) {
  const branch = await prisma.branch.findUnique({ where: { id: String(branchId || "") } });
  if (!branch || String(branch.supplierId) !== String(supplierId || "")) {
    throw new AppError("Branch not found", 404);
  }
  await replaceBranchMarketplaceCategories(branch.id, categoryIds, { activeOnly: false });
  return branch.id;
}

/**
 * Nearby filter. Missing categoryId means no filter.
 * Malformed id throws 400. Unknown or inactive category matches nothing (does not fall through).
 */
async function resolveNearbyCategoryFilter(categoryIdRaw) {
  const raw = categoryIdRaw != null ? String(categoryIdRaw).trim() : "";
  if (!raw) return { apply: false };
  if (!UUID_RE.test(raw)) throw new AppError("Invalid categoryId", 400);
  const cat = await prisma.marketplaceMaterialCategory.findUnique({ where: { id: raw } });
  if (!cat || cat.isActive === false) return { apply: true, matchNone: true };
  return { apply: true, categoryId: cat.id };
}

module.exports = {
  UUID_RE,
  MARKETPLACE_ICON_KEYS,
  slugifyMarketplaceName,
  serializeCategory,
  serializePublicCategory,
  listForAdmin,
  listActivePublic,
  createCategory,
  updateCategory,
  normalizeCategoryIdList,
  replaceBranchMarketplaceCategories,
  assignCategoriesForAdmin,
  resolveNearbyCategoryFilter,
};
