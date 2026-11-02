const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, paginated } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize, requireStaff } = require('../../middlewares/rbac.middleware');
const audit = require('../../middlewares/audit.middleware');
const usersService = require('./admin-users.service');
const ordersService = require('./admin-orders.service');
const analyticsService = require('./admin-analytics.service');
const platformService = require('./admin-platform.service');
const insightsService = require('./admin-insights.service');
const reviewsService = require('./admin-reviews.service');
const inventoryService = require('../inventory/inventory.service');
const shippingService = require('../shipping/shipping.service');
const db = require('../../config/database');

const router = express.Router();
// Vendors hold permissions such as orders:read for their own data; the platform
// back office is staff-only regardless of permission overlap.
router.use(authenticate, requireStaff);

const idParam = { params: Joi.object({ id: Joi.string().uuid().required() }) };
const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
};

// ---------------- users ----------------

router.get(
  '/users',
  authorize('users:read'),
  validate({
    query: Joi.object({
      ...pagination,
      status: Joi.string().valid('active', 'suspended', 'banned', 'deleted'),
      role: Joi.string().valid('customer', 'vendor', 'staff'),
      sort: Joi.string().valid('newest', 'oldest', 'spent', 'orders', 'last_order').default('newest'),
      q: Joi.string().max(120),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { total, rows } = await usersService.list(req.query);
    return paginated(res, rows, { page, limit, total });
  }),
);

router.get(
  '/users/:id',
  authorize('users:read'),
  validate(idParam),
  asyncHandler(async (req, res) => ok(res, await usersService.getDetail(req.params.id))),
);

router.post(
  '/users/:id/suspend',
  authorize('users:suspend'),
  validate(idParam),
  audit('users:suspend', 'user'),
  asyncHandler(async (req, res) => {
    await usersService.suspend(req.user.id, req.params.id);
    return ok(res, null, 'User suspended');
  }),
);

router.post(
  '/users/:id/reactivate',
  authorize('users:suspend'),
  validate(idParam),
  audit('users:reactivate', 'user'),
  asyncHandler(async (req, res) => {
    await usersService.reactivate(req.user.id, req.params.id);
    return ok(res, null, 'User reactivated');
  }),
);

// ---------------- orders ----------------

router.get(
  '/orders',
  authorize('orders:read'),
  validate({
    query: Joi.object({
      ...pagination,
      status: Joi.string().max(200),
      paymentMethod: Joi.string().valid('stripe', 'razorpay', 'cod', 'wallet'),
      vendorId: Joi.string().uuid(),
      userId: Joi.string().uuid(),
      from: Joi.date().iso(),
      to: Joi.date().iso(),
      sort: Joi.string().valid('newest', 'oldest', 'total_desc', 'total_asc').default('newest'),
      q: Joi.string().max(120),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { total, rows } = await ordersService.list(req.query);
    return paginated(res, rows, { page, limit, total });
  }),
);

router.get(
  '/orders/:id',
  authorize('orders:read'),
  validate(idParam),
  asyncHandler(async (req, res) => ok(res, await ordersService.getDetail(req.params.id))),
);

router.post(
  '/orders/:id/cancel',
  authorize('orders:cancel'),
  validate({ ...idParam, body: Joi.object({ reason: Joi.string().min(3).max(500).required() }) }),
  audit('orders:admin_cancel', 'order'),
  asyncHandler(async (req, res) =>
    ok(res, await ordersService.cancel(req.user.id, req.params.id, req.body.reason), 'Order cancelled')),
);

router.post(
  '/orders/:id/fulfillment',
  authorize('orders:fulfill'),
  validate({
    ...idParam,
    body: Joi.object({
      action: Joi.string().valid(...Object.keys(shippingService.ADMIN_FULFILLMENT)).required(),
      courier: Joi.string().trim().max(30),
      awbNumber: Joi.string().trim().max(60),
      trackingUrl: Joi.string().uri().max(2048),
    }),
  }),
  audit('orders:admin_fulfillment', 'order'),
  asyncHandler(async (req, res) => {
    const result = await shippingService.adminAdvanceOrder(req.user.id, req.params.id, req.body);
    return ok(res, await ordersService.getDetail(req.params.id), `Order moved to ${result.status.replace(/_/g, ' ')}`);
  }),
);

// ---------------- insights ----------------

const rangeQuery = {
  from: Joi.date().iso(),
  to: Joi.date().iso().greater(Joi.ref('from')),
};

router.get(
  '/analytics/overview',
  authorize('analytics:read'),
  validate({ query: Joi.object(rangeQuery) }),
  asyncHandler(async (req, res) => ok(res, await insightsService.getOverview(req.query))),
);

router.get(
  '/analytics/breakdown',
  authorize('analytics:read'),
  validate({ query: Joi.object({ ...rangeQuery, limit: Joi.number().integer().min(1).max(25).default(8) }) }),
  asyncHandler(async (req, res) => ok(res, await insightsService.getBreakdown(req.query))),
);

router.get(
  '/activity',
  authorize('analytics:read'),
  validate({ query: Joi.object({ limit: Joi.number().integer().min(1).max(50).default(20) }) }),
  asyncHandler(async (req, res) => ok(res, await insightsService.getActivity(req.query))),
);

const canAccess = (user, permission) => user.roles.includes('super_admin') || user.permissions.includes(permission);

router.get(
  '/search',
  validate({
    query: Joi.object({
      q: Joi.string().trim().min(2).max(120).required(),
      limit: Joi.number().integer().min(1).max(10).default(5),
    }),
  }),
  asyncHandler(async (req, res) => {
    const results = await insightsService.getSearch(req.query);
    // Only return groups the caller is allowed to open.
    const groups = { products: 'products:read', orders: 'orders:read', customers: 'users:read', vendors: 'vendors:read', categories: 'categories:manage' };
    return ok(res, Object.fromEntries(Object.entries(groups)
      .map(([group, permission]) => [group, canAccess(req.user, permission) ? results[group] : []])));
  }),
);

// ---------------- inventory ----------------

const variantParam = { params: Joi.object({ variantId: Joi.string().uuid().required() }) };

router.get(
  '/inventory',
  authorize('inventory:manage'),
  validate({
    query: Joi.object({
      ...pagination,
      q: Joi.string().max(120),
      stock: Joi.string().valid('in', 'low', 'out'),
      warehouseId: Joi.string().uuid(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { total, rows } = await inventoryService.list(null, req.query);
    return paginated(res, rows, { page, limit, total });
  }),
);

router.get(
  '/inventory/summary',
  authorize('inventory:manage'),
  asyncHandler(async (req, res) => ok(res, await inventoryService.summary(null))),
);

router.get(
  '/inventory/warehouses',
  authorize('inventory:manage'),
  validate({ query: Joi.object({ vendorId: Joi.string().uuid() }) }),
  asyncHandler(async (req, res) => ok(res, await db('warehouses as w').leftJoin('vendors as v', 'v.id', 'w.vendor_id')
    .where('w.is_active', true)
    .modify((qb) => req.query.vendorId && qb.where('w.vendor_id', req.query.vendorId))
    .select('w.id', 'w.name', 'w.city', 'w.vendor_id', 'v.store_name as vendor_name')
    .orderBy('w.name'))),
);

router.get(
  '/inventory/:variantId/movements',
  authorize('inventory:manage'),
  validate({ ...variantParam, query: Joi.object(pagination) }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { total, rows } = await inventoryService.getMovements(null, req.params.variantId, req.query);
    return paginated(res, rows, { page, limit, total });
  }),
);

router.post(
  '/inventory/:variantId/adjust',
  authorize('inventory:manage'),
  validate({
    ...variantParam,
    body: Joi.object({
      warehouseId: Joi.string().uuid().required(),
      delta: Joi.number().integer().invalid(0).min(-100000).max(100000).required(),
      reason: Joi.string().trim().min(3).max(300).required(),
    }),
  }),
  audit('inventory:adjust', 'product_variant', (req) => req.params.variantId),
  asyncHandler(async (req, res) => ok(res, await inventoryService.adjustStock(
    null, req.params.variantId, req.body.warehouseId, { delta: req.body.delta, reason: req.body.reason, actorId: req.user.id },
  ), 'Stock adjusted')),
);

router.post(
  '/inventory/:variantId/transfer',
  authorize('inventory:manage'),
  validate({
    ...variantParam,
    body: Joi.object({
      fromWarehouseId: Joi.string().uuid().required(),
      toWarehouseId: Joi.string().uuid().required(),
      quantity: Joi.number().integer().min(1).max(100000).required(),
      reason: Joi.string().trim().max(300).allow(''),
    }),
  }),
  audit('inventory:transfer', 'product_variant', (req) => req.params.variantId),
  asyncHandler(async (req, res) => ok(res, await inventoryService.transferStock(
    null, req.params.variantId, { ...req.body, actorId: req.user.id },
  ), 'Stock transferred')),
);

// ---------------- reviews ----------------

router.get(
  '/reviews',
  authorize('reviews:moderate'),
  validate({
    query: Joi.object({
      ...pagination,
      status: Joi.string().valid('pending', 'approved', 'rejected'),
      rating: Joi.number().integer().min(1).max(5),
      q: Joi.string().max(120),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { total, rows } = await reviewsService.list(req.query);
    return paginated(res, rows, { page, limit, total });
  }),
);

router.post(
  '/reviews/:id/status',
  authorize('reviews:moderate'),
  validate({ ...idParam, body: Joi.object({ status: Joi.string().valid('approved', 'rejected', 'pending').required() }) }),
  audit('reviews:moderate', 'review'),
  asyncHandler(async (req, res) => ok(res, await reviewsService.setStatus(req.params.id, req.body.status), 'Review updated')),
);

// ---------------- analytics ----------------

router.get(
  '/analytics/summary',
  authorize('analytics:read'),
  asyncHandler(async (req, res) => ok(res, await analyticsService.getSummary())),
);

router.get(
  '/analytics/sales',
  authorize('analytics:read'),
  validate({
    query: Joi.object({
      interval: Joi.string().valid('day', 'month').default('day'),
      from: Joi.date().iso(),
      to: Joi.date().iso(),
    }),
  }),
  asyncHandler(async (req, res) => ok(res, await analyticsService.getSalesTrend(req.query))),
);

router.get(
  '/analytics/user-growth',
  authorize('analytics:read'),
  validate({
    query: Joi.object({
      interval: Joi.string().valid('day', 'month').default('day'),
      from: Joi.date().iso(),
      to: Joi.date().iso(),
    }),
  }),
  asyncHandler(async (req, res) => ok(res, await analyticsService.getUserGrowth(req.query))),
);

router.get(
  '/analytics/top-vendors',
  authorize('analytics:read'),
  validate({ query: Joi.object({ limit: Joi.number().integer().min(1).max(50).default(10) }) }),
  asyncHandler(async (req, res) => ok(res, await analyticsService.getTopVendors(req.query))),
);

router.get(
  '/analytics/top-products',
  authorize('analytics:read'),
  validate({ query: Joi.object({ limit: Joi.number().integer().min(1).max(50).default(10) }) }),
  asyncHandler(async (req, res) => ok(res, await analyticsService.getTopProducts(req.query))),
);

// ---------------- settings ----------------

router.get(
  '/settings',
  authorize('settings:manage'),
  asyncHandler(async (req, res) => ok(res, await platformService.listSettings())),
);

router.patch(
  '/settings/:key',
  authorize('settings:manage'),
  validate({
    params: Joi.object({ key: Joi.string().max(80).required() }),
    body: Joi.object({ value: Joi.any().required() }),
  }),
  audit('settings:update', 'setting'),
  asyncHandler(async (req, res) =>
    ok(res, await platformService.updateSetting(req.user.id, req.params.key, req.body.value), 'Setting updated')),
);

// ---------------- audit logs ----------------

router.get(
  '/audit-logs',
  authorize('audit_logs:read'),
  validate({
    query: Joi.object({
      ...pagination,
      actorId: Joi.string().uuid(),
      entityType: Joi.string().max(60),
      entityId: Joi.string().uuid(),
      action: Joi.string().max(80),
      from: Joi.date().iso(),
      to: Joi.date().iso(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { total, rows } = await platformService.listAuditLogs(req.query);
    return paginated(res, rows, { page, limit, total });
  }),
);

module.exports = router;
