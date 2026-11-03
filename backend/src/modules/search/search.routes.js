const router = require('express').Router();
const controller = require('./search.controller');
const schemas = require('./search.validation');
const validate = require('../../middlewares/validate.middleware');
const { searchLimiter } = require('../../middlewares/rateLimiter.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/rbac.middleware');

/**
 * @openapi
 * /search:
 *   get:
 *     tags: [Search]
 *     summary: Full-text product search with filters, facets and sorting
 */
router.get('/', searchLimiter, validate(schemas.search), controller.search);

/**
 * @openapi
 * /search/suggest:
 *   get:
 *     tags: [Search]
 *     summary: Autocomplete suggestions
 */
router.get('/suggest', searchLimiter, validate(schemas.suggest), controller.suggest);

// Admin: full reindex (reconciliation)
router.post('/reindex', authenticate, authorize('products:approve'), controller.reindex);

module.exports = router;
