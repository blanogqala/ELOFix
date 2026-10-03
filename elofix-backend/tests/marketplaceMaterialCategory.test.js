/**
 * Marketplace material categories — taxonomy, assignment, nearby filter, public projection.
 * Run: node tests/marketplaceMaterialCategory.test.js
 */
require("dotenv").config();
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { parseOptionalWebsiteUrl } = require("../src/utils/websiteUrl");
const marketplace = require("../src/services/marketplaceMaterialCategory.service");

function assertThrowsStatus(fn, status) {
  assert.throws(fn, (err) => err && err.statusCode === status);
}

async function assertRejectsStatus(promise, status) {
  try {
    await promise;
    assert.fail(`expected status ${status}`);
  } catch (err) {
    assert.strictEqual(err.statusCode, status, err.message);
  }
}

function testWebsiteAndRoutes() {
  assert.strictEqual(parseOptionalWebsiteUrl(undefined), Symbol.for("omit"));
  assert.strictEqual(parseOptionalWebsiteUrl(""), null);
  assert.strictEqual(parseOptionalWebsiteUrl("https://buco.example/store"), "https://buco.example/store");
  assertThrowsStatus(() => parseOptionalWebsiteUrl("javascript:alert(1)"), 400);
  assertThrowsStatus(() => parseOptionalWebsiteUrl("https://user:pass@buco.example"), 400);
  assertThrowsStatus(() => parseOptionalWebsiteUrl("ftp://buco.example"), 400);

  const adminSrc = fs.readFileSync(path.join(__dirname, "../src/routes/admin.routes.js"), "utf8");
  assert.ok(adminSrc.includes("router.use(authenticate)"));
  assert.ok(adminSrc.includes('authorizeRoles(["ADMIN"])'));
  assert.ok(adminSrc.includes("/marketplace-material-categories"));
  assert.ok(
    adminSrc.indexOf("/suppliers/:supplierId/branches/:branchId/marketplace-categories") <
      adminSrc.indexOf('router.get("/suppliers/:supplierId"')
  );
  const publicSrc = fs.readFileSync(
    path.join(__dirname, "../src/routes/marketplaceMaterialCategory.routes.js"),
    "utf8"
  );
  assert.ok(!publicSrc.includes("authenticate"));
  assert.strictEqual(marketplace.slugifyMarketplaceName("Tiles & Flooring"), "tiles-and-flooring");

  const inactive = { id: "inactive-id", isActive: false };
  const active = { id: "active-id", isActive: true };
  assert.deepStrictEqual(
    marketplace.newlyAssignedInactiveCategoryIds([inactive, active], []),
    ["inactive-id"]
  );
  assert.deepStrictEqual(
    marketplace.newlyAssignedInactiveCategoryIds([inactive, active], ["inactive-id"]),
    []
  );
}

async function main() {
  testWebsiteAndRoutes();
  if (!process.env.DATABASE_URL) {
    console.log("marketplaceMaterialCategory.test.js: DB tests skipped (DATABASE_URL not set)");
    console.log("marketplaceMaterialCategory.test.js: website and route checks passed");
    return;
  }

  const prisma = require("../src/config/prisma");
  const branchService = require("../src/services/branch.service");
  const supplierService = require("../src/services/supplier.service");
  const suffix = randomUUID().slice(0, 8);
  const created = {
    userIds: [],
    supplierIds: [],
    branchIds: [],
    categoryIds: [],
    branchUserIds: [],
  };

  try {
    const paint = await marketplace.createCategory({ name: `Paint ${suffix}`, icon: "paint", sortOrder: 1 });
    const plumbing = await marketplace.createCategory({
      name: `Plumbing ${suffix}`,
      icon: "plumbing",
      sortOrder: 2,
    });
    const inactive = await marketplace.createCategory({
      name: `Hidden ${suffix}`,
      icon: "tools",
      isActive: false,
    });
    created.categoryIds.push(paint.id, plumbing.id, inactive.id);

    await assertRejectsStatus(
      marketplace.createCategory({ name: `Paint ${suffix}` }),
      409
    );

    const renamed = await marketplace.updateCategory(paint.id, { description: "Coatings", sortOrder: 4 });
    assert.strictEqual(renamed.description, "Coatings");
    assert.strictEqual(renamed.sortOrder, 4);
    const deactivated = await marketplace.updateCategory(inactive.id, { isActive: false });
    assert.strictEqual(deactivated.isActive, false);

    const supplierUser = await prisma.user.create({
      data: {
        email: `mmc.sup.${suffix}@example.com`,
        password: "x",
        name: "MMC Supplier",
        role: "SUPPLIER",
      },
    });
    const otherUser = await prisma.user.create({
      data: {
        email: `mmc.other.${suffix}@example.com`,
        password: "x",
        name: "Other",
        role: "SUPPLIER",
      },
    });
    created.userIds.push(supplierUser.id, otherUser.id);

    const supplier = await prisma.supplier.create({
      data: {
        userId: supplierUser.id,
        name: `BUCO ${suffix}`,
        brandName: "BUCO",
        businessName: `BUCO ${suffix}`,
        websiteUrl: "https://supplier.example",
        phone: "0210000000",
      },
    });
    const otherSupplier = await prisma.supplier.create({
      data: { userId: otherUser.id, name: `Other ${suffix}`, businessName: `Other ${suffix}` },
    });
    created.supplierIds.push(supplier.id, otherSupplier.id);

    const near = await prisma.branch.create({
      data: {
        supplierId: supplier.id,
        name: `Bellville ${suffix}`,
        address: "1 Voortrekker",
        city: "Cape Town",
        area: "Bellville",
        branchPhone: "0215550101",
        branchEmail: `bellville.${suffix}@example.com`,
        latitude: -33.89,
        longitude: 18.63,
        hasDelivery: true,
        products: [{ id: "p1", name: "Interior paint", category: "paint", price: 10, unit: "L", inStock: true }],
        isActive: true,
      },
    });
    const farther = await prisma.branch.create({
      data: {
        supplierId: supplier.id,
        name: `Brackenfell ${suffix}`,
        city: "Cape Town",
        area: "Brackenfell",
        latitude: -33.86,
        longitude: 18.7,
        websiteUrl: "https://branch.example/brackenfell",
        hasDelivery: false,
        products: [],
        isActive: true,
      },
    });
    const uncategorized = await prisma.branch.create({
      data: {
        supplierId: supplier.id,
        name: `Plain ${suffix}`,
        city: "Cape Town",
        area: "Bellville",
        latitude: -33.891,
        longitude: 18.631,
        products: [],
        isActive: true,
      },
    });
    const inactiveBranch = await prisma.branch.create({
      data: {
        supplierId: supplier.id,
        name: `Closed ${suffix}`,
        city: "Cape Town",
        area: "Bellville",
        latitude: -33.892,
        longitude: 18.632,
        products: [],
        isActive: false,
      },
    });
    const inland = await prisma.branch.create({
      data: {
        supplierId: supplier.id,
        name: `Sandton ${suffix}`,
        city: "Johannesburg",
        area: "Sandton",
        latitude: -26.107,
        longitude: 28.056,
        products: [],
        isActive: true,
      },
    });
    created.branchIds.push(near.id, farther.id, uncategorized.id, inactiveBranch.id, inland.id);

    await marketplace.replaceBranchMarketplaceCategories(near.id, [paint.id, plumbing.id], { activeOnly: true });
    await marketplace.replaceBranchMarketplaceCategories(farther.id, [paint.id], { activeOnly: true });
    await marketplace.replaceBranchMarketplaceCategories(inland.id, [paint.id], { activeOnly: true });
    await marketplace.assignCategoriesForAdmin(supplier.id, inactiveBranch.id, [paint.id, inactive.id]);

    await assertRejectsStatus(
      marketplace.replaceBranchMarketplaceCategories(near.id, [inactive.id], { activeOnly: true }),
      400
    );
    await assertRejectsStatus(
      branchService.updateBranchForSupplierUser(supplierUser.id, near.id, {
        name: `Should Not Stick ${suffix}`,
        marketplaceCategoryIds: [inactive.id],
      }),
      400
    );
    const nearAfterReject = await prisma.branch.findUnique({ where: { id: near.id } });
    assert.strictEqual(nearAfterReject.name, `Bellville ${suffix}`);

    const adminAssigned = await marketplace.assignCategoriesForAdmin(supplier.id, near.id, [paint.id, plumbing.id, inactive.id]);
    assert.strictEqual(adminAssigned, near.id);
    const keptName = `Bellville Kept ${suffix}`;
    const kept = await branchService.updateBranchForSupplierUser(supplierUser.id, near.id, {
      name: keptName,
      marketplaceCategoryIds: [paint.id, plumbing.id, inactive.id],
    });
    assert.strictEqual(kept.name, keptName);
    assert.ok(kept.marketplaceCategories.some((row) => row.id === inactive.id && row.isActive === false));
    await marketplace.replaceBranchMarketplaceCategories(near.id, [paint.id, plumbing.id], { activeOnly: true });

    const listed = await marketplace.listForAdmin();
    const paintRow = listed.find((row) => row.id === paint.id);
    assert.ok(paintRow.branchCount >= 2, "category counts branches");

    const publicCats = await marketplace.listActivePublic();
    assert.ok(publicCats.some((row) => row.id === paint.id));
    assert.ok(!publicCats.some((row) => row.id === inactive.id));
    assert.ok(!("isActive" in publicCats[0]) || publicCats.every((row) => row.isActive === undefined));

    const query = { city: "Bellville", lat: -33.894, lng: 18.629 };
    const unfiltered = await branchService.listBranchesForLocation(query);
    const unfilteredIds = unfiltered.map((row) => row.id);
    assert.ok(unfilteredIds.includes(near.id));
    assert.ok(unfilteredIds.includes(uncategorized.id), "uncategorized branches stay in unfiltered nearby");
    assert.ok(!unfilteredIds.includes(inactiveBranch.id), "inactive branches stay excluded");
    assert.ok(!unfilteredIds.includes(inland.id), "other metros stay excluded");

    const filtered = await branchService.listBranchesForLocation({ ...query, categoryId: paint.id });
    const filteredIds = filtered.map((row) => row.id);
    assert.deepStrictEqual(
      filteredIds.filter((id) => created.branchIds.includes(id)),
      [near.id, farther.id]
    );
    assert.ok(filtered[0].distanceKm <= filtered[1].distanceKm, "nearest first");
    assert.ok(!filteredIds.includes(uncategorized.id));
    assert.ok(!filteredIds.includes(inactiveBranch.id));

    const metroOnly = await branchService.listBranchesForLocation({ city: "Bellville", categoryId: paint.id });
    assert.ok(metroOnly.some((row) => row.id === near.id));
    assert.ok(!metroOnly.some((row) => row.id === inland.id));

    const inactiveFilter = await branchService.listBranchesForLocation({ ...query, categoryId: inactive.id });
    assert.deepStrictEqual(inactiveFilter, []);
    await assertRejectsStatus(
      branchService.listBranchesForLocation({ ...query, categoryId: "not-a-uuid" }),
      400
    );

    const loaded = await branchService.getBranchByIdWithSupplier(near.id);
    const pub = branchService.branchToPublicApi(loaded, loaded.supplier, { omitInternal: true });
    assert.ok(pub.marketplaceCategories.some((row) => row.id === paint.id));
    assert.ok(pub.marketplaceCategories.some((row) => row.id === plumbing.id));
    assert.ok(!pub.marketplaceCategories.some((row) => row.id === inactive.id));
    assert.strictEqual(pub.websiteUrl, "https://supplier.example");
    assert.strictEqual(pub.phone, "0215550101");
    assert.strictEqual(pub.contactEmail, `bellville.${suffix}@example.com`);
    for (const key of ["userId", "password", "accountNumber", "bankName", "withdrawalProfile"]) {
      assert.ok(!(key in pub), `public branch must not expose ${key}`);
    }

    const fartherLoaded = await branchService.getBranchByIdWithSupplier(farther.id);
    const fartherPub = branchService.branchToPublicApi(fartherLoaded, fartherLoaded.supplier, { omitInternal: true });
    assert.strictEqual(fartherPub.websiteUrl, "https://branch.example/brackenfell");

    await assertRejectsStatus(
      branchService.updateBranchForSupplierUser(otherUser.id, near.id, { name: "Hijack" }),
      403
    );

    const staff = await prisma.branchUser.create({
      data: {
        branchId: near.id,
        email: `mmc.staff.${suffix}@example.com`,
        password: "x",
        role: "STAFF",
      },
    });
    created.branchUserIds.push(staff.id);
    await assertRejectsStatus(
      supplierService.patchBranchForBranchStaff(staff.id, { marketplaceCategoryIds: [paint.id] }),
      403
    );
    const staffProfile = await supplierService.patchBranchForBranchStaff(staff.id, {
      websiteUrl: "https://staff.example/branch",
    });
    assert.ok(staffProfile.branches[0].websiteUrl.includes("staff.example"));

    console.log("marketplaceMaterialCategory.test.js: all tests passed");
  } finally {
    const prisma = require("../src/config/prisma");
    if (created.branchIds.length) {
      await prisma.branchMarketplaceCategory.deleteMany({ where: { branchId: { in: created.branchIds } } });
      await prisma.branchUser.deleteMany({ where: { branchId: { in: created.branchIds } } });
      await prisma.branch.deleteMany({ where: { id: { in: created.branchIds } } });
    }
    if (created.categoryIds.length) {
      await prisma.marketplaceMaterialCategory.deleteMany({ where: { id: { in: created.categoryIds } } });
    }
    if (created.supplierIds.length) {
      await prisma.supplier.deleteMany({ where: { id: { in: created.supplierIds } } });
    }
    if (created.userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
    }
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
