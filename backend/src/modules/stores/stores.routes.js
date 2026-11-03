const Joi = require('joi');
const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, paginated } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const storesService = require('./stores.service');
const cache = require('../../utils/cache');
const { publicCache } = require('../../middlewares/publicCache.middleware');

const router = express.Router();

/**
 * @openapi
 * /stores:
 *   get:
 *     tags: [Stores]
 *     summary: Search approved stores by name, optionally within a department
 */
router.get('/', publicCache(15), validate({
  query: Joi.object({
    q: Joi.string().trim().max(80).allow(''),
    category: Joi.string().max(140),
    sort: Joi.string().valid('popular', 'rating', 'name', 'newest').default('popular'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(20),
  }),
}), asyncHandler(async (req, res) => {
  const key = JSON.stringify(Object.keys(req.query).sort().map((k) => [k, req.query[k]]));
  const { rows, total } = await cache.wrap('stores', `list:${key}`, 30, () => storesService.list(req.query));
  paginated(res, rows, { page: req.query.page, limit: req.query.limit, total });
}));

/**
 * @openapi
 * /stores/{slug}:
 *   get:
 *     tags: [Stores]
 *     summary: Public store profile (use /products?vendor={id} for its catalogue)
 */
router.get('/:slug', publicCache(15), validate({ params: Joi.object({ slug: Joi.string().max(140).required() }) }),
  asyncHandler(async (req, res) => ok(res, await cache.wrap('stores', `s:${req.params.slug}`, 30, () => storesService.getBySlug(req.params.slug)))));

module.exports = router;
