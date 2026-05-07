/**
 * After supplier→branch migration: map Job.materials[].supplierId and meta.storeOrders[].storeId
 * from legacy org/store id (Supplier.id) to Branch.id (default branch per supplier).
 *
 * Run: node scripts/backfill-job-branch-refs.js
 */
require("dotenv").config();
const prisma = require("../src/config/prisma");

/** Legacy materials/storeOrders used Supplier.id (= org id) as store key; map to default Branch.id. */
function orgIdToBranchId(branchBySupplier, orgId) {
  const k = String(orgId || "").trim();
  if (!k) return null;
  return branchBySupplier.get(k) || null;
}

async function main() {
  const branches = await prisma.branch.findMany({
    select: { id: true, supplierId: true },
    orderBy: { createdAt: "asc" },
  });
  const branchBySupplier = new Map();
  for (const b of branches) {
    if (!branchBySupplier.has(b.supplierId)) {
      branchBySupplier.set(b.supplierId, b.id);
    }
  }

  const jobs = await prisma.job.findMany({
    select: { id: true, materials: true, meta: true },
  });

  let updated = 0;
  for (const job of jobs) {
    let materialsDirty = false;
    const materials = Array.isArray(job.materials) ? [...job.materials] : [];
    for (let i = 0; i < materials.length; i++) {
      const m = materials[i];
      if (!m || typeof m !== "object") continue;
      const sid = String(m.supplierId || "").trim();
      if (!sid) continue;
      const bid = orgIdToBranchId(branchBySupplier, sid);
      if (bid && bid !== sid) {
        materials[i] = { ...m, supplierId: bid, branchId: bid };
        materialsDirty = true;
      } else if (bid) {
        materials[i] = { ...m, branchId: bid };
        materialsDirty = true;
      }
    }

    let metaDirty = false;
    let meta = job.meta && typeof job.meta === "object" ? { ...job.meta } : {};
    const storeOrders = Array.isArray(meta.storeOrders) ? [...meta.storeOrders] : [];
    for (let i = 0; i < storeOrders.length; i++) {
      const o = storeOrders[i];
      if (!o || typeof o !== "object") continue;
      const sid = String(o.storeId || "").trim();
      if (!sid) continue;
      const bid = orgIdToBranchId(branchBySupplier, sid);
      if (bid && bid !== sid) {
        storeOrders[i] = { ...o, storeId: bid };
        metaDirty = true;
      }
    }
    if (metaDirty) {
      meta = { ...meta, storeOrders };
    }

    if (materialsDirty || metaDirty) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          ...(materialsDirty ? { materials } : {}),
          ...(metaDirty ? { meta } : {}),
        },
      });
      updated += 1;
    }
  }

  console.log(`backfill-job-branch-refs: updated ${updated} job(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
