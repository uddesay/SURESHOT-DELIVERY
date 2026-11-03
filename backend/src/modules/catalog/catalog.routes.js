const express = require('express');
const controller = require('./catalog.controller');
const schemas = require('./catalog.validation');
const validate = require('../../middlewares/validate.middleware');
const { publicCache } = require('../../middlewares/publicCache.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize, requireStaff } = require('../../middlewares/rbac.middleware');
const { requireApprovedVendor } = require('../../middlewares/vendor.middleware');
const audit = require('../../middlewares/audit.middleware');
const { searchLimiter } = require('../../middlewares/rateLimiter.middleware');

// ---------------- public ----------------

const categories = express.Router();
/**
 * @openapi
 * /categories:
 *   get:
 *     tags: [Catalog]
 *     summary: Nested category tree
 */
categories.get('/', publicCache(60), controller.categoryTree);
categories.get('/:slug', publicCache(60), validate(schemas.slugOnly), controller.categoryBySlug);

const brands = express.Router();
brands.get('/', validate(schemas.brandList), controller.brandList);
brands.get('/:slug', validate(schemas.slugOnly), controller.brandBySlug);

const products = express.Router();
/**
 * @openapi
 * /products:
 *   get:
 *     tags: [Catalog]
 *     summary: Browse products with filters, sorting and pagination
 */
const limitSearch = (req, res, next) => (req.query.q ? searchLimiter(req, res, next) : next());
products.get('/', limitSearch, publicCache(15), validate(schemas.productList), controller.productList);
products.get('/:slug', publicCache(8), validate(schemas.slugOnly), controller.productBySlug);
products.get('/:slug/related', publicCache(30), validate(schemas.slugOnly), controller.productRelated);

// ---------------- vendor ----------------

const vendorProducts = express.Router();
vendorProducts.use(authenticate, requireApprovedVendor);
vendorProducts.get('/', validate(schemas.vendorProductList), controller.vendorProductList);
vendorProducts.post('/', validate(schemas.productCreate), controller.vendorProductCreate);
vendorProducts.get('/:id', validate(schemas.idOnly), controller.vendorProductGet);
vendorProducts.patch('/:id', validate(schemas.productUpdate), controller.vendorProductUpdate);
vendorProducts.delete('/:id', validate(schemas.idOnly), controller.vendorProductDelete);

// ---------------- admin ----------------

const adminCatalog = express.Router();
adminCatalog.use(authenticate, requireStaff);

adminCatalog.get('/categories', authorize('categories:manage'), controller.adminCategoryList);
adminCatalog.get('/brands', authorize('brands:manage'), validate(schemas.adminBrandList), controller.adminBrandList);
adminCatalog.post('/categories', authorize('categories:manage'), validate(schemas.categoryCreate),
  audit('categories:create', 'category'), controller.categoryCreate);
adminCatalog.patch('/categories/:id', authorize('categories:manage'), validate(schemas.categoryUpdate),
  audit('categories:update', 'category'), controller.categoryUpdate);
adminCatalog.delete('/categories/:id', authorize('categories:manage'), validate(schemas.idOnly),
  audit('categories:delete', 'category'), controller.categoryDelete);

adminCatalog.post('/brands', authorize('brands:manage'), validate(schemas.brandCreate),
  audit('brands:create', 'brand'), controller.brandCreate);
adminCatalog.patch('/brands/:id', authorize('brands:manage'), validate(schemas.brandUpdate),
  audit('brands:update', 'brand'), controller.brandUpdate);
adminCatalog.delete('/brands/:id', authorize('brands:manage'), validate(schemas.idOnly),
  audit('brands:delete', 'brand'), controller.brandDelete);

adminCatalog.get('/products', authorize('products:read'), validate(schemas.adminProductList), controller.adminProductList);
adminCatalog.post('/products', authorize('products:create'), validate(schemas.adminProductCreate),
  audit('products:admin_create', 'product'), controller.adminProductCreate);
adminCatalog.post('/products/bulk', authorize('products:update'), validate(schemas.adminProductBulk),
  audit('products:bulk', 'product'), controller.adminProductBulk);
adminCatalog.get('/products/:id', authorize('products:read'), validate(schemas.idOnly), controller.adminProductGet);
adminCatalog.patch('/products/:id', authorize('products:update'), validate(schemas.adminProductUpdate),
  audit('products:admin_update', 'product'), controller.adminProductUpdate);
adminCatalog.post('/products/:id/approve', authorize('products:approve'), validate(schemas.idOnly),
  audit('products:approve', 'product'), controller.adminProductApprove);
adminCatalog.post('/products/:id/reject', authorize('products:approve'), validate(schemas.reject),
  audit('products:reject', 'product'), controller.adminProductReject);

module.exports = { categories, brands, products, vendorProducts, adminCatalog };
