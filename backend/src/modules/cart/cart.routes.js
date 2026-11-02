const router = require('express').Router();
const Joi = require('joi');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const cartService = require('./cart.service');

router.use(authenticate);

/**
 * @openapi
 * /cart:
 *   get:
 *     tags: [Cart]
 *     summary: Get cart with live pricing, stock and totals
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', asyncHandler(async (req, res) => ok(res, await cartService.getCart(req.user.id))));

/**
 * @openapi
 * /cart/preview:
 *   get:
 *     tags: [Cart]
 *     summary: Buy Now totals preview for a single variant, without touching the persisted cart
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/preview',
  validate({
    query: Joi.object({
      variantId: Joi.string().uuid().required(),
      quantity: Joi.number().integer().min(1).max(20).default(1),
    }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await cartService.previewSingleItem(req.query.variantId, req.query.quantity))),
);

router.post(
  '/items',
  validate({
    body: Joi.object({
      variantId: Joi.string().uuid().required(),
      quantity: Joi.number().integer().min(1).max(20).default(1),
    }),
  }),
  asyncHandler(async (req, res) => ok(res, await cartService.addItem(req.user.id, req.body), 'Added to cart')),
);

router.patch(
  '/items/:id',
  validate({
    params: Joi.object({ id: Joi.string().uuid().required() }),
    body: Joi.object({
      quantity: Joi.number().integer().min(1).max(20),
      saveForLater: Joi.boolean(),
    }).min(1),
  }),
  asyncHandler(async (req, res) => ok(res, await cartService.updateItem(req.user.id, req.params.id, req.body), 'Cart updated')),
);

router.delete(
  '/items/:id',
  validate({ params: Joi.object({ id: Joi.string().uuid().required() }) }),
  asyncHandler(async (req, res) => ok(res, await cartService.removeItem(req.user.id, req.params.id), 'Removed from cart')),
);

router.post(
  '/coupon',
  validate({ body: Joi.object({ code: Joi.string().max(40).trim().required() }) }),
  asyncHandler(async (req, res) => ok(res, await cartService.applyCoupon(req.user.id, req.body.code), 'Coupon applied')),
);

router.delete(
  '/coupon',
  asyncHandler(async (req, res) => ok(res, await cartService.removeCoupon(req.user.id), 'Coupon removed')),
);

module.exports = router;
