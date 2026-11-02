const router = require('express').Router();
const Joi = require('joi');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, paginated } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const walletService = require('./wallet.service');

router.use(authenticate);

/**
 * @openapi
 * /wallet:
 *   get:
 *     tags: [Wallet]
 *     summary: Current balance and reward points
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', asyncHandler(async (req, res) => ok(res, await walletService.getBalance(req.user.id))));

router.get(
  '/transactions',
  validate({
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { total, rows } = await walletService.listTransactions(req.user.id, req.query);
    return paginated(res, rows, { page, limit, total });
  }),
);

module.exports = router;
