const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/ApiResponse');
const addressService = require('./address.service');

const list = asyncHandler(async (req, res) => {
  const rows = await addressService.list(req.user.id);
  return ok(res, rows);
});

const create = asyncHandler(async (req, res) => {
  const row = await addressService.create(req.user.id, req.body);
  return created(res, row, 'Address added');
});

const update = asyncHandler(async (req, res) => {
  const row = await addressService.update(req.user.id, req.params.id, req.body);
  return ok(res, row, 'Address updated');
});

const setDefault = asyncHandler(async (req, res) => {
  await addressService.setDefault(req.user.id, req.params.id);
  return ok(res, null, 'Default address updated');
});

const remove = asyncHandler(async (req, res) => {
  await addressService.remove(req.user.id, req.params.id);
  return ok(res, null, 'Address removed');
});

module.exports = { list, create, update, setDefault, remove };
