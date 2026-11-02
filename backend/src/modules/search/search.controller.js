const asyncHandler = require('../../utils/asyncHandler');
const { ok, paginated } = require('../../utils/ApiResponse');
const searchService = require('./search.service');

const search = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await searchService.searchProducts(req.query);
  return paginated(res, { rows: result.rows, facets: result.facets, source: result.source }, {
    page, limit, total: result.total,
  });
});

const suggest = asyncHandler(async (req, res) => {
  const suggestions = await searchService.suggest(req.query.q);
  return ok(res, suggestions);
});

const reindex = asyncHandler(async (req, res) => {
  const count = await searchService.reindexAll();
  return ok(res, { indexed: count }, 'Reindex complete');
});

module.exports = { search, suggest, reindex };
