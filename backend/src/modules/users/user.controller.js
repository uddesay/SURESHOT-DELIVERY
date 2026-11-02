const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/ApiResponse');
const userService = require('./user.service');

const getProfile = asyncHandler(async (req, res) => {
  const profile = await userService.getProfile(req.user.id);
  return ok(res, profile);
});

const updateProfile = asyncHandler(async (req, res) => {
  const profile = await userService.updateProfile(req.user.id, req.body);
  return ok(res, profile, 'Profile updated');
});

const registerDevice = asyncHandler(async (req, res) => {
  await userService.registerDevice(req.user.id, req.body);
  return ok(res, null, 'Device registered');
});

const deleteAccount = asyncHandler(async (req, res) => {
  await userService.deleteAccount(req.user.id);
  return ok(res, null, 'Account deleted');
});

module.exports = { getProfile, updateProfile, registerDevice, deleteAccount };
