const router = require('express').Router();
const Joi = require('joi');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, paginated } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { rateLimiter } = require('../../middlewares/rateLimiter.middleware');
const checkoutService = require('./checkout.service');
const orderService = require('./order.service');
const invoiceService = require('../invoices/invoice.service');

const checkoutLimiter = rateLimiter({ keyPrefix: 'checkout', windowSeconds: 60, max: 10 });

router.use(authenticate);

/**
 * @openapi
 * /orders:
 *   post:
 *     tags: [Orders]
 *     summary: Create an order from the cart (checkout)
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/',
  checkoutLimiter,
  validate({
    body: Joi.object({
      addressId: Joi.string().uuid().required(),
      paymentMethod: Joi.string().valid('stripe', 'razorpay', 'cod', 'wallet').required(),
      useWalletMinor: Joi.number().integer().min(0).default(0),
      customerNote: Joi.string().max(500),
      buyNow: Joi.object({
        variantId: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1).max(20).default(1),
      }),
    }),
  }),
  asyncHandler(async (req, res) => {
    const idempotencyKey = req.headers['idempotency-key'];
    const { order, payableMinor, replayed } = await checkoutService.createOrder(req.user.id, {
      ...req.body,
      idempotencyKey,
    });
    return created(res, {
      orderId: order.id,
      orderNumber: order.order_number,
      status: order.status,
      totalMinor: Number(order.total_minor),
      payableMinor,
      replayed,
      requiresPayment: order.status === 'pending_payment',
    }, order.status === 'confirmed' ? 'Order placed successfully' : 'Order created — complete payment');
  }),
);

router.get(
  '/',
  validate({
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(50).default(10),
      status: Joi.string().max(30),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { total, rows } = await orderService.listByUser(req.user.id, req.query);
    return paginated(res, rows, { page, limit, total });
  }),
);

router.get(
  '/:id',
  validate({ params: Joi.object({ id: Joi.string().uuid().required() }) }),
  asyncHandler(async (req, res) => ok(res, await orderService.getDetail(req.user.id, req.params.id))),
);

/**
 * @openapi
 * /orders/{id}/invoice:
 *   get:
 *     tags: [Orders]
 *     summary: Download the GST tax invoice PDF for an order
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/:id/invoice',
  validate({ params: Joi.object({ id: Joi.string().uuid().required() }) }),
  asyncHandler(async (req, res) => {
    const order = await orderService.getDetail(req.user.id, req.params.id);
    const doc = await invoiceService.generateOrderInvoice(req.user.id, req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.order_number}.pdf"`);
    doc.pipe(res);
  }),
);

router.post(
  '/:id/cancel',
  validate({
    params: Joi.object({ id: Joi.string().uuid().required() }),
    body: Joi.object({ reason: Joi.string().min(3).max(500).required() }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await orderService.cancel(req.user.id, req.params.id, req.body.reason), 'Order cancelled')),
);

module.exports = router;
