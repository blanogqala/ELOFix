const AppError = require("../utils/AppError");
const userService = require("../services/user.service");

function assertSelfOrAdmin(req, targetUserId) {
  if (req.user.role === "ADMIN") return;
  if (req.user.userId !== targetUserId) {
    throw new AppError("Forbidden", 403);
  }
}

async function getUserById(req, res) {
  const userId = String(req.params.id || "").trim();
  assertSelfOrAdmin(req, userId);
  const user = await userService.getUserById(userId);
  if (!user) throw new AppError("User not found", 404);
  res.json({ success: true, user });
}

async function updateUserScoped(req, res) {
  const userId = String(req.params.id || "").trim();
  assertSelfOrAdmin(req, userId);
  const user = await userService.updateUserProfile(userId, req.body || {});
  res.json({ success: true, user });
}

async function uploadAvatarScoped(req, res) {
  const userId = String(req.params.id || "").trim();
  assertSelfOrAdmin(req, userId);
  if (!req.file) {
    throw new AppError("File is required", 400);
  }
  const user = await userService.saveAvatarFromUpload(userId, req.file);
  res.json({ success: true, user });
}

module.exports = {
  getUserById,
  updateUserScoped,
  uploadAvatarScoped,
};
