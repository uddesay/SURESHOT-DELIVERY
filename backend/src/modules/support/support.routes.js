const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, paginated } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/rbac.middleware');
const supportService = require('./support.service');

const idParam = { params: Joi.object({ id: Joi.string().uuid().required() }) };
const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
};
const messageBody = {
  body: Joi.object({
    body: Joi.string().min(1).max(4000).required(),
    attachments: Joi.array().items(Joi.string().uri().max(2048)).max(5),
  }),
};

// ---------------- customer ----------------

const customerRouter = express.Router();
customerRouter.use(authenticate);

/**
 * @openapi
 * /support/tickets:
 *   post:
 *     tags: [Support]
 *     summary: Open a support ticket with an initial message
 *     security: [{ bearerAuth: [] }]
 */
customerRouter.post(
  '/',
  validate({
    body: Joi.object({
      subject: Joi.string().min(3).max(200).required(),
      category: Joi.string().max(40),
      priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
      orderId: Joi.string().uuid(),
      message: Joi.string().min(1).max(4000).required(),
    }),
  }),
  asyncHandler(async (req, res) => created(res, await supportService.createTicket(req.user.id, req.body), 'Support ticket created')),
);

customerRouter.get('/', validate({ query: Joi.object(pagination) }), asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const { total, rows } = await supportService.listMyTickets(req.user.id, req.query);
  return paginated(res, rows, { page, limit, total });
}));

customerRouter.get('/:id', validate(idParam), asyncHandler(async (req, res) =>
  ok(res, await supportService.getTicketDetail(req.params.id, { id: req.user.id, roles: req.user.roles }))));

customerRouter.post('/:id/messages', validate({ ...idParam, ...messageBody }), asyncHandler(async (req, res) =>
  created(res, await supportService.postMessage(
    req.params.id,
    { id: req.user.id, roles: req.user.roles },
    req.body.body,
    req.body.attachments,
  ), 'Message sent')));

// ---------------- staff ----------------

const staffRouter = express.Router();
staffRouter.use(authenticate, authorize('support:manage'));

staffRouter.get('/', validate({
  query: Joi.object({
    ...pagination,
    status: Joi.string().valid('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
    assignedTo: Joi.string().uuid(),
  }),
}), asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const { total, rows } = await supportService.listAllTickets(req.query);
  return paginated(res, rows, { page, limit, total });
}));

staffRouter.get('/:id', validate(idParam), asyncHandler(async (req, res) =>
  ok(res, await supportService.getTicketDetail(req.params.id, { id: req.user.id, roles: req.user.roles }))));

staffRouter.post('/:id/messages', validate({ ...idParam, ...messageBody }), asyncHandler(async (req, res) =>
  created(res, await supportService.postMessage(
    req.params.id,
    { id: req.user.id, roles: req.user.roles },
    req.body.body,
    req.body.attachments,
  ), 'Message sent')));

staffRouter.post('/:id/assign', validate({
  ...idParam,
  body: Joi.object({ assigneeId: Joi.string().uuid().required() }),
}), asyncHandler(async (req, res) => {
  await supportService.assign(req.params.id, req.body.assigneeId);
  return ok(res, null, 'Ticket assigned');
}));

staffRouter.post('/:id/status', validate({
  ...idParam,
  body: Joi.object({ status: Joi.string().valid('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed').required() }),
}), asyncHandler(async (req, res) => {
  await supportService.updateStatus(req.params.id, req.body.status);
  return ok(res, null, 'Ticket status updated');
}));

module.exports = { customerRouter, staffRouter };
