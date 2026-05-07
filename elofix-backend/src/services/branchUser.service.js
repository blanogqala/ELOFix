const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");
const branchService = require("./branch.service");

function toPublicBranchUser(row) {
  return {
    id: row.id,
    branchId: row.branchId,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
  };
}

async function createBranchUser(supplierOwnerUserId, branchId, body = {}) {
  await branchService.assertBranchOwnedByUser(branchId, supplierOwnerUserId);
  const email = String(body.email || "")
    .toLowerCase()
    .trim();
  const password = String(body.password || "");
  const roleRaw = String(body.role || "STAFF").toUpperCase();
  const role = roleRaw === "MANAGER" ? "MANAGER" : "STAFF";
  if (!email) throw new AppError("Email is required", 400);
  if (password.length < 8) throw new AppError("Password must be at least 8 characters", 400);

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    throw new AppError("This email is already registered as a platform user", 409);
  }

  const hashed = await bcrypt.hash(password, 12);
  try {
    const row = await prisma.branchUser.create({
      data: {
        id: randomUUID(),
        branchId: String(branchId),
        email,
        password: hashed,
        role,
      },
    });
    return toPublicBranchUser(row);
  } catch (err) {
    if (err.code === "P2002") {
      throw new AppError("A branch account already uses this email", 409);
    }
    throw err;
  }
}

async function listBranchUsers(supplierOwnerUserId, branchId) {
  await branchService.assertBranchOwnedByUser(branchId, supplierOwnerUserId);
  const rows = await prisma.branchUser.findMany({
    where: { branchId: String(branchId) },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toPublicBranchUser);
}

async function updateBranchStaffPassword(branchUserId, body = {}) {
  const currentPassword = body.currentPassword ?? body.oldPassword;
  const newPassword = body.newPassword ?? body.password;
  if (!currentPassword || !newPassword) {
    throw new AppError("Current password and new password are required", 400);
  }
  if (String(newPassword).length < 8) {
    throw new AppError("New password must be at least 8 characters", 400);
  }
  const bu = await prisma.branchUser.findUnique({
    where: { id: String(branchUserId || "") },
    select: { password: true },
  });
  if (!bu?.password) {
    throw new AppError("Unable to update password", 400);
  }
  const ok = await bcrypt.compare(String(currentPassword), bu.password);
  if (!ok) {
    throw new AppError("Current password is incorrect", 401);
  }
  await prisma.branchUser.update({
    where: { id: String(branchUserId) },
    data: { password: await bcrypt.hash(String(newPassword), 12) },
  });
  return true;
}

async function deleteBranchUserForSupplier(supplierOwnerUserId, branchId, branchUserId) {
  const bu = await prisma.branchUser.findUnique({
    where: { id: String(branchUserId || "") },
    include: { branch: { include: { supplier: true } } },
  });
  if (!bu || String(bu.branchId) !== String(branchId || "")) {
    throw new AppError("Branch user not found", 404);
  }
  if (String(bu.branch.supplier.userId || "") !== String(supplierOwnerUserId || "")) {
    throw new AppError("Forbidden", 403);
  }
  await prisma.branchUser.delete({ where: { id: bu.id } });
}

async function updateBranchUserForSupplier(supplierOwnerUserId, branchId, branchUserId, body = {}) {
  const bu = await prisma.branchUser.findUnique({
    where: { id: String(branchUserId || "") },
    include: { branch: { include: { supplier: true } } },
  });
  if (!bu || String(bu.branchId) !== String(branchId || "")) {
    throw new AppError("Branch user not found", 404);
  }
  if (String(bu.branch.supplier.userId || "") !== String(supplierOwnerUserId || "")) {
    throw new AppError("Forbidden", 403);
  }

  const data = {};
  if (body.email !== undefined) {
    const email = String(body.email || "")
      .toLowerCase()
      .trim();
    if (!email) throw new AppError("Email is required", 400);
    const currentEmail = String(bu.email || "").toLowerCase().trim();
    if (email !== currentEmail) {
      const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existingUser) {
        throw new AppError("This email is already registered as a platform user", 409);
      }
      data.email = email;
    }
  }
  if (body.password !== undefined && body.password !== null && String(body.password) !== "") {
    const password = String(body.password);
    if (password.length < 8) throw new AppError("Password must be at least 8 characters", 400);
    data.password = await bcrypt.hash(password, 12);
  }
  if (body.role !== undefined) {
    const roleRaw = String(body.role || "STAFF").toUpperCase();
    data.role = roleRaw === "MANAGER" ? "MANAGER" : "STAFF";
  }

  if (Object.keys(data).length === 0) {
    return toPublicBranchUser(bu);
  }

  try {
    const row = await prisma.branchUser.update({
      where: { id: bu.id },
      data,
    });
    return toPublicBranchUser(row);
  } catch (err) {
    if (err.code === "P2002") {
      throw new AppError("A branch account already uses this email", 409);
    }
    throw err;
  }
}

module.exports = {
  createBranchUser,
  listBranchUsers,
  updateBranchUserForSupplier,
  deleteBranchUserForSupplier,
  updateBranchStaffPassword,
  toPublicBranchUser,
};
