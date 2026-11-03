const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, paginated } = require('../../utils/ApiResponse');
const categoryService = require('./category.service');
const brandService = require('./brand.service');
const productService = require('./product.service');
const cache = require('../../utils/cache');

// -------- categories --------
const categoryTree = asyncHandler(async (req, res) => ok(res, await categoryService.getTree()));
const categoryBySlug = asyncHandler(async (req, res) => ok(res, await categoryService.getBySlug(req.params.slug)));
const categoryCreate = asyncHandler(async (req, res) => created(res, await categoryService.create(req.body), 'Category created'));
const categoryUpdate = asyncHandler(async (req, res) => ok(res, await categoryService.update(req.params.id, req.body), 'Category updated'));
const categoryDelete = asyncHandler(async (req, res) => {
  await categoryService.remove(req.params.id);
  return ok(res, null, 'Category deleted');
});

// -------- brands --------
const brandList = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const { total, rows } = await brandService.list(req.query);
  return paginated(res, rows, { page, limit, total });
});
const brandBySlug = asyncHandler(async (req, res) => ok(res, await brandService.getBySlug(req.params.slug)));
const brandCreate = asyncHandler(async (req, res) => created(res, await brandService.create(req.body), 'Brand created'));
const brandUpdate = asyncHandler(async (req, res) => ok(res, await brandService.update(req.params.id, req.body), 'Brand updated'));
const brandDelete = asyncHandler(async (req, res) => {
  await brandService.remove(req.params.id);
  return ok(res, null, 'Brand deleted');
});

// -------- products: public --------
// Public catalogue reads are the hot path at launch: shared cache + single-flight.
// Short TTLs keep prices and stock fresh; checkout always re-validates against the database.
const stable = (query) => JSON.stringify(Object.keys(query).sort().map((k) => [k, query[k]]));
const productList = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const { total, rows } = await cache.wrap('catalog', `list:${stable(req.query)}`, 20, () => productService.listPublic(req.query));
  return paginated(res, rows, { page, limit, total });
});
const productBySlug = asyncHandler(async (req, res) => ok(res, await cache.wrap('catalog', `p:${req.params.slug}`, 10, () => productService.getBySlug(req.params.slug))));
const productRelated = asyncHandler(async (req, res) => ok(res, await cache.wrap('catalog', `rel:${req.params.slug}`, 60, () => productService.getRelated(req.params.slug))));

// -------- products: vendor --------
const vendorProductList = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const { total, rows } = await productService.listByVendor(req.vendor.id, req.query);
  return paginated(res, rows, { page, limit, total });
});
const vendorProductGet = asyncHandler(async (req, res) => {
  await productService.getOwned(req.vendor.id, req.params.id);
  return ok(res, await productService.getDetail({ 'p.id': req.params.id }));
});
const vendorProductCreate = asyncHandler(async (req, res) =>
  created(res, await productService.create(req.vendor, req.body), 'Product created'));
const vendorProductUpdate = asyncHandler(async (req, res) =>
  ok(res, await productService.update(req.vendor, req.params.id, req.body), 'Product updated'));
const vendorProductDelete = asyncHandler(async (req, res) => {
  await productService.remove(req.vendor, req.params.id);
  return ok(res, null, 'Product archived');
});

// -------- products: admin --------
const adminProductList = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const { total, rows } = await productService.listForAdmin(req.query);
  return paginated(res, rows, { page, limit, total });
});
const adminCategoryList = asyncHandler(async (req, res) => ok(res, await categoryService.listAdmin()));
const adminBrandList = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const { total, rows } = await brandService.listAdmin(req.query);
  return paginated(res, rows, { page, limit, total });
});
const adminProductGet = asyncHandler(async (req, res) => ok(res, await productService.adminGet(req.params.id)));
const adminProductCreate = asyncHandler(async (req, res) =>
  created(res, await productService.adminCreate(req.body), 'Product created'));
const adminProductUpdate = asyncHandler(async (req, res) =>
  ok(res, await productService.adminUpdate(req.params.id, req.body), 'Product saved'));
const adminProductBulk = asyncHandler(async (req, res) => {
  const result = await productService.adminBulk(req.body);
  return ok(res, result, `${result.updated} product(s) updated`);
});
const adminProductApprove = asyncHandler(async (req, res) =>
  ok(res, await productService.approve(req.user.id, req.params.id), 'Product approved and published'));
const adminProductReject = asyncHandler(async (req, res) => {
  await productService.reject(req.user.id, req.params.id, req.body.reason);
  return ok(res, null, 'Product rejected');
});

module.exports = {
  adminCategoryList, adminBrandList,
  adminProductCreate, adminProductUpdate, adminProductBulk,
  categoryTree, categoryBySlug, categoryCreate, categoryUpdate, categoryDelete,
  brandList, brandBySlug, brandCreate, brandUpdate, brandDelete,
  productList, productBySlug, productRelated,
  vendorProductList, vendorProductGet, vendorProductCreate, vendorProductUpdate, vendorProductDelete,
  adminProductList, adminProductGet, adminProductApprove, adminProductReject,
};
