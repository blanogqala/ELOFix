const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const outboxService = require("./notificationDeliveryOutbox.service");

function emitToUserRoom(userId, event, payload) {
  if (!userId || !global.io) return;
  try {
    global.io.to(String(userId)).emit(event, payload);
  } catch (err) {
    console.error("[socket] branch staff notification emit failed", err);
  }
}

function toApiShape(row) {
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    userId: row.branchUserId,
    type: row.type,
    title: row.title,
    message: row.message,
    read: row.read,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    materialOrderId: row.materialOrderId || undefined,
    senderId: meta.senderId ? String(meta.senderId) : undefined,
    senderName: meta.senderName ? String(meta.senderName) : undefined,
    senderRole: meta.senderRole ? String(meta.senderRole) : undefined,
  };
}

async function createForBranchUser(branchUserId, { category = "SYSTEM", type, title, message, materialOrderId, metadata, dedupeKey }) {
  const uid = String(branchUserId || "").trim();
  if (!uid) return null;

  const data = {
    id: randomUUID(),
    branchUserId: uid,
    category,
    type: String(type || "branch_event"),
    title: String(title || "Update"),
    message: String(message || ""),
    materialOrderId: materialOrderId || null,
    metadata: metadata && typeof metadata === "object" ? metadata : undefined,
    dedupeKey:
      dedupeKey != null && String(dedupeKey).trim() !== "" ? String(dedupeKey).trim() : null,
  };

  let item;
  let deduped = false;

  if (data.dedupeKey) {
    const existing = await prisma.branchStaffNotification.findFirst({
      where: { branchUserId: uid, dedupeKey: data.dedupeKey },
    });
    if (existing) {
      item = existing;
      deduped = true;
    }
  }

  if (!item) {
    try {
      item = await prisma.branchStaffNotification.create({ data });
    } catch (err) {
      if (err?.code === "P2002" && data.dedupeKey) {
        const existing = await prisma.branchStaffNotification.findFirst({
          where: { branchUserId: uid, dedupeKey: data.dedupeKey },
        });
        if (!existing) throw err;
        item = existing;
        deduped = true;
      } else {
        throw err;
      }
    }
  }

  const api = toApiShape(item);
  if (deduped) return api;

  try {
    await outboxService.enqueueSocketDelivery({
      userId: uid,
      event: "notification:new",
      payload: api,
    });
    void outboxService.processOutboxBatch(1);
  } catch (outboxErr) {
    console.error("[branchStaffNotification] socket outbox enqueue failed", outboxErr);
    emitToUserRoom(uid, "notification:new", api);
  }
  return api;
}

/**
 * Notify every BranchUser on a branch (in-app + socket).
 */
async function createForBranchUsers(branchId, { category = "ORDERS", type, title, message, materialOrderId, metadata, dedupeKey }) {
  const bid = String(branchId || "").trim();
  if (!bid) return [];
  const staff = await prisma.branchUser.findMany({
    where: { branchId: bid },
    select: { id: true },
  });
  const created = [];
  for (const s of staff) {
    const staffDedupe =
      dedupeKey != null && String(dedupeKey).trim() !== ""
        ? `${String(dedupeKey).trim()}:staff:${s.id}`
        : null;
    const item = await createForBranchUser(s.id, {
      category,
      type,
      title,
      message,
      materialOrderId,
      metadata,
      dedupeKey: staffDedupe,
    });
    if (item) created.push(item);
  }
  return created;
}

async function listForBranchUser(branchUserId) {
  const rows = await prisma.branchStaffNotification.findMany({
    where: { branchUserId: String(branchUserId) },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toApiShape);
}

async function getUnreadCount(branchUserId) {
  return prisma.branchStaffNotification.count({
    where: { branchUserId: String(branchUserId), read: false },
  });
}

async function markAsRead(branchUserId, notificationId) {
  await prisma.branchStaffNotification.updateMany({
    where: { id: String(notificationId), branchUserId: String(branchUserId) },
    data: { read: true },
  });
}

async function markAllAsRead(branchUserId) {
  await prisma.branchStaffNotification.updateMany({
    where: { branchUserId: String(branchUserId) },
    data: { read: true },
  });
}

module.exports = {
  createForBranchUsers,
  createForBranchUser,
  listForBranchUser,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  toApiShape,
};
