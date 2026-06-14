/**
 * Repair job_materials delivery rows where collection and destination addresses match.
 * Re-resolves collection from the supplier branch and destination from the parent job site.
 *
 * Run: node scripts/repair-courier-delivery-addresses.js
 */
require("dotenv").config();
const prisma = require("../src/config/prisma");
const materialOrderService = require("../src/services/materialOrder.service");

function normalizeAddressKey(address) {
  return String(address || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jobSiteAddressFromRow(job) {
  const loc = job?.locationDetails;
  if (loc && typeof loc === "object" && !Array.isArray(loc)) {
    const parts = [loc.address, loc.suburb, loc.area, loc.city].filter(Boolean);
    if (parts.length) return parts.join(", ");
  }
  return String(job?.location || "").trim() !== "UNKNOWN" ? String(job.location).trim() : "";
}

function jobSiteLocationFromRow(job) {
  const loc = job?.locationDetails;
  if (loc && typeof loc === "object" && !Array.isArray(loc)) {
    return loc;
  }
  return null;
}

async function main() {
  const rows = await prisma.deliveryRequest.findMany({
    where: { source: "job_materials" },
    include: {
      materialOrder: { select: { id: true, branchId: true, jobId: true, payload: true } },
    },
  });

  let repaired = 0;
  let skipped = 0;
  let failed = 0;

  for (const dr of rows) {
    const coll = dr.collectionPoint?.address;
    const dest = dr.destinationPoint?.address;
    if (!coll || !dest) continue;
    if (normalizeAddressKey(coll) !== normalizeAddressKey(dest)) continue;

    const mo = dr.materialOrder;
    if (!mo?.jobId) {
      console.warn(`[skip] ${dr.id}: no parent job on material order`);
      skipped += 1;
      continue;
    }

    const parentJob = await prisma.job.findUnique({
      where: { id: mo.jobId },
      select: { id: true, location: true, locationDetails: true, providerId: true },
    });
    if (!parentJob) {
      console.warn(`[skip] ${dr.id}: parent job ${mo.jobId} not found`);
      skipped += 1;
      continue;
    }

    const payload = mo.payload && typeof mo.payload === "object" ? mo.payload : {};
    const items = Array.isArray(payload.items) ? payload.items : [];

    try {
      const geo = await materialOrderService.resolveCourierDeliveryGeoPoints({
        storeOrderBranchId: mo.branchId,
        supplierBranchId: mo.branchId,
        materialsLines: items,
        jobSiteAddress: jobSiteAddressFromRow(parentJob),
        jobSiteLocation: jobSiteLocationFromRow(parentJob),
      });
      if (!geo) {
        console.warn(`[skip] ${dr.id}: could not resolve geo points`);
        skipped += 1;
        continue;
      }

      if (
        normalizeAddressKey(geo.collectionPoint.address) ===
        normalizeAddressKey(geo.destinationPoint.address)
      ) {
        console.warn(
          `[fail] ${dr.id}: branch address still matches job site — update branch ${mo.branchId}`
        );
        failed += 1;
        continue;
      }

      const geoPayload = {
        ...payload,
        collectionPoint: geo.collectionPoint,
        destinationPoint: geo.destinationPoint,
        materialBatch: {
          ...(payload.materialBatch && typeof payload.materialBatch === "object"
            ? payload.materialBatch
            : {}),
          pickupAddress: geo.pickupAddr,
          deliveryAddress: String(geo.destinationPoint.address || ""),
        },
      };

      await prisma.materialOrder.update({
        where: { id: mo.id },
        data: { payload: geoPayload },
      });

      await prisma.deliveryRequest.update({
        where: { id: dr.id },
        data: {
          collectionPoint: geo.collectionPoint,
          destinationPoint: geo.destinationPoint,
        },
      });

      if (dr.jobId) {
        const dest = geo.destinationPoint;
        const coll = geo.collectionPoint;
        await prisma.job.update({
          where: { id: dr.jobId },
          data: {
            location: dest.city || dest.address || "UNKNOWN",
            locationDetails: {
              address: dest.address,
              city: dest.city,
              area: dest.area,
              suburb: dest.suburb,
              coordinates: dest.coordinates,
              collection: coll,
              destination: dest,
            },
            measurements: {
              source: "MANUAL",
              values: {},
              collectionPoint: coll,
              destinationPoint: dest,
            },
          },
        });
      }

      console.log(`[repaired] ${dr.id} collection="${geo.collectionPoint.address}"`);
      repaired += 1;
    } catch (e) {
      console.error(`[error] ${dr.id}:`, e.message || e);
      failed += 1;
    }
  }

  console.log(
    JSON.stringify({
      event: "repair_courier_delivery_addresses_done",
      scanned: rows.length,
      repaired,
      skipped,
      failed,
    })
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
