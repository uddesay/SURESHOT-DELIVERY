const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, paginated } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/rbac.middleware');
const { requireApprovedVendor } = require('../../middlewares/vendor.middleware');
const audit = require('../../middlewares/audit.middleware');
const payoutService = require('./payout.service');

const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
};

// ---------------- vendor ----------------

const vendorRouter = express.Router();
vendorRouter.use(authenticate, requireApprovedVendor);

/**
 * @openapi
 * /vendor/payouts:
 *   get:
 *     tags: [Payouts]
 *     summary: Vendor's settlement history
 *     security: [{ bearerAuth: [] }]
 */
vendorRouter.get(
  '/',
  validate({
    query: Joi.object({
      ...pagination,
      status: Joi.string().valid('pending', 'approved', 'processing', 'paid', 'failed', 'on_hold'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { total, rows } = await payoutService.listForVendor(req.vendor.id, req.query);
    return paginated(res, rows, { page, limit, total });
  }),
);

vendorRouter.get(
  '/:id',
  validate({ params: Joi.object({ id: Joi.string().uuid().required() }) }),
  asyncHandler(async (req, res) => ok(res, await payoutService.getDetail(req.params.id, req.vendor.id))),
);

/**
 * @openapi
 * /vendor/payouts/request:
 *   post:
 *     tags: [Payouts]
 *     summary: Request a payout for everything eligible since the last one
 *     security: [{ bearerAuth: [] }]
 */
vendorRouter.post(
  '/request',
  audit('payouts:self_request', 'vendor_payout'),
  asyncHandler(async (req, res) =>
    created(res, await payoutService.requestPayout(req.vendor.id), 'Payout requested — awaiting admin approval')),
);

// ---------------- admin ----------------

const adminRouter = express.Router();
adminRouter.use(authenticate, authorize('payouts:approve'));

adminRouter.get(
  '/',
  validate({
    query: Joi.object({
      ...pagination,
      status: Joi.string().valid('pending', 'approved', 'processing', 'paid', 'failed', 'on_hold'),
      vendorId: Joi.string().uuid(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { total, rows } = await payoutService.listForAdmin(req.query);
    return paginated(res, rows, { page, limit, total });
  }),
);

adminRouter.get(
  '/:id',
  validate({ params: Joi.object({ id: Joi.string().uuid().required() }) }),
  asyncHandler(async (req, res) => ok(res, await payoutService.getDetail(req.params.id))),
);

adminRouter.post(
  '/vendors/:vendorId/generate',
  validate({
    params: Joi.object({ vendorId: Joi.string().uuid().required() }),
    body: Joi.object({
      periodStart: Joi.date().iso().required(),
      periodEnd: Joi.date().iso().greater(Joi.ref('periodStart')).required(),
    }),
  }),
  audit('payouts:generate', 'vendor_payout'),
  asyncHandler(async (req, res) =>
    created(res, await payoutService.generatePayout(req.user.id, req.params.vendorId, req.body), 'Payout batch generated')),
);

adminRouter.post(
  '/:id/approve',
  validate({ params: Joi.object({ id: Joi.string().uuid().required() }) }),
  audit('payouts:approve', 'vendor_payout'),
  asyncHandler(async (req, res) => ok(res, await payoutService.approvePayout(req.user.id, req.params.id), 'Payout approved')),
);

adminRouter.post(
  '/:id/mark-paid',
  validate({
    params: Joi.object({ id: Joi.string().uuid().required() }),
    body: Joi.object({ utrNumber: Joi.string().min(3).max(60).required() }),
  }),
  audit('payouts:mark_paid', 'vendor_payout'),
  asyncHandler(async (req, res) => ok(res, await payoutService.markPaid(req.user.id, req.params.id, req.body), 'Payout marked as paid')),
);

adminRouter.post(
  '/:id/hold',
  validate({
    params: Joi.object({ id: Joi.string().uuid().required() }),
    body: Joi.object({ reason: Joi.string().min(3).max(500).required() }),
  }),
  audit('payouts:hold', 'vendor_payout'),
  asyncHandler(async (req, res) => {
    await payoutService.holdPayout(req.user.id, req.params.id, req.body.reason);
    return ok(res, null, 'Payout put on hold');
  }),
);

module.exports = { vendorRouter, adminRouter };
