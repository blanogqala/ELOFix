const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");

function emitToUserRoom(userId, event, payload) {
  if (!userId || !global.io) return;
  try {
    global.io.to(String(userId)).emit(event, payload);
  } catch (err) {
    console.error("[socket] branch staff notification emit failed", err);
  }
}

function toApiShape(row) {
  return {
    id: row.id,
    userId: row.branchUserId,
    type: row.type,
    title: row.title,
    message: row.message,
    read: row.read,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    materialOrderId: row.materialOrderId || undefined,
  };
}

/**
 * Notify every BranchUser on a branch (in-app + socket).
 */
async function createForBranchUsers(branchId, { category = "ORDERS", type, title, message, materialOrderId, metadata }) {
  const bid = String(branchId || "").trim();
  if (!bid) return [];
  const staff = await prisma.branchUser.findMany({
    where: { branchId: bid },
    select: { id: true },
  });
  const created = [];
  for (const s of staff) {
    const item = await prisma.branchStaffNotification.create({
      data: {
        id: randomUUID(),
        branchUserId: s.id,
        category,
        type: String(type || "branch_event"),
        title: String(title || "Update"),
        message: String(message || ""),
        materialOrderId: materialOrderId || null,
        metadata: metadata && typeof metadata === "object" ? metadata : undefined,
      },
    });
    const api = toApiShape(item);
    emitToUserRoom(s.id, "notification:new", api);
    created.push(api);
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
  listForBranchUser,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  toApiShape,
};
