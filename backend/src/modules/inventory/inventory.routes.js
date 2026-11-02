const router = require('express').Router();
const Joi = require('joi');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, paginated } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireApprovedVendor } = require('../../middlewares/vendor.middleware');
const inventoryService = require('./inventory.service');

router.use(authenticate, requireApprovedVendor);

/**
 * @openapi
 * /vendor/inventory:
 *   get:
 *     tags: [Inventory]
 *     summary: Stock levels across all warehouses, sorted by lowest availability first
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/',
  validate({
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      warehouseId: Joi.string().uuid(),
      lowStockOnly: Joi.boolean().default(false),
      q: Joi.string().max(200),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { total, rows } = await inventoryService.list(req.vendor.id, req.query);
    return paginated(res, rows, { page, limit, total });
  }),
);

router.get(
  '/:variantId/movements',
  validate({
    params: Joi.object({ variantId: Joi.string().uuid().required() }),
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(30),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { total, rows } = await inventoryService.getMovements(req.vendor.id, req.params.variantId, req.query);
    return paginated(res, rows, { page, limit, total });
  }),
);

router.patch(
  '/:variantId/:warehouseId',
  validate({
    params: Joi.object({ variantId: Joi.string().uuid().required(), warehouseId: Joi.string().uuid().required() }),
    body: Joi.object({
      delta: Joi.number().integer().invalid(0).required(),
      reason: Joi.string().min(3).max(300).required(),
    }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await inventoryService.adjustStock(req.vendor.id, req.params.variantId, req.params.warehouseId, req.body), 'Stock updated')),
);

router.patch(
  '/:variantId/:warehouseId/threshold',
  validate({
    params: Joi.object({ variantId: Joi.string().uuid().required(), warehouseId: Joi.string().uuid().required() }),
    body: Joi.object({ threshold: Joi.number().integer().min(0).required() }),
  }),
  asyncHandler(async (req, res) => {
    await inventoryService.setLowStockThreshold(req.vendor.id, req.params.variantId, req.params.warehouseId, req.body.threshold);
    return ok(res, null, 'Low-stock threshold updated');
  }),
);

module.exports = router;
