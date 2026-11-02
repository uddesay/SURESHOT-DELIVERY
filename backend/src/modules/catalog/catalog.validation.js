const Joi = require('joi');

const idParam = { params: Joi.object({ id: Joi.string().uuid().required() }) };
const slugParam = { params: Joi.object({ slug: Joi.string().max(300).required() }) };
const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
};

const variant = Joi.object({
  sku: Joi.string().alphanum().uppercase().min(3).max(64).required(),
  barcode: Joi.string().max(64),
  mrpMinor: Joi.number().integer().min(0).required(),
  salePriceMinor: Joi.number().integer().min(0).max(Joi.ref('mrpMinor')).required()
    .messages({ 'number.max': 'salePriceMinor cannot exceed mrpMinor' }),
  weightGrams: Joi.number().integer().min(1),
  lengthMm: Joi.number().integer().min(1),
  widthMm: Joi.number().integer().min(1),
  heightMm: Joi.number().integer().min(1),
  options: Joi.object().pattern(Joi.string().max(50), Joi.string().max(80)).default({}),
  initialStock: Joi.number().integer().min(0),
});

const mediaItem = Joi.object({
  type: Joi.string().valid('image', 'video', 'image_360').default('image'),
  url: Joi.string().uri().max(2048).required(),
  thumbnailUrl: Joi.string().uri().max(2048),
  altText: Joi.string().max(160),
});

const specification = Joi.object({
  group: Joi.string().max(80).default('General'),
  key: Joi.string().max(120).required(),
  value: Joi.string().max(2000).required(),
});

const faq = Joi.object({
  question: Joi.string().max(500).required(),
  answer: Joi.string().max(2000).required(),
});

const productBase = {
  title: Joi.string().min(3).max(255).trim(),
  categoryId: Joi.string().uuid(),
  brandId: Joi.string().uuid().allow(null),
  description: Joi.string().max(50000).allow(''),
  highlights: Joi.array().items(Joi.string().max(300)).max(20),
  hsnCode: Joi.string().max(10),
  taxRateBp: Joi.number().integer().min(0).max(4000),
  isReturnable: Joi.boolean(),
  returnWindowDays: Joi.number().integer().min(0).max(30),
  isCodAvailable: Joi.boolean(),
  seoTitle: Joi.string().max(160),
  seoDescription: Joi.string().max(320),
  variants: Joi.array().items(variant).min(1).max(100),
  media: Joi.array().items(mediaItem).max(30),
  specifications: Joi.array().items(specification).max(100),
  faqs: Joi.array().items(faq).max(30),
  warehouseId: Joi.string().uuid(),
  submit: Joi.boolean().default(false),
};

module.exports = {
  // categories
  categoryCreate: {
    body: Joi.object({
      parentId: Joi.string().uuid().allow(null),
      name: Joi.string().min(2).max(120).trim().required(),
      slug: Joi.string().max(140).pattern(/^[a-z0-9-]+$/),
      description: Joi.string().max(2000).allow(''),
      imageUrl: Joi.string().uri().max(2048),
      iconUrl: Joi.string().uri().max(2048),
      commissionRateBp: Joi.number().integer().min(0).max(5000),
      sortOrder: Joi.number().integer().min(0),
      isActive: Joi.boolean(),
      seoTitle: Joi.string().max(160),
      seoDescription: Joi.string().max(320),
    }),
  },
  categoryUpdate: {
    ...idParam,
    body: Joi.object({
      parentId: Joi.string().uuid().allow(null),
      name: Joi.string().min(2).max(120).trim(),
      slug: Joi.string().max(140).pattern(/^[a-z0-9-]+$/),
      description: Joi.string().max(2000).allow(''),
      imageUrl: Joi.string().uri().max(2048),
      iconUrl: Joi.string().uri().max(2048),
      commissionRateBp: Joi.number().integer().min(0).max(5000),
      sortOrder: Joi.number().integer().min(0),
      isActive: Joi.boolean(),
      seoTitle: Joi.string().max(160),
      seoDescription: Joi.string().max(320),
    }).min(1),
  },

  // brands
  brandList: { query: Joi.object({ ...pagination, limit: pagination.limit.default(50), q: Joi.string().max(100) }) },
  adminBrandList: { query: Joi.object({ ...pagination, limit: pagination.limit.default(50), q: Joi.string().max(100), active: Joi.boolean() }) },
  brandCreate: {
    body: Joi.object({
      name: Joi.string().min(1).max(120).trim().required(),
      slug: Joi.string().max(140).pattern(/^[a-z0-9-]+$/),
      logoUrl: Joi.string().uri().max(2048),
      description: Joi.string().max(2000).allow(''),
      isActive: Joi.boolean(),
    }),
  },
  brandUpdate: {
    ...idParam,
    body: Joi.object({
      name: Joi.string().min(1).max(120).trim(),
      slug: Joi.string().max(140).pattern(/^[a-z0-9-]+$/),
      logoUrl: Joi.string().uri().max(2048),
      description: Joi.string().max(2000).allow(''),
      isActive: Joi.boolean(),
    }).min(1),
  },

  // products
  productList: {
    query: Joi.object({
      ...pagination,
      q: Joi.string().trim().max(120),
      category: Joi.string().max(140),
      brand: Joi.string().max(140),
      vendor: Joi.string().uuid(),
      priceMin: Joi.number().integer().min(0),
      priceMax: Joi.number().integer().min(0),
      rating: Joi.number().min(1).max(5),
      sort: Joi.string().valid('newest', 'price_asc', 'price_desc', 'rating', 'popularity').default('newest'),
    }),
  },
  productCreate: {
    body: Joi.object({
      ...productBase,
      title: productBase.title.required(),
      categoryId: productBase.categoryId.required(),
      variants: productBase.variants.required(),
    }),
  },
  productUpdate: { ...idParam, body: Joi.object(productBase).min(1) },
  vendorProductList: {
    query: Joi.object({
      ...pagination,
      status: Joi.string().valid('draft', 'pending_approval', 'active', 'rejected', 'inactive', 'archived'),
      q: Joi.string().max(200),
    }),
  },
  adminProductList: {
    query: Joi.object({
      ...pagination,
      status: Joi.string().pattern(/^(draft|pending_approval|active|rejected|inactive|archived)(,(draft|pending_approval|active|rejected|inactive|archived))*$/),
      vendorId: Joi.string().uuid(),
      categoryId: Joi.string().uuid(),
      brandId: Joi.string().uuid(),
      stock: Joi.string().valid('in', 'low', 'out'),
      priceMin: Joi.number().integer().min(0),
      priceMax: Joi.number().integer().min(0),
      from: Joi.date().iso(),
      to: Joi.date().iso(),
      sort: Joi.string().valid('newest', 'updated', 'title', 'price_asc', 'price_desc', 'stock_asc', 'rating').default('newest'),
      q: Joi.string().max(200),
    }),
  },
  adminProductCreate: {
    body: Joi.object({
      ...productBase,
      title: productBase.title.required(),
      categoryId: productBase.categoryId.required(),
      variants: productBase.variants.required(),
      vendorId: Joi.string().uuid().required(),
      status: Joi.string().valid('draft', 'pending_approval', 'active', 'inactive').default('draft'),
    }),
  },
  adminProductUpdate: {
    ...idParam,
    body: Joi.object({
      ...productBase,
      status: Joi.string().valid('draft', 'pending_approval', 'active', 'inactive'),
    }).min(1),
  },
  adminProductBulk: {
    body: Joi.object({
      ids: Joi.array().items(Joi.string().uuid()).min(1).max(200).unique().required(),
      action: Joi.string().valid('publish', 'unpublish', 'draft', 'archive', 'category').required(),
      categoryId: Joi.string().uuid().when('action', { is: 'category', then: Joi.required(), otherwise: Joi.forbidden() }),
    }),
  },
  reject: {
    ...idParam,
    body: Joi.object({ reason: Joi.string().min(5).max(1000).required() }),
  },
  idOnly: idParam,
  slugOnly: slugParam,
};
