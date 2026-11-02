const router = require('express').Router();
const Joi = require('joi');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, paginated } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const notificationService = require('./notification.service');

router.use(authenticate);

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: The user's notification feed (with unread count in meta-adjacent field)
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/',
  validate({
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { total, unreadCount, rows } = await notificationService.list(req.user.id, req.query);
    // unreadCount rides along in each row page rather than a separate endpoint
    return paginated(res, { rows, unreadCount }, { page, limit, total });
  }),
);

router.post(
  '/:id/read',
  validate({ params: Joi.object({ id: Joi.string().uuid().required() }) }),
  asyncHandler(async (req, res) => {
    await notificationService.markRead(req.user.id, req.params.id);
    return ok(res, null, 'Marked as read');
  }),
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await notificationService.markAllRead(req.user.id);
    return ok(res, null, 'All notifications marked as read');
  }),
);

module.exports = router;
