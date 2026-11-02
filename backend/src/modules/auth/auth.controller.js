const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/ApiResponse');
const authService = require('./auth.service');

const ctxFrom = (req) => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  deviceName: req.headers['x-device-name'],
});

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body, ctxFrom(req));
  return created(res, result, 'Account created successfully');
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, ctxFrom(req));
  return ok(res, result, 'Logged in successfully');
});

const requestOtp = asyncHandler(async (req, res) => {
  const result = await authService.requestLoginOtp(req.body);
  return ok(res, result, 'OTP sent successfully');
});

const verifyOtp = asyncHandler(async (req, res) => {
  const result = await authService.verifyLoginOtp(req.body, ctxFrom(req));
  return ok(res, result, result.isNewUser ? 'Account created successfully' : 'Logged in successfully');
});

const googleOauth = asyncHandler(async (req, res) => {
  const result = await authService.googleSignIn(req.body, ctxFrom(req));
  return ok(res, result, 'Logged in with Google');
});

const refresh = asyncHandler(async (req, res) => {
  const { accessToken, refreshToken, expiresIn } = await authService.refresh(
    req.body.refreshToken,
    ctxFrom(req),
  );
  return ok(res, { accessToken, refreshToken, expiresIn }, 'Token refreshed');
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  return ok(res, null, 'Logged out');
});

const logoutAll = asyncHandler(async (req, res) => {
  await authService.logoutAll(req.user.id);
  return ok(res, null, 'All sessions revoked');
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body);
  return ok(res, null, result.message);
});

const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body);
  return ok(res, null, 'Password reset. Please log in again.');
});

const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, req.body);
  return ok(res, null, 'Password changed. Other sessions were logged out.');
});

const me = asyncHandler(async (req, res) => {
  const profile = await authService.me(req.user.id);
  return ok(res, profile);
});

module.exports = {
  register,
  login,
  requestOtp,
  verifyOtp,
  googleOauth,
  refresh,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  changePassword,
  me,
};
