const authService = require("../services/auth.service");
const googleAuthService = require("../services/googleAuth.service");
const passwordResetService = require("../services/passwordReset.service");
const { getRequestAuditContext } = require("../utils/auditContext.util");

async function register(req, res) {
  const result = await authService.register(req.body);
  res.status(201).json({ success: true, ...result });
}

async function login(req, res) {
  const auditContext = getRequestAuditContext(req);
  const result = await authService.login(req.body, auditContext);
  res.json({ success: true, ...result });
}

async function getMe(req, res) {
  const result = await authService.getMe(req.user);
  res.json({ success: true, ...result });
}

async function changePassword(req, res) {
  const auditContext = getRequestAuditContext(req);
  await authService.changePassword(req.user, req.body || {}, auditContext);
  res.json({ success: true });
}

async function logout(req, res) {
  const auditContext = getRequestAuditContext(req);
  await authService.logout(req.user, auditContext);
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
  const auditContext = getRequestAuditContext(req);
  const result = await googleAuthService.exchangeGoogleSession(exchange, auditContext);
  res.json({ success: true, ...result });
}

async function forgotPassword(req, res) {
  const auditContext = getRequestAuditContext(req);
  const result = await passwordResetService.requestPasswordReset(req.body?.email, auditContext);
  res.json({ success: true, message: result.message });
}

async function resetPassword(req, res) {
  const auditContext = getRequestAuditContext(req);
  const result = await passwordResetService.resetPassword(req.body || {}, auditContext);
  res.json({ success: true, message: result.message });
}

module.exports = {
  register,
  login,
  logout,
  getMe,
  changePassword,
  startGoogleAuth,
  googleCallback,
  exchangeGoogleAuth,
  forgotPassword,
  resetPassword,
};
