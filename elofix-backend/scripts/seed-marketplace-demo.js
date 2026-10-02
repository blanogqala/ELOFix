/**
 * Idempotent development seed for marketplace category discovery.
 * Upserts categories and example Cape Town branches. Does not delete existing data.
 *
 * Usage (from elofix-backend): node scripts/seed-marketplace-demo.js
 */
require("dotenv").config();
const prisma = require("../src/config/prisma");
const marketplace = require("../src/services/marketplaceMaterialCategory.service");

const CATEGORIES = [
  { name: "Paint", icon: "paint", sortOrder: 1, description: "Interior and exterior coatings" },
  { name: "Electrical", icon: "electrical", sortOrder: 2, description: "Cable, fittings, and lighting" },
  { name: "Plumbing", icon: "plumbing", sortOrder: 3, description: "Pipes, fittings, and fixtures" },
  { name: "Tiles & Flooring", icon: "tiles", sortOrder: 4, description: "Tiles, flooring, and adhesives" },
  { name: "Building Materials", icon: "building", sortOrder: 5, description: "Cement, bricks, and general building" },
];

async function upsertCategory(input) {
  const slug = marketplace.slugifyMarketplaceName(input.name);
  const existing = await prisma.marketplaceMaterialCategory.findUnique({ where: { slug } });
  if (existing) {
    return prisma.marketplaceMaterialCategory.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        icon: input.icon,
        description: input.description,
        sortOrder: input.sortOrder,
        isActive: true,
      },
    });
  }
  return prisma.marketplaceMaterialCategory.create({
    data: {
      name: input.name,
      slug,
      icon: input.icon,
      description: input.description,
      sortOrder: input.sortOrder,
      isActive: true,
    },
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const categories = {};
  for (const input of CATEGORIES) {
    const row = await upsertCategory(input);
    categories[row.slug] = row;
  }

  const orgs = [
    {
      email: "buco.demo@elofix.local",
      brandName: "BUCO",
      websiteUrl: "https://buco.example",
      branches: ["Bellville", "Brackenfell"],
      // lookup key is email + branch name so two brands can both have a Bellville branch
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

  const branchSpecs = [
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
    },
  ];

  const suppliersByBranch = new Map();
  for (const org of orgs) {
    let orgUser = await prisma.user.findUnique({ where: { email: org.email } });
    if (!orgUser) {
      orgUser = await prisma.user.create({
        data: {
          email: org.email,
          password: "not-a-login-hash",
          name: org.brandName,
          role: "SUPPLIER",
        },
      });
    }
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
    } else if (orgSupplier.brandName !== org.brandName || orgSupplier.websiteUrl !== org.websiteUrl) {
      orgSupplier = await prisma.supplier.update({
        where: { id: orgSupplier.id },
        data: { brandName: org.brandName, name: org.brandName, businessName: org.brandName, websiteUrl: org.websiteUrl },
      });
    }
    for (const branchName of org.branches) suppliersByBranch.set(`${org.email}|${branchName}`, orgSupplier);
  }

  for (const spec of branchSpecs) {
    const supplier = suppliersByBranch.get(`${spec.orgEmail}|${spec.name}`);
    let branch = await prisma.branch.findFirst({
      where: { supplierId: supplier.id, name: spec.name },
    });
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
    };
    const sampleProducts = [
      {
        id: `demo-${spec.orgEmail}-${spec.name}`.replace(/[^a-z0-9-]+/gi, "-").toLowerCase(),
        name: spec.name === "Specialist Tile Store" ? "Floor tile" : "Interior paint",
        category: spec.name === "Specialist Tile Store" ? "floor tiles" : "interior paint",
        price: spec.name === "Specialist Tile Store" ? 180 : 249,
        qualityTier: "medium",
        unit: spec.name === "Specialist Tile Store" ? "box" : "L",
        inStock: true,
        quantity: 20,
      },
    ];
    if (!branch) {
      branch = await prisma.branch.create({
        data: {
          supplierId: supplier.id,
          name: spec.name,
          products: sampleProducts,
          ...data,
        },
      });
    } else {
      const existingProducts = Array.isArray(branch.products) ? branch.products : [];
      branch = await prisma.branch.update({
        where: { id: branch.id },
        data: {
          ...data,
          ...(existingProducts.length === 0 ? { products: sampleProducts } : {}),
        },
      });
    }
    const categoryIds = spec.categories.map((slug) => categories[slug].id);
    await marketplace.replaceBranchMarketplaceCategories(branch.id, categoryIds, { activeOnly: true });
    console.log(`${supplier.brandName} / ${spec.name}: ${spec.categories.join(", ")}`);
  }

  console.log("seed-marketplace-demo: categories and example branches are ready");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
