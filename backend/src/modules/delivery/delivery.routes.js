const Joi = require('joi');
const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, paginated } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize, requireRole } = require('../../middlewares/rbac.middleware');
const audit = require('../../middlewares/audit.middleware');
const deliveryService = require('./delivery.service');

const phone = Joi.string().pattern(/^\+?[1-9]\d{7,14}$/).message('Enter a valid mobile number');
const vehicleType = Joi.string().valid('bike', 'scooter', 'cycle', 'van', 'car');
const idParam = { params: Joi.object({ id: Joi.string().uuid().required() }) };

// ---------------- admin: fleet + dispatch ----------------
const adminRouter = express.Router();
adminRouter.use(authenticate, authorize('delivery:manage'));

/**
 * @openapi
 * /admin/delivery/partners:
 *   get:
 *     tags: [Delivery]
 *     summary: Delivery partners with live job counts and today's COD
 */
adminRouter.get('/partners', validate({ query: Joi.object({ q: Joi.string().trim().max(80).allow(''), status: Joi.string().valid('active', 'inactive') }) }),
  asyncHandler(async (req, res) => ok(res, await deliveryService.listPartners(req.query))));

adminRouter.post('/partners', validate({
  body: Joi.object({
    fullName: Joi.string().trim().min(2).max(120).required(),
    phone: phone.required(),
    email: Joi.string().email().allow('', null),
    password: Joi.string().min(8).max(128).pattern(/[a-z]/).pattern(/[A-Z]/).pattern(/[0-9]/).required()
      .messages({ 'string.pattern.base': 'Password needs upper and lower case letters and a number' }),
    vehicleType: vehicleType.default('bike'),
    vehicleNumber: Joi.string().trim().max(20).allow('', null),
    city: Joi.string().trim().max(80).allow('', null),
  }),
}), audit('delivery:partner_create', 'delivery_partner', (req, res) => res.locals.partnerId),
asyncHandler(async (req, res) => {
  const partner = await deliveryService.createPartner(req.user.id, req.body);
  res.locals.partnerId = partner.id;
  created(res, partner, 'Delivery partner added');
}));

adminRouter.patch('/partners/:id', validate({
  ...idParam,
  body: Joi.object({
    fullName: Joi.string().trim().min(2).max(120), phone, vehicleType,
    vehicleNumber: Joi.string().trim().max(20).allow(''), city: Joi.string().trim().max(80).allow(''),
    status: Joi.string().valid('active', 'inactive'),
  }).min(1),
}), audit('delivery:partner_update', 'delivery_partner'),
asyncHandler(async (req, res) => ok(res, await deliveryService.updatePartner(req.params.id, req.body), 'Delivery partner updated')));

adminRouter.get('/dispatch', validate({
  query: Joi.object({
    state: Joi.string().valid('unassigned', 'active', 'delivered').default('unassigned'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(30),
  }),
}), asyncHandler(async (req, res) => {
  const { rows, total } = await deliveryService.listDispatch(req.query);
  paginated(res, rows, { page: req.query.page, limit: req.query.limit, total });
}));

adminRouter.post('/shipments/:id/assign', validate({ ...idParam, body: Joi.object({ partnerId: Joi.string().uuid().required() }) }),
  audit('delivery:assign', 'shipment'),
  asyncHandler(async (req, res) => ok(res, await deliveryService.assignShipment(req.user.id, req.params.id, req.body.partnerId), 'Delivery partner assigned')));

// ---------------- rider: own profile + jobs ----------------
const riderRouter = express.Router();
riderRouter.use(authenticate, requireRole('delivery_partner'));

/**
 * @openapi
 * /delivery/me:
 *   get:
 *     tags: [Delivery]
 *     summary: The signed-in delivery partner's profile and today's numbers
 */
riderRouter.get('/me', asyncHandler(async (req, res) => ok(res, await deliveryService.me(req.user.id))));

riderRouter.patch('/me', validate({ body: Joi.object({ isOnline: Joi.boolean().required() }) }),
  asyncHandler(async (req, res) => ok(res, await deliveryService.setOnline(req.user.id, req.body.isOnline))));

riderRouter.get('/jobs', validate({ query: Joi.object({ state: Joi.string().valid('active', 'done').default('active') }) }),
  asyncHandler(async (req, res) => ok(res, await deliveryService.myJobs(req.user.id, req.query))));

riderRouter.post('/jobs/:id/pickup', validate(idParam),
  asyncHandler(async (req, res) => ok(res, await deliveryService.pickUp(req.user.id, req.params.id), 'Picked up — on the way')));

riderRouter.post('/jobs/:id/deliver', validate({
  ...idParam,
  body: Joi.object({ codCollected: Joi.boolean().default(false), note: Joi.string().trim().max(500).allow('') }),
}), asyncHandler(async (req, res) => ok(res, await deliveryService.deliver(req.user.id, req.params.id, req.body), 'Delivered')));

module.exports = { adminRouter, riderRouter };
