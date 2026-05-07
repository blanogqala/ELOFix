const authService = require("../services/auth.service");

async function register(req, res) {
  const result = await authService.register(req.body);
  res.status(201).json({ success: true, ...result });
}

async function login(req, res) {
  const result = await authService.login(req.body);
  res.json({ success: true, ...result });
}

async function getMe(req, res) {
  const result = await authService.getMe(req.user);
  res.json({ success: true, ...result });
}

async function changePassword(req, res) {
  await authService.changePassword(req.user, req.body || {});
  res.json({ success: true });
}

module.exports = {
  register,
  login,
  getMe,
  changePassword,
};
