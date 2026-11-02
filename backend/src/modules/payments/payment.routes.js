const router = require('express').Router();
const Joi = require('joi');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const paymentService = require('./payment.service');
const stripe = require('./providers/stripe.provider');
const razorpay = require('./providers/razorpay.provider');

/**
 * @openapi
 * /payments/intent:
 *   post:
 *     tags: [Payments]
 *     summary: Create a provider payment intent for a pending order
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/intent',
  authenticate,
  validate({ body: Joi.object({ orderId: Joi.string().uuid().required() }) }),
  asyncHandler(async (req, res) =>
    ok(res, await paymentService.createIntent(req.user.id, req.body.orderId), 'Payment intent created')),
);

/** Razorpay client callback — server re-verifies the checkout signature. */
router.post(
  '/razorpay/confirm',
  authenticate,
  validate({
    body: Joi.object({
      rpOrderId: Joi.string().max(64).required(),
      rpPaymentId: Joi.string().max(64).required(),
      signature: Joi.string().max(256).required(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const order = await paymentService.confirmRazorpayCheckout(req.user.id, req.body);
    return ok(res, { orderId: order.id, status: order.status }, 'Payment confirmed');
  }),
);

/**
 * Webhooks — signature verified against the raw body captured by
 * express.json({ verify }) in app.js. Always 2xx on accepted events so
 * providers stop retrying; signature failures get 400.
 */
router.post('/webhooks/stripe', asyncHandler(async (req, res) => {
  const event = stripe.verifyWebhook(req.rawBody, req.headers['stripe-signature']);
  if (!event) throw ApiError.badRequest('Invalid webhook signature');
  await paymentService.handleStripeWebhook(event);
  return res.json({ received: true });
}));

router.post('/webhooks/razorpay', asyncHandler(async (req, res) => {
  const event = razorpay.verifyWebhook(req.rawBody, req.headers['x-razorpay-signature']);
  if (!event) throw ApiError.badRequest('Invalid webhook signature');
  await paymentService.handleRazorpayWebhook(event);
  return res.json({ received: true });
}));

module.exports = router;
