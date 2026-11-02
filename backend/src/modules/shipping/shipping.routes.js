const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, paginated } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/rbac.middleware');
const { requireApprovedVendor } = require('../../middlewares/vendor.middleware');
const shippingService = require('./shipping.service');

const idParam = { params: Joi.object({ id: Joi.string().uuid().required() }) };

// ---------------- vendor fulfillment ----------------

const vendorRouter = express.Router();
vendorRouter.use(authenticate, requireApprovedVendor);

/**
 * @openapi
 * /vendor/shipments:
 *   get:
 *     tags: [Fulfillment]
 *     summary: Vendor's shipments (sub-orders) with status filter
 *     security: [{ bearerAuth: [] }]
 */
vendorRouter.get(
  '/',
  validate({
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      status: Joi.string().valid('pending', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'rto'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { total, rows } = await shippingService.listVendorShipments(req.vendor.id, req.query);
    return paginated(res, rows, { page, limit, total });
  }),
);

vendorRouter.get('/:id', validate(idParam), asyncHandler(async (req, res) =>
  ok(res, await shippingService.getShipmentDetail(req.vendor.id, req.params.id))));

vendorRouter.post('/:id/pack', validate(idParam), asyncHandler(async (req, res) =>
  ok(res, await shippingService.markPacked(req.vendor.id, req.params.id), 'Shipment marked as packed')));

vendorRouter.post(
  '/:id/ship',
  validate({
    ...idParam,
    body: Joi.object({ courier: Joi.string().valid('shiprocket', 'delhivery', 'bluedart').required() }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await shippingService.ship(req.vendor.id, req.params.id, req.body), 'Shipment handed off to courier')),
);

vendorRouter.post(
  '/:id/status',
  validate({
    ...idParam,
    body: Joi.object({ status: Joi.string().valid('out_for_delivery', 'delivered').required() }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await shippingService.updateManualStatus(req.vendor.id, req.params.id, req.body.status), 'Shipment updated')),
);

vendorRouter.post(
  '/:id/cancel',
  validate({ ...idParam, body: Joi.object({ reason: Joi.string().min(3).max(500).required() }) }),
  asyncHandler(async (req, res) =>
    ok(res, await shippingService.cancelShipment(req.vendor.id, req.params.id, req.body.reason), 'Shipment cancelled')),
);

// ---------------- courier webhooks ----------------
// Signature verification is provider-specific; Shiprocket/Delhivery support a
// shared-secret query param or header configurable in their dashboards.
const webhookRouter = express.Router();

const verifyWebhookSecret = (req, res, next) => {
  const secret = req.headers['x-webhook-secret'] || req.query.secret;
  if (!process.env.SHIPPING_WEBHOOK_SECRET || secret !== process.env.SHIPPING_WEBHOOK_SECRET) {
    return res.status(401).json({ success: false, message: 'Invalid webhook secret' });
  }
  return next();
};

webhookRouter.post('/shiprocket', verifyWebhookSecret, asyncHandler(async (req, res) => {
  const { awb, current_status: status, location } = req.body;
  if (awb) await shippingService.ingestTrackingEvent('shiprocket', awb, { status, location, occurredAt: new Date() });
  return res.json({ received: true });
}));

webhookRouter.post('/delhivery', verifyWebhookSecret, asyncHandler(async (req, res) => {
  const { Waybill: awb, Status: status, StatusLocation: location } = req.body;
  if (awb) await shippingService.ingestTrackingEvent('delhivery', awb, { status, location, occurredAt: new Date() });
  return res.json({ received: true });
}));

// ---------------- admin ----------------

const adminRouter = express.Router();
adminRouter.use(authenticate, authorize('orders:fulfill'));

adminRouter.get(
  '/',
  validate({
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      status: Joi.string(),
      vendorId: Joi.string().uuid(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const db = require('../../config/database');
    const { page, limit, status, vendorId } = req.query;
    const base = db('order_shipments as s')
      .join('orders as o', 'o.id', 's.order_id')
      .join('vendors as v', 'v.id', 's.vendor_id')
      .modify((qb) => {
        if (status) qb.where('s.status', status);
        if (vendorId) qb.where('s.vendor_id', vendorId);
      });
    const [{ count }] = await base.clone().count('* as count');
    const rows = await base.clone()
      .orderBy('s.created_at', 'desc')
      .offset((page - 1) * limit)
      .limit(limit)
      .select('s.*', 'o.order_number', 'v.store_name as vendor_name');
    return paginated(res, rows, { page, limit, total: Number(count) });
  }),
);

module.exports = { vendorRouter, webhookRouter, adminRouter };
