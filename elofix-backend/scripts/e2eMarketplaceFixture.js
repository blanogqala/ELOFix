/**
 * Deterministic marketplace rows for Playwright.
 * Idempotent. Refuses production and any non-local database.
 * Not used by server startup or prisma/seed.js.
 */
const { Prisma } = require("@prisma/client");
const marketplace = require("../src/services/marketplaceMaterialCategory.service");
const { assertSafeE2eDatabase } = require("./e2eMarketplaceFixtureGuard");

const ADVISORY_LOCK_KEY = 872341001;

const CATEGORIES = [
  { name: "Paint", icon: "paint", sortOrder: 1, description: "Interior and exterior coatings" },
  { name: "Electrical", icon: "electrical", sortOrder: 2, description: "Cable, fittings, and lighting" },
  { name: "Plumbing", icon: "plumbing", sortOrder: 3, description: "Pipes, fittings, and fixtures" },
  { name: "Tiles & Flooring", icon: "tiles", sortOrder: 4, description: "Tiles, flooring, and adhesives" },
  { name: "Building Materials", icon: "building", sortOrder: 5, description: "Cement, bricks, and general building" },
];

const ORGS = [
  {
    email: "buco.demo@elofix.local",
    brandName: "BUCO",
    websiteUrl: "https://buco.example",
    branches: ["Bellville", "Brackenfell"],
  },
  {
    email: "builders.demo@elofix.local",
    brandName: "Builders",
    websiteUrl: "https://builders.example",
    branches: ["Bellville"],
  },
  {
    email: "tiles.demo@elofix.local",
    brandName: "Specialist Tile Store",
    websiteUrl: "https://specialist-tiles.example",
    branches: ["Specialist Tile Store"],
  },
];

const BRANCHES = [
  {
    orgEmail: "buco.demo@elofix.local",
    name: "Bellville",
    area: "Bellville",
    address: "Voortrekker Road, Bellville",
    latitude: -33.894,
    longitude: 18.629,
    branchPhone: "0215551001",
    branchEmail: "bellville@buco.example",
    websiteUrl: "https://buco.example/bellville",
    hasDelivery: true,
    categories: ["paint", "plumbing", "building-materials", "electrical", "tiles-and-flooring"],
    inventoryCategory: "interior paint",
    productName: "Interior paint",
    price: 249,
    unit: "L",
  },
  {
    orgEmail: "buco.demo@elofix.local",
    name: "Brackenfell",
    area: "Brackenfell",
    address: "Old Paarl Road, Brackenfell",
    latitude: -33.877,
    longitude: 18.7,
    branchPhone: "0215551002",
    branchEmail: "brackenfell@buco.example",
    hasDelivery: true,
    categories: ["paint", "electrical", "building-materials"],
    inventoryCategory: "interior paint",
    productName: "Interior paint",
    price: 249,
    unit: "L",
  },
  {
    orgEmail: "builders.demo@elofix.local",
    name: "Bellville",
    area: "Bellville",
    address: "Durban Road, Bellville",
    latitude: -33.9,
    longitude: 18.64,
    branchPhone: "0215552001",
    hasDelivery: true,
    categories: ["paint", "building-materials", "plumbing"],
    inventoryCategory: "interior paint",
    productName: "Interior paint",
    price: 249,
    unit: "L",
  },
  {
    orgEmail: "tiles.demo@elofix.local",
    name: "Specialist Tile Store",
    area: "Parow",
    address: "Voortrekker Road, Parow",
    latitude: -33.905,
    longitude: 18.585,
    branchPhone: "0215553001",
    websiteUrl: "https://specialist-tiles.example",
    hasDelivery: false,
    categories: ["tiles-and-flooring"],
    inventoryCategory: "floor tiles",
    productName: "Floor tile",
    price: 180,
    unit: "box",
  },
];

function sampleProduct(spec) {
  return {
    id: `e2e-${spec.orgEmail}-${spec.name}`.replace(/[^a-z0-9-]+/gi, "-").toLowerCase(),
    name: spec.productName,
    category: spec.inventoryCategory,
    price: spec.price,
    qualityTier: "medium",
    unit: spec.unit,
    inStock: true,
    quantity: 20,
  };
}

function withSampleProduct(existing, sample) {
  const list = Array.isArray(existing) ? existing.filter((row) => row && typeof row === "object") : [];
  if (list.some((row) => String(row.id) === sample.id)) return list;
  return [...list, sample];
}

async function upsertCategory(prisma, input) {
  const slug = marketplace.slugifyMarketplaceName(input.name);
  return prisma.marketplaceMaterialCategory.upsert({
    where: { slug },
    update: {
      name: input.name,
      icon: input.icon,
      description: input.description,
      sortOrder: input.sortOrder,
      isActive: true,
    },
    create: {
      name: input.name,
      slug,
      icon: input.icon,
      description: input.description,
      sortOrder: input.sortOrder,
      isActive: true,
    },
  });
}

async function seedE2eMarketplaceFixtures(prisma, env = process.env) {
  assertSafeE2eDatabase(env);
  await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(${ADVISORY_LOCK_KEY})`);
  try {
    const categories = {};
    for (const input of CATEGORIES) {
      const row = await upsertCategory(prisma, input);
      categories[row.slug] = row;
    }

    const suppliersByBranch = new Map();
    for (const org of ORGS) {
      const orgUser = await prisma.user.upsert({
        where: { email: org.email },
        update: { name: org.brandName, role: "SUPPLIER", blocked: false, deletedAt: null },
        create: {
          email: org.email,
          password: "not-a-login-hash",
          name: org.brandName,
          role: "SUPPLIER",
        },
      });
      let orgSupplier = await prisma.supplier.findFirst({ where: { userId: orgUser.id } });
      if (!orgSupplier) {
        orgSupplier = await prisma.supplier.create({
          data: {
            userId: orgUser.id,
            name: org.brandName,
            brandName: org.brandName,
            businessName: org.brandName,
            city: "Cape Town",
            websiteUrl: org.websiteUrl,
            phone: "0210001111",
          },
        });
      } else {
        orgSupplier = await prisma.supplier.update({
          where: { id: orgSupplier.id },
          data: {
            brandName: org.brandName,
            name: org.brandName,
            businessName: org.brandName,
            websiteUrl: org.websiteUrl,
            city: "Cape Town",
          },
        });
      }
      for (const branchName of org.branches) {
        suppliersByBranch.set(`${org.email}|${branchName}`, orgSupplier);
      }
    }

    for (const spec of BRANCHES) {
      const supplier = suppliersByBranch.get(`${spec.orgEmail}|${spec.name}`);
      const sample = sampleProduct(spec);
      const data = {
        address: spec.address,
        city: "Cape Town",
        area: spec.area,
        latitude: spec.latitude,
        longitude: spec.longitude,
        branchPhone: spec.branchPhone || null,
        branchEmail: spec.branchEmail || null,
        websiteUrl: spec.websiteUrl || null,
        hasDelivery: spec.hasDelivery,
        isActive: true,
        deliveryFee: new Prisma.Decimal(0),
      };
      let branch = await prisma.branch.findFirst({
        where: { supplierId: supplier.id, name: spec.name },
      });
      if (!branch) {
        branch = await prisma.branch.create({
          data: {
            supplierId: supplier.id,
            name: spec.name,
            products: [sample],
            ...data,
          },
        });
      } else {
        branch = await prisma.branch.update({
          where: { id: branch.id },
          data: {
            ...data,
            products: withSampleProduct(branch.products, sample),
          },
        });
      }
      await prisma.branchInventoryCategory.upsert({
        where: { branchId_name: { branchId: branch.id, name: spec.inventoryCategory } },
        update: { isActive: true, sortOrder: 0 },
        create: {
          branchId: branch.id,
          name: spec.inventoryCategory,
          isActive: true,
          sortOrder: 0,
        },
      });
      const categoryIds = spec.categories.map((slug) => {
        const row = categories[slug];
        if (!row) throw new Error(`Missing marketplace fixture category ${slug}`);
        return row.id;
      });
      await marketplace.replaceBranchMarketplaceCategories(branch.id, categoryIds, { activeOnly: true });
    }
  } finally {
    await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
  }
}

module.exports = {
  seedE2eMarketplaceFixtures,
};
