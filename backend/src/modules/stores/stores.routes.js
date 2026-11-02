const Joi = require('joi');
const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, paginated } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const storesService = require('./stores.service');

const router = express.Router();

/**
 * @openapi
 * /stores:
 *   get:
 *     tags: [Stores]
 *     summary: Search approved stores by name, optionally within a department
 */
router.get('/', validate({
  query: Joi.object({
    q: Joi.string().trim().max(80).allow(''),
    category: Joi.string().max(140),
    sort: Joi.string().valid('popular', 'rating', 'name', 'newest').default('popular'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(20),
  }),
}), asyncHandler(async (req, res) => {
  const { rows, total } = await storesService.list(req.query);
  paginated(res, rows, { page: req.query.page, limit: req.query.limit, total });
}));

/**
 * @openapi
 * /stores/{slug}:
 *   get:
 *     tags: [Stores]
 *     summary: Public store profile (use /products?vendor={id} for its catalogue)
 */
router.get('/:slug', validate({ params: Joi.object({ slug: Joi.string().max(140).required() }) }),
  asyncHandler(async (req, res) => ok(res, await storesService.getBySlug(req.params.slug))));

module.exports = router;
