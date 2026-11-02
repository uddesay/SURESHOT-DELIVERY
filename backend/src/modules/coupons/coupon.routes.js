const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, paginated } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/rbac.middleware');
const audit = require('../../middlewares/audit.middleware');
const couponService = require('./coupon.service');

// -------- public --------
const publicRouter = express.Router();

/**
 * @openapi
 * /coupons:
 *   get:
 *     tags: [Coupons]
 *     summary: Active platform coupons
 *     security: [{ bearerAuth: [] }]
 */
publicRouter.get('/', authenticate, asyncHandler(async (req, res) =>
  ok(res, await couponService.listAvailable(req.user.id))));

// -------- admin --------
const adminRouter = express.Router();
adminRouter.use(authenticate, authorize('coupons:manage'));

const couponBody = {
  code: Joi.string().alphanum().min(3).max(40).uppercase(),
  title: Joi.string().max(160),
  description: Joi.string().max(1000).allow(''),
  discountType: Joi.string().valid('percent', 'fixed'),
  discountValue: Joi.number().integer().min(1),
  maxDiscountMinor: Joi.number().integer().min(1).allow(null),
  minOrderMinor: Joi.number().integer().min(0),
  usageLimitTotal: Joi.number().integer().min(1).allow(null),
  usageLimitPerUser: Joi.number().integer().min(1),
  applicableScope: Joi.string().valid('all', 'category', 'product', 'vendor', 'first_order'),
  scopeIds: Joi.array().items(Joi.string().uuid()).allow(null),
  startsAt: Joi.date().iso(),
  endsAt: Joi.date().iso().greater(Joi.ref('startsAt')),
  isActive: Joi.boolean(),
};

adminRouter.get(
  '/',
  validate({
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      q: Joi.string().max(40),
      active: Joi.boolean(),
      state: Joi.string().valid('active', 'scheduled', 'expired', 'disabled'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { total, rows } = await couponService.listAdmin(req.query);
    return paginated(res, rows, { page, limit, total });
  }),
);

adminRouter.post(
  '/',
  validate({
    body: Joi.object({
      ...couponBody,
      code: couponBody.code.required(),
      title: couponBody.title.required(),
      discountType: couponBody.discountType.required(),
      discountValue: couponBody.discountValue.required(),
      startsAt: couponBody.startsAt.required(),
      endsAt: couponBody.endsAt.required(),
    }),
  }),
  audit('coupons:create', 'coupon'),
  asyncHandler(async (req, res) => created(res, await couponService.create(req.user.id, req.body), 'Coupon created')),
);

adminRouter.patch(
  '/:id',
  validate({
    params: Joi.object({ id: Joi.string().uuid().required() }),
    body: Joi.object(couponBody).min(1),
  }),
  audit('coupons:update', 'coupon'),
  asyncHandler(async (req, res) => ok(res, await couponService.update(req.params.id, req.body), 'Coupon updated')),
);

module.exports = { publicRouter, adminRouter };
