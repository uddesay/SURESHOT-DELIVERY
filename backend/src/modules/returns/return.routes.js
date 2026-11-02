const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, paginated } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/rbac.middleware');
const { requireApprovedVendor } = require('../../middlewares/vendor.middleware');
const returnService = require('./return.service');

const idParam = { params: Joi.object({ id: Joi.string().uuid().required() }) };
const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
};

// ---------------- customer ----------------

const customerRouter = express.Router();
customerRouter.use(authenticate);

/**
 * @openapi
 * /returns:
 *   post:
 *     tags: [Returns]
 *     summary: Request a return or exchange for a delivered order item
 *     security: [{ bearerAuth: [] }]
 */
customerRouter.post(
  '/',
  validate({
    body: Joi.object({
      orderItemId: Joi.string().uuid().required(),
      requestType: Joi.string().valid('return', 'exchange').required(),
      reason: Joi.string().max(60).required(),
      description: Joi.string().max(1000).allow(''),
      mediaUrls: Joi.array().items(Joi.string().uri().max(2048)).max(10),
      quantity: Joi.number().integer().min(1).default(1),
    }),
  }),
  asyncHandler(async (req, res) => created(res, await returnService.create(req.user.id, req.body), 'Return request submitted')),
);

customerRouter.get('/', validate({ query: Joi.object(pagination) }), asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const { total, rows } = await returnService.listByUser(req.user.id, req.query);
  return paginated(res, rows, { page, limit, total });
}));

customerRouter.get('/:id', validate(idParam), asyncHandler(async (req, res) => {
  const row = await returnService.getDetail(req.params.id);
  if (row.user_id !== req.user.id) return res.status(404).json({ success: false, message: 'Return request not found' });
  return ok(res, row);
}));

// ---------------- vendor ----------------

const vendorRouter = express.Router();
vendorRouter.use(authenticate, requireApprovedVendor);

vendorRouter.get('/', validate({
  query: Joi.object({
    ...pagination,
    status: Joi.string().valid('requested', 'approved', 'rejected', 'pickup_scheduled', 'picked', 'received', 'refund_initiated', 'refunded', 'exchanged', 'closed'),
  }),
}), asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const { total, rows } = await returnService.listForVendor(req.vendor.id, req.query);
  return paginated(res, rows, { page, limit, total });
}));

vendorRouter.post('/:id/approve', validate(idParam), asyncHandler(async (req, res) =>
  ok(res, await returnService.approve(req.user.id, req.params.id, true, req.vendor.id), 'Return approved')));

vendorRouter.post(
  '/:id/reject',
  validate({ ...idParam, body: Joi.object({ reason: Joi.string().min(3).max(500).required() }) }),
  asyncHandler(async (req, res) =>
    ok(res, await returnService.reject(req.user.id, req.params.id, req.body.reason, true, req.vendor.id), 'Return rejected')),
);

vendorRouter.post('/:id/advance', validate(idParam), asyncHandler(async (req, res) =>
  ok(res, await returnService.advance(req.user.id, req.params.id, true, req.vendor.id), 'Return status advanced')));

vendorRouter.post('/:id/close', validate(idParam), asyncHandler(async (req, res) =>
  ok(res, await returnService.close(req.user.id, req.params.id, true, req.vendor.id), 'Return closed')));

// ---------------- admin ----------------

const adminRouter = express.Router();
adminRouter.use(authenticate, authorize('returns:approve'));

adminRouter.get('/', validate({
  query: Joi.object({
    ...pagination,
    status: Joi.string().valid('requested', 'approved', 'rejected', 'pickup_scheduled', 'picked', 'received', 'refund_initiated', 'refunded', 'exchanged', 'closed'),
    vendorId: Joi.string().uuid(),
  }),
}), asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const { total, rows } = await returnService.listAll(req.query);
  return paginated(res, rows, { page, limit, total });
}));

adminRouter.post('/:id/approve', validate(idParam), asyncHandler(async (req, res) =>
  ok(res, await returnService.approve(req.user.id, req.params.id, false), 'Return approved')));

adminRouter.post(
  '/:id/reject',
  validate({ ...idParam, body: Joi.object({ reason: Joi.string().min(3).max(500).required() }) }),
  asyncHandler(async (req, res) =>
    ok(res, await returnService.reject(req.user.id, req.params.id, req.body.reason, false), 'Return rejected')),
);

adminRouter.post('/:id/advance', validate(idParam), asyncHandler(async (req, res) =>
  ok(res, await returnService.advance(req.user.id, req.params.id, false), 'Return status advanced')));

adminRouter.post('/:id/close', validate(idParam), asyncHandler(async (req, res) =>
  ok(res, await returnService.close(req.user.id, req.params.id, false), 'Return closed')));

module.exports = { customerRouter, vendorRouter, adminRouter };
