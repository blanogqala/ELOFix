/**
 * Branch inventory category catalogue — authorization + public metadata.
 * Run: node tests/inventoryCategory.catalogue.test.js
 */
require("dotenv").config();
const assert = require("assert");
const { randomUUID } = require("crypto");
const prisma = require("../src/config/prisma");
const supplierService = require("../src/services/supplier.service");
const branchService = require("../src/services/branch.service");

function skipIfNoDb() {
  if (!process.env.DATABASE_URL) {
    console.log("inventoryCategory.catalogue.test.js: skip (DATABASE_URL not set)");
    return true;
  }
  return false;
}

async function main() {
  if (skipIfNoDb()) return;

  const suffix = randomUUID().slice(0, 8);
  const supplierUser = await prisma.user.create({
    data: {
      email: `invcat.sup.${suffix}@example.com`,
      password: "x",
      name: "Cat Supplier",
      role: "SUPPLIER",
    },
  });
  const otherUser = await prisma.user.create({
    data: {
      email: `invcat.other.${suffix}@example.com`,
      password: "x",
      name: "Other Supplier",
      role: "SUPPLIER",
    },
  });
  const supplier = await prisma.supplier.create({
    data: { userId: supplierUser.id, name: `Sup ${suffix}`, businessName: `Biz ${suffix}` },
  });
  const otherSupplier = await prisma.supplier.create({
    data: { userId: otherUser.id, name: `Other ${suffix}`, businessName: `OtherBiz ${suffix}` },
  });
  const branch = await prisma.branch.create({
    data: {
      id: randomUUID(),
      supplierId: supplier.id,
      name: `Branch ${suffix}`,
      address: "1 Test",
      products: [],
    },
  });
  const otherBranch = await prisma.branch.create({
    data: {
      id: randomUUID(),
      supplierId: supplier.id,
      name: `OtherBranch ${suffix}`,
      products: [],
    },
  });
  const foreignBranch = await prisma.branch.create({
    data: {
      id: randomUUID(),
      supplierId: otherSupplier.id,
      name: `Foreign ${suffix}`,
      products: [],
    },
  });
  const staff = await prisma.branchUser.create({
    data: {
      id: randomUUID(),
      branchId: branch.id,
      email: `invcat.staff.${suffix}@example.com`,
      password: "x",
      role: "STAFF",
    },
  });
  const otherStaff = await prisma.branchUser.create({
    data: {
      id: randomUUID(),
      branchId: otherBranch.id,
      email: `invcat.staff2.${suffix}@example.com`,
      password: "x",
      role: "STAFF",
    },
  });

  const supplierActor = { userId: supplierUser.id, role: "SUPPLIER" };
  const staffActor = {
    userId: staff.id,
    role: "BRANCH_STAFF",
    branchId: branch.id,
    supplierOrgId: supplier.id,
  };
  const otherStaffActor = {
    userId: otherStaff.id,
    role: "BRANCH_STAFF",
    branchId: otherBranch.id,
    supplierOrgId: supplier.id,
  };

  try {
    const created = await supplierService.createInventoryCategoryForPortal(
      supplierActor,
      "Tiles",
      branch.id,
      { imageUrl: "/api/files/category-img" }
    );
    assert.strictEqual(created.name, "tiles");
    assert.strictEqual(created.imageUrl, "/api/files/category-img");
    assert.ok(created.id);
    assert.strictEqual(created.isActive, true);

    const listed = await supplierService.listInventoryCategoriesForPortal(supplierActor, branch.id);
    const tiles = listed.find((c) => c.name === "tiles");
    assert.ok(tiles, "created category should list");
    assert.strictEqual(tiles.imageUrl, "/api/files/category-img");

    const withoutImage = await prisma.branchInventoryCategory.create({
      data: { branchId: branch.id, name: "paint" },
    });
    const listed2 = await supplierService.listInventoryCategoriesForPortal(supplierActor, branch.id);
    const paint = listed2.find((c) => c.name === "paint");
    assert.ok(paint, "existing category without image still returns");
    assert.ok(!paint.imageUrl);

    const dup = await supplierService.createInventoryCategoryForPortal(supplierActor, "TILES", branch.id);
    assert.strictEqual(dup.name, "tiles");
    assert.strictEqual(dup.id, created.id);

    const staffCreated = await supplierService.createInventoryCategoryForPortal(
      staffActor,
      "Cement",
      branch.id
    );
    assert.strictEqual(staffCreated.name, "cement");

    let staffForbidden = false;
    try {
      await supplierService.createInventoryCategoryForPortal(staffActor, "Nope", otherBranch.id);
    } catch (err) {
      staffForbidden = err.statusCode === 403 || err.status === 403;
    }
    assert.ok(staffForbidden, "branch staff cannot create category on another assigned branch");

    let otherStaffForbidden = false;
    try {
      await supplierService.createInventoryCategoryForPortal(otherStaffActor, "Nope", branch.id);
    } catch (err) {
      otherStaffForbidden = err.statusCode === 403 || err.status === 403;
    }
    assert.ok(otherStaffForbidden, "other branch staff cannot access this branch");

    let foreignForbidden = false;
    try {
      await supplierService.createInventoryCategoryForPortal(supplierActor, "Nope", foreignBranch.id);
    } catch (err) {
      foreignForbidden = err.statusCode === 403 || err.statusCode === 404;
    }
    assert.ok(foreignForbidden, "supplier cannot create category on another org branch");

    const patched = await supplierService.patchInventoryCategoryForPortal(
      supplierActor,
      created.id,
      { imageUrl: "/api/files/updated-cat" },
      branch.id
    );
    assert.strictEqual(patched.imageUrl, "/api/files/updated-cat");

    await supplierService.upsertSupplierProductForPortal(supplierActor, {
      branchId: branch.id,
      name: "White Tile",
      category: "Tiles",
      price: 50,
      unit: "box",
      qualityTier: "medium",
      inStock: true,
      quantity: 4,
    });
    const afterProduct = await prisma.branchInventoryCategory.findFirst({
      where: { branchId: branch.id, name: "tiles" },
    });
    assert.ok(afterProduct, "product creation still ensures category row");

    const reloaded = await prisma.branch.findUnique({
      where: { id: branch.id },
      include: branchService.INVENTORY_CATEGORIES_INCLUDE,
    });
    const pub = branchService.branchToPublicApi(reloaded, supplier, { omitInternal: true });
    assert.ok(Array.isArray(pub.inventoryCategories));
    const pubTiles = pub.inventoryCategories.find((c) => c.name === "tiles");
    assert.ok(pubTiles, "public branch payload exposes inventory category metadata");
    assert.strictEqual(pubTiles.imageUrl, "/api/files/updated-cat");
    assert.ok(pubTiles.id);
    assert.ok(!("isActive" in pubTiles), "public payload omits internal isActive");

    const emptyPub = branchService.branchToPublicApi(
      { id: "x", products: [], latitude: null, longitude: null, hasDelivery: true, deliveryFee: 0, name: "X" },
      { id: supplier.id, name: "S", brandName: null, logo: null, phone: null, businessName: null },
      { omitInternal: true }
    );
    assert.deepStrictEqual(emptyPub.inventoryCategories, []);

    const stored = await prisma.branch.findUnique({ where: { id: branch.id } });
    const currentProducts = Array.isArray(stored.products) ? [...stored.products] : [];
    await prisma.branchInventoryCategory.create({
      data: { branchId: branch.id, name: "hidden-cat", isActive: false },
    });
    await prisma.branch.update({
      where: { id: branch.id },
      data: {
        products: [
          ...currentProducts,
          {
            id: randomUUID(),
            name: "Secret SKU",
            category: "hidden-cat",
            price: 9,
            unit: "bag",
            qualityTier: "low",
            inStock: true,
            quantity: 2,
          },
          {
            id: randomUUID(),
            name: "Legacy Pipe",
            category: "orphan-legacy",
            price: 12,
            unit: "m",
            qualityTier: "medium",
            inStock: true,
            quantity: 1,
          },
        ],
      },
    });
    const reloaded2 = await prisma.branch.findUnique({
      where: { id: branch.id },
      include: branchService.INVENTORY_CATEGORIES_INCLUDE,
    });
    assert.ok(
      Array.isArray(reloaded2.products) && reloaded2.products.some((p) => p.name === "Secret SKU"),
      "stored JSON still contains inactive-category product"
    );

    const pub2 = branchService.branchToPublicApi(reloaded2, supplier, { omitInternal: true });
    assert.ok(
      pub2.inventoryCategories.find((c) => c.name === "tiles"),
      "A: public sees active category"
    );
    assert.ok(
      pub2.products.some((p) => p.name === "White Tile"),
      "A: public sees product in active category"
    );
    assert.ok(
      !pub2.inventoryCategories.some((c) => c.name === "hidden-cat"),
      "B: public omits inactive category metadata"
    );
    assert.ok(
      !pub2.products.some((p) => p.name === "Secret SKU"),
      "B: public omits product in inactive category"
    );
    assert.ok(
      pub2.products.some((p) => p.name === "Legacy Pipe"),
      "C: public still receives legacy product with no category row"
    );

    const afterPublic = await prisma.branch.findUnique({ where: { id: branch.id } });
    assert.ok(
      Array.isArray(afterPublic.products) && afterPublic.products.some((p) => p.name === "Secret SKU"),
      "public mapping must not mutate stored Branch.products JSON"
    );

    const internal = branchService.branchToPublicApi(reloaded2, supplier, { omitInternal: false });
    const hiddenMeta = internal.inventoryCategories.find((c) => c.name === "hidden-cat");
    assert.ok(hiddenMeta, "D: internal still receives inactive category");
    assert.strictEqual(hiddenMeta.isActive, false);
    assert.ok(
      internal.products.some((p) => p.name === "Secret SKU"),
      "D: internal still receives inactive-category product"
    );

    const listedInternal = await supplierService.listInventoryCategoriesForPortal(supplierActor, branch.id);
    assert.ok(
      listedInternal.find((c) => c.name === "hidden-cat" && c.isActive === false),
      "D: supplier list still includes inactive category"
    );

    const storeProducts = await branchService.getBranchProductsById(branch.id);
    assert.ok(!storeProducts.some((p) => p.name === "Secret SKU"), "public store products omit inactive category");
    assert.ok(storeProducts.some((p) => p.name === "Legacy Pipe"), "public store products keep legacy categories");

    console.log("inventoryCategory.catalogue.test.js: all tests passed");
  } finally {
    await prisma.branchInventoryCategory.deleteMany({
      where: { branchId: { in: [branch.id, otherBranch.id, foreignBranch.id] } },
    });
    await prisma.branchUser.deleteMany({ where: { id: { in: [staff.id, otherStaff.id] } } });
    await prisma.branch.deleteMany({ where: { id: { in: [branch.id, otherBranch.id, foreignBranch.id] } } });
    await prisma.supplier.deleteMany({ where: { id: { in: [supplier.id, otherSupplier.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [supplierUser.id, otherUser.id] } } });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch (_) {
      /* ignore */
    }
  });
