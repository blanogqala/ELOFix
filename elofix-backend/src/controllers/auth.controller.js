const authService = require("../services/auth.service");
const googleAuthService = require("../services/googleAuth.service");

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

function startGoogleAuth(req, res) {
  const url = googleAuthService.buildGoogleAuthUrl(req.query);
  res.redirect(url);
}

async function googleCallback(req, res) {
  const redirectUrl = await googleAuthService.handleGoogleCallback(req.query);
  res.redirect(redirectUrl);
}

async function exchangeGoogleAuth(req, res) {
  const exchange = req.body?.exchange || req.query?.exchange;
  const result = await googleAuthService.exchangeGoogleSession(exchange);
  res.json({ success: true, ...result });
}

module.exports = {
  register,
  login,
  getMe,
  changePassword,
  startGoogleAuth,
  googleCallback,
  exchangeGoogleAuth,
};
