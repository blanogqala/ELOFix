const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { registerUploadedFile } = require("./fileStorage.service");
const { validateUploadedImageFile } = require("../utils/uploadSecurity.util");
const fraudDetection = require("./fraudDetection.service");
const { normalizePhone } = require("../utils/phoneNormalization.util");

const userPublicSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  profileImage: true,
  role: true,
  createdAt: true,
};

function mapUserRoleForApi(role) {
  if (role === "CUSTOMER") return "user";
  return String(role || "").toLowerCase();
}

function toPublicUser(row) {
  if (!row) return null;
  return {
    ...row,
    role: mapUserRoleForApi(row.role),
  };
}

async function getUserById(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: userPublicSelect,
  });
  if (!user) return null;
  return toPublicUser(user);
}

async function updateUserProfile(userId, body = {}) {
  const data = {};

  if (body.phone !== undefined) {
    const raw = body.phone;
    const phone = raw != null && String(raw).trim() ? String(raw).trim() : null;
    const phoneNormalized = phone
      ? await fraudDetection.assertPhoneAvailable(phone, userId, { attemptUserId: userId })
      : null;
    data.phone = phone;
    data.phoneNormalized = phoneNormalized;
  }

  if (body.profileImage !== undefined) {
    const raw = body.profileImage;
    data.profileImage =
      raw != null && String(raw).trim() ? String(raw).trim() : null;
  }

  if (!Object.keys(data).length) {
    throw new AppError("No valid fields to update", 400);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    select: userPublicSelect,
    data,
  });

  return toPublicUser(updated);
}

async function saveAvatarFromUpload(userId, file) {
  if (!file || !file.path) {
    throw new AppError("File is required", 400);
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError("User not found", 404);
  }

  await validateUploadedImageFile(file);

  const stored = await registerUploadedFile(file, {
    ownerUserId: userId,
    type: "userAvatar",
  });

  const updated = await prisma.user.update({
    where: { id: userId },
    select: userPublicSelect,
    data: { profileImage: stored.url },
  });

  return toPublicUser(updated);
}

module.exports = {
  getUserById,
  updateUserProfile,
  saveAvatarFromUpload,
  toPublicUser,
};
