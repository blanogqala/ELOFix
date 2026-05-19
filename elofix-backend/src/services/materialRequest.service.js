const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { mutateJobMeta, getJobMeta } = require("./jobMeta.service");
const { randomUUID } = require("crypto");

function coerceNumber(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function sumMaterialsTotal(materials) {
  if (!Array.isArray(materials)) return 0;
  return materials.reduce((sum, m) => sum + coerceNumber(m.qty, 0) * coerceNumber(m.unitPrice, 0), 0);
}

function normalizeMaterialLines(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object");
}

function groupMaterialsBySupplier(materials) {
  const map = new Map();
  for (const m of materials) {
    const sid = String(m.supplierId);
    if (!map.has(sid)) map.set(sid, []);
    map.get(sid).push(m);
  }
  return map;
}

function lineToOrderItem(line) {
  return {
    productId: String(line.productId),
    name: String(line.name || ""),
    qty: coerceNumber(line.qty, 0),
    unitPrice: coerceNumber(line.unitPrice, 0),
    qualityTier: line.qualityTier || "medium",
    imageUrl: line.imageUrl,
  };
}

/**
 * Appends new per-supplier store orders for this material request batch (never overwrites prior submissions).
 * Each order carries materialRequestId so payment + MR paid sync target the correct cycle.
 */
function appendStoreOrdersForMaterialRequest(currentStoreOrders, materials, materialRequestId) {
  const byStore = groupMaterialsBySupplier(materials);
  const next = Array.isArray(currentStoreOrders) ? [...currentStoreOrders] : [];
  const batchId = randomUUID();
  const createdAt = new Date().toISOString();
  const mrId = String(materialRequestId || "").trim();

  for (const [storeId, lines] of byStore.entries()) {
    const items = lines.map(lineToOrderItem);
    const storeName = lines[0]?.supplierName || "Store";
    next.push({
      storeId,
      orderId: randomUUID(),
      ...(mrId ? { materialRequestId: mrId } : {}),
      submissionBatchId: batchId,
      items,
      storeName,
      deliveryType: "SELF",
      deliveryFee: 0,
      deliveryStatus: "SelfCollect",
      paymentStatus: "Paid",
      invoiceId: "",
      createdAt,
      payment: { materialsPaid: false, deliveryPaid: false },
    });
  }
  return next;
}

function assertProviderJob(job, providerUserId) {
  if (!job) throw new AppError("Job not found", 404);
  if (String(job.providerId || "") !== String(providerUserId)) {
    throw new AppError("Forbidden", 403);
  }
}

async function findJobForProvider(jobId, providerUserId) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, customerId: true, providerId: true, materials: true, title: true },
  });
  assertProviderJob(job, providerUserId);
  return job;
}

function toApiMaterialRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.jobId,
    providerId: row.providerId,
    customerId: row.customerId,
    items: Array.isArray(row.items) ? row.items : [],
    totalAmount: row.totalAmount != null ? Number(row.totalAmount) : 0,
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() || String(row.createdAt),
    updatedAt: row.updatedAt?.toISOString?.() || String(row.updatedAt),
  };
}

/**
 * Create or update single draft per job+provider.
 */
async function createDraft(providerUserId, body) {
  const jobId = String(body?.jobId || "").trim();
  if (!jobId) throw new AppError("jobId is required", 400);

  const items = normalizeMaterialLines(body?.items);
  if (items.length === 0) throw new AppError("items must be a non-empty array", 400);

  const job = await findJobForProvider(jobId, providerUserId);

  const total = sumMaterialsTotal(items);

  const existing = await prisma.materialRequest.findFirst({
    where: { jobId, providerId: String(providerUserId), status: "draft" },
  });

  const data = {
    items,
    totalAmount: new Prisma.Decimal(String(Math.max(0, total).toFixed(2))),
  };

  if (existing) {
    const updated = await prisma.materialRequest.update({
      where: { id: existing.id },
      data,
    });
    return toApiMaterialRequest(updated);
  }

  const created = await prisma.materialRequest.create({
    data: {
      jobId,
      providerId: String(providerUserId),
      customerId: String(job.customerId),
      items,
      totalAmount: data.totalAmount,
      status: "draft",
    },
  });
  return toApiMaterialRequest(created);
}

/**
 * Resolve items for submit: explicit array, or materialRequestId, or lone draft.
 */
async function resolveSubmitItems(jobId, providerUserId, body) {
  const inline = normalizeMaterialLines(body?.materials);
  if (inline.length > 0) return { items: inline, materialRequestRow: null };

  const mrId = body?.materialRequestId ? String(body.materialRequestId).trim() : "";
  if (mrId) {
    const mr = await prisma.materialRequest.findFirst({
      where: { id: mrId, jobId, providerId: String(providerUserId) },
    });
    if (!mr) throw new AppError("Material request not found", 404);
    if (mr.status !== "draft") {
      throw new AppError("Material request is not a draft", 400);
    }
    const items = normalizeMaterialLines(mr.items);
    if (items.length === 0) throw new AppError("Draft has no items", 400);
    return { items, materialRequestRow: mr };
  }

  const draft = await prisma.materialRequest.findFirst({
    where: { jobId, providerId: String(providerUserId), status: "draft" },
  });
  if (!draft) throw new AppError("No draft material request to submit", 400);
  const items = normalizeMaterialLines(draft.items);
  if (items.length === 0) throw new AppError("Draft has no items", 400);
  return { items, materialRequestRow: draft };
}

/**
 * Core persistence: job.materials JSON, meta.storeOrders sync, MATERIALS_SUBMITTED, MaterialRequest row.
 */
async function finalizeProviderMaterialsSubmit(jobId, materials, providerUserId, options = {}) {
  const nextMaterials = normalizeMaterialLines(materials);
  if (nextMaterials.length === 0) throw new AppError("Materials are required", 400);

  const job = await findJobForProvider(jobId, providerUserId);
  const customerId = String(job.customerId);

  const total = sumMaterialsTotal(nextMaterials);
  const totalDec = new Prisma.Decimal(String(Math.max(0, total).toFixed(2)));

  const draftHandledId = options.draftMaterialRequestId || null;

  const mrDraft =
    draftHandledId &&
    (await prisma.materialRequest.findFirst({
      where: { id: draftHandledId, jobId, providerId: String(providerUserId), status: "draft" },
    }));

  let materialRequestId;
  if (mrDraft) {
    await prisma.materialRequest.update({
      where: { id: mrDraft.id },
      data: {
        items: nextMaterials,
        totalAmount: totalDec,
        status: "submitted",
      },
    });
    materialRequestId = mrDraft.id;
  } else {
    const created = await prisma.materialRequest.create({
      data: {
        jobId,
        providerId: String(providerUserId),
        customerId,
        items: nextMaterials,
        totalAmount: totalDec,
        status: "submitted",
      },
    });
    materialRequestId = created.id;
  }

  const existingJob = await prisma.job.findUnique({
    where: { id: jobId },
    select: { materials: true },
  });
  const existingLines = normalizeMaterialLines(existingJob?.materials);
  const tagged = nextMaterials.map((line) => ({
    ...line,
    materialRequestId: String(materialRequestId),
  }));
  const combinedMaterials = [...existingLines, ...tagged];

  await prisma.job.update({
    where: { id: jobId },
    data: { materials: combinedMaterials },
  });

  const jobStatusRow = await prisma.job.findUnique({
    where: { id: jobId },
    select: { status: true },
  });

  const jobProgressUtil = require("../utils/jobProgress.util");

  await mutateJobMeta(jobId, (m) => {
    const storeOrders = appendStoreOrdersForMaterialRequest(
      m.storeOrders,
      nextMaterials,
      materialRequestId
    );
    const next = {
      ...m,
      storeOrders,
      statusOverride: "MATERIALS_SUBMITTED",
    };
    next.progressStep = jobProgressUtil.nextMonotonicProgressStep(next, jobStatusRow || { status: "ACCEPTED" });
    return next;
  });

  try {
    const notificationEvents = require("./notificationEvents.service");
    const providerRow = await prisma.provider.findUnique({
      where: { userId: String(providerUserId) },
      select: { user: { select: { name: true } } },
    });
    const providerName = providerRow?.user?.name || "Your provider";
    await notificationEvents.notifyMaterialsListSubmitted(
      customerId,
      jobId,
      job.title || "Job",
      providerName
    );
  } catch (err) {
    console.error("[notifications] materials list submitted", err);
  }
}

async function submitFromBody(providerUserId, body) {
  const jobId = String(body?.jobId || "").trim();
  if (!jobId) throw new AppError("jobId is required", 400);

  const { items, materialRequestRow } = await resolveSubmitItems(jobId, providerUserId, body);
  await finalizeProviderMaterialsSubmit(jobId, items, providerUserId, {
    draftMaterialRequestId: materialRequestRow?.id || null,
  });
}

async function listForJobActor(jobId, userId, role) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, customerId: true, providerId: true },
  });
  if (!job) throw new AppError("Job not found", 404);

  if (role === "ADMIN") {
    /** ok */
  } else if (role === "CUSTOMER" && String(job.customerId) !== String(userId)) {
    throw new AppError("Forbidden", 403);
  } else if (role === "PROVIDER" && String(job.providerId || "") !== String(userId)) {
    throw new AppError("Forbidden", 403);
  } else if (role !== "CUSTOMER" && role !== "PROVIDER" && role !== "ADMIN") {
    throw new AppError("Forbidden", 403);
  }

  const rows = await prisma.materialRequest.findMany({
    where: { jobId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toApiMaterialRequest);
}

/**
 * After store materials payment, mark submitted MaterialRequest paid when every supplier in its items is paid on a store order.
 */
async function syncSubmittedRequestsToPaid(jobId) {
  const rows = await prisma.materialRequest.findMany({
    where: { jobId, status: "submitted" },
  });
  if (rows.length === 0) return;

  const meta = await getJobMeta(jobId);
  const storeOrders = Array.isArray(meta.storeOrders) ? meta.storeOrders : [];

  for (const mr of rows) {
    const items = normalizeMaterialLines(mr.items);
    const supplierIds = new Set(items.map((i) => String(i.supplierId)));
    if (supplierIds.size === 0) continue;

    const linked = storeOrders.filter((o) => String(o.materialRequestId || "") === String(mr.id));
    let allPaid = false;
    if (linked.length > 0) {
      allPaid = linked.every((o) => o.payment?.materialsPaid === true);
    } else {
      let legacyOk = true;
      for (const sid of supplierIds) {
        const paidOrder = storeOrders.some(
          (o) => String(o.storeId) === String(sid) && o.payment?.materialsPaid === true
        );
        if (!paidOrder) {
          legacyOk = false;
          break;
        }
      }
      allPaid = legacyOk;
    }
    if (allPaid) {
      await prisma.materialRequest.update({
        where: { id: mr.id },
        data: { status: "paid" },
      });
    }
  }
}

/**
 * Customer: idempotently mark a specific request paid if job payment state already satisfies suppliers.
 */
async function patchMarkPaidForCustomer(materialRequestId, customerUserId) {
  const mr = await prisma.materialRequest.findUnique({
    where: { id: materialRequestId },
    include: { job: { select: { customerId: true } } },
  });
  if (!mr) throw new AppError("Material request not found", 404);
  if (String(mr.job.customerId) !== String(customerUserId)) {
    throw new AppError("Forbidden", 403);
  }
  await syncSubmittedRequestsToPaid(mr.jobId);
  const updated = await prisma.materialRequest.findUnique({ where: { id: materialRequestId } });
  return toApiMaterialRequest(updated);
}

module.exports = {
  createDraft,
  submitFromBody,
  finalizeProviderMaterialsSubmit,
  listForJobActor,
  syncSubmittedRequestsToPaid,
  patchMarkPaidForCustomer,
  appendStoreOrdersForMaterialRequest,
  toApiMaterialRequest,
};
