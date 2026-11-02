const router = require('express').Router();
const Joi = require('joi');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireApprovedVendor } = require('../../middlewares/vendor.middleware');
const analyticsService = require('./vendor-analytics.service');

router.use(authenticate, requireApprovedVendor);

/**
 * @openapi
 * /vendor/analytics/summary:
 *   get:
 *     tags: [Vendor Analytics]
 *     summary: Dashboard KPIs — revenue, orders, payouts, product mix
 *     security: [{ bearerAuth: [] }]
 */
router.get('/summary', asyncHandler(async (req, res) => ok(res, await analyticsService.getSummary(req.vendor.id))));

router.get(
  '/sales',
  validate({
    query: Joi.object({
      interval: Joi.string().valid('day', 'month').default('day'),
      from: Joi.date().iso(),
      to: Joi.date().iso(),
    }),
  }),
  asyncHandler(async (req, res) => ok(res, await analyticsService.getSalesTrend(req.vendor.id, req.query))),
);

router.get(
  '/top-products',
  validate({
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(50).default(10),
      by: Joi.string().valid('revenue', 'units').default('revenue'),
    }),
  }),
  asyncHandler(async (req, res) => ok(res, await analyticsService.getTopProducts(req.vendor.id, req.query))),
);

module.exports = router;
