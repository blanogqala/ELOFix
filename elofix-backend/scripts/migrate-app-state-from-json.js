/**
 * One-time import from legacy data/app-state.json into PostgreSQL.
 * Run AFTER: npx prisma migrate deploy && npx prisma generate
 *
 * Usage: node scripts/migrate-app-state-from-json.js
 */
require("dotenv").config();
const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const prisma = require("../src/config/prisma");
const { normalizeMeta } = require("../src/services/jobMeta.service");

const DATA_FILE = path.join(__dirname, "..", "data", "app-state.json");

async function readLegacyState() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") {
      console.log("No data/app-state.json found — nothing to migrate.");
      return null;
    }
    throw e;
  }
}

async function main() {
  const state = await readLegacyState();
  if (!state || typeof state !== "object") return;

  const jobsMeta = state.jobsMeta && typeof state.jobsMeta === "object" ? state.jobsMeta : {};
  let jobsUpdated = 0;
  for (const [jobId, meta] of Object.entries(jobsMeta)) {
    const exists = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
    if (!exists) continue;
    await prisma.job.update({
      where: { id: jobId },
      data: { meta: normalizeMeta(meta) },
    });
    jobsUpdated += 1;
  }
  console.log(`Migrated meta for ${jobsUpdated} jobs.`);

  const notificationsByUser = state.notificationsByUser || {};
  let notifCount = 0;
  for (const [userId, list] of Object.entries(notificationsByUser)) {
    if (!Array.isArray(list)) continue;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) continue;
    for (const n of list) {
      if (!n || typeof n !== "object") continue;
      await prisma.notification.create({
        data: {
          id: n.id || randomUUID(),
          userId,
          type: String(n.type || "job_completed"),
          title: String(n.title || "Notification"),
          message: String(n.message || ""),
          read: Boolean(n.read),
          jobId: n.jobId || null,
          createdAt: n.createdAt ? new Date(n.createdAt) : new Date(),
        },
      });
      notifCount += 1;
    }
  }
  console.log(`Migrated ${notifCount} notifications.`);

  const cardsByUser = state.cardsByUser || {};
  let cardCount = 0;
  for (const [userId, cards] of Object.entries(cardsByUser)) {
    if (!Array.isArray(cards)) continue;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) continue;
    for (const c of cards) {
      if (!c || typeof c !== "object") continue;
      await prisma.savedCard.create({
        data: {
          id: c.id || randomUUID(),
          userId,
          last4: String(c.last4 || "0000"),
          brand: String(c.brand || "visa"),
          expiryMonth: Number(c.expiryMonth || 1),
          expiryYear: Number(c.expiryYear || new Date().getFullYear()),
          isDefault: Boolean(c.isDefault),
        },
      });
      cardCount += 1;
    }
  }
  console.log(`Migrated ${cardCount} saved cards.`);

  const invoices = Array.isArray(state.invoices) ? state.invoices : [];
  let invCount = 0;
  for (const inv of invoices) {
    if (!inv || typeof inv !== "object" || !inv.userId) continue;
    const user = await prisma.user.findUnique({ where: { id: String(inv.userId) } });
    if (!user) continue;
    await prisma.invoice.create({
      data: {
        id: inv.id || randomUUID(),
        userId: String(inv.userId),
        jobId: inv.jobId || null,
        payload: inv,
        createdAt: inv.createdAt ? new Date(inv.createdAt) : new Date(),
      },
    });
    invCount += 1;
  }
  console.log(`Migrated ${invCount} invoices.`);

  const suppliers = Array.isArray(state.suppliers) ? state.suppliers : [];
  for (const s of suppliers) {
    if (!s || !s.id) continue;
    await prisma.supplier.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        name: String(s.name || "Supplier"),
        logo: s.logo || null,
        hasDelivery: s.hasDelivery !== false,
        deliveryFee: Number(s.deliveryFee || 0),
        products: Array.isArray(s.products) ? s.products : [],
      },
      update: {
        name: String(s.name || "Supplier"),
        logo: s.logo || null,
        hasDelivery: s.hasDelivery !== false,
        deliveryFee: Number(s.deliveryFee || 0),
        products: Array.isArray(s.products) ? s.products : [],
      },
    });
  }
  console.log(`Migrated ${suppliers.length} suppliers.`);

  const materialOrders = Array.isArray(state.materialOrders) ? state.materialOrders : [];
  for (const o of materialOrders) {
    if (!o || !o.id || !o.userId) continue;
    await prisma.materialOrder.upsert({
      where: { id: o.id },
      create: {
        id: o.id,
        userId: String(o.userId),
        payload: o,
        createdAt: o.createdAt ? new Date(o.createdAt) : new Date(),
      },
      update: {
        payload: o,
      },
    });
  }
  console.log(`Migrated ${materialOrders.length} material orders.`);

  const specials = Array.isArray(state.specials) ? state.specials : [];
  for (const sp of specials) {
    await prisma.promoSpecial.create({
      data: {
        id: randomUUID(),
        data: sp && typeof sp === "object" ? sp : {},
      },
    });
  }
  console.log(`Migrated ${specials.length} promo specials.`);

  const deliveryProviders = Array.isArray(state.deliveryProviders) ? state.deliveryProviders : [];
  for (const d of deliveryProviders) {
    if (!d || typeof d !== "object") continue;
    await prisma.deliveryProvider.create({
      data: {
        id: d.id || randomUUID(),
        name: String(d.name || ""),
        logo: d.logo || null,
        baseRate: Number(d.baseRate || 0),
        perKmRate: Number(d.perKmRate || 0),
        estimatedTime: String(d.estimatedTime || "N/A"),
        vehicleType: d.vehicleType || null,
        numberPlate: d.numberPlate || null,
        rating: d.rating != null ? Number(d.rating) : null,
      },
    });
  }
  console.log(`Migrated ${deliveryProviders.length} delivery providers.`);

  const filesById = state.filesById && typeof state.filesById === "object" ? state.filesById : {};
  let fileCount = 0;
  for (const [fileId, rec] of Object.entries(filesById)) {
    if (!rec || typeof rec !== "object") continue;
    await prisma.storedFile.upsert({
      where: { id: fileId },
      create: {
        id: fileId,
        relPath: String(rec.relPath || ""),
        originalName: String(rec.originalName || ""),
        mimeType: String(rec.mimeType || "application/octet-stream"),
        ownerUserId: rec.ownerUserId || null,
        type: rec.type || null,
        createdAt: rec.createdAt ? new Date(rec.createdAt) : new Date(),
      },
      update: {
        relPath: String(rec.relPath || ""),
        originalName: String(rec.originalName || ""),
        mimeType: String(rec.mimeType || "application/octet-stream"),
        ownerUserId: rec.ownerUserId || null,
        type: rec.type || null,
      },
    });
    fileCount += 1;
  }
  console.log(`Migrated ${fileCount} stored file records.`);

  console.log("Done. You may archive or delete data/app-state.json after verifying the app.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
