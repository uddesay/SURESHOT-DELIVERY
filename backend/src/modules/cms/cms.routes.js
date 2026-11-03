const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, paginated } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const { publicCache } = require('../../middlewares/publicCache.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/rbac.middleware');
const audit = require('../../middlewares/audit.middleware');
const cmsService = require('./cms.service');
const cache = require('../../utils/cache');

const idParam = { params: Joi.object({ id: Joi.string().uuid().required() }) };
const slugParam = { params: Joi.object({ slug: Joi.string().max(200).required() }) };
const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
};

// ================= public =================

const publicRouter = express.Router();

/**
 * @openapi
 * /cms/banners:
 *   get:
 *     tags: [CMS]
 *     summary: Active banners for a placement (home hero, category top, etc.)
 */
publicRouter.get(
  '/banners',
  publicCache(60),
  validate({ query: Joi.object({ placement: Joi.string().max(30) }) }),
  asyncHandler(async (req, res) =>
    ok(res, await cache.wrap('cms', `banners:${req.query.placement || 'all'}`, 60, () => cmsService.listBanners({ placement: req.query.placement, activeOnly: true })))),
);

publicRouter.get(
  '/pages/:slug',
  validate(slugParam),
  asyncHandler(async (req, res) => {
    const page = await cmsService.getPageBySlug(req.params.slug);
    if (!page.is_published) return res.status(404).json({ success: false, message: 'Page not found' });
    return ok(res, page);
  }),
);

publicRouter.get(
  '/blogs',
  validate({ query: Joi.object(pagination) }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { total, rows } = await cmsService.listBlogs({ ...req.query, publishedOnly: true });
    return paginated(res, rows, { page, limit, total });
  }),
);

publicRouter.get(
  '/blogs/:slug',
  validate(slugParam),
  asyncHandler(async (req, res) => {
    const blog = await cmsService.getBlogBySlug(req.params.slug);
    if (!blog.is_published) return res.status(404).json({ success: false, message: 'Blog post not found' });
    return ok(res, blog);
  }),
);

publicRouter.get(
  '/faqs',
  validate({ query: Joi.object({ category: Joi.string().max(60) }) }),
  asyncHandler(async (req, res) =>
    ok(res, await cmsService.listFaqs({ category: req.query.category, activeOnly: true }))),
);

// ================= admin =================

const adminRouter = express.Router();
adminRouter.use(authenticate, authorize('cms:manage'));

// -- banners --
adminRouter.get('/banners', asyncHandler(async (req, res) => ok(res, await cmsService.listBanners({}))));
adminRouter.post(
  '/banners',
  validate({
    body: Joi.object({
      title: Joi.string().max(160).required(),
      imageUrl: Joi.string().uri().max(2048).required(),
      placement: Joi.string().max(30),
      targetType: Joi.string().valid('product', 'category', 'url', 'flash_sale', 'none'),
      targetValue: Joi.string().max(2048).allow(null, ''),
      sortOrder: Joi.number().integer().min(0),
      startsAt: Joi.date().iso(),
      endsAt: Joi.date().iso(),
      isActive: Joi.boolean(),
    }),
  }),
  audit('cms:banner_create', 'banner'),
  asyncHandler(async (req, res) => created(res, await cmsService.createBanner(req.body), 'Banner created')),
);
adminRouter.patch(
  '/banners/:id',
  validate({
    ...idParam,
    body: Joi.object({
      title: Joi.string().max(160),
      imageUrl: Joi.string().uri().max(2048),
      placement: Joi.string().max(30),
      targetType: Joi.string().valid('product', 'category', 'url', 'flash_sale', 'none'),
      targetValue: Joi.string().max(2048).allow(null, ''),
      sortOrder: Joi.number().integer().min(0),
      startsAt: Joi.date().iso().allow(null),
      endsAt: Joi.date().iso().allow(null),
      isActive: Joi.boolean(),
    }).min(1),
  }),
  audit('cms:banner_update', 'banner'),
  asyncHandler(async (req, res) => ok(res, await cmsService.updateBanner(req.params.id, req.body), 'Banner updated')),
);
adminRouter.delete(
  '/banners/:id',
  validate(idParam),
  audit('cms:banner_delete', 'banner'),
  asyncHandler(async (req, res) => {
    await cmsService.deleteBanner(req.params.id);
    return ok(res, null, 'Banner deleted');
  }),
);

// -- pages --
adminRouter.get('/pages', asyncHandler(async (req, res) => ok(res, await cmsService.listPages({}))));
adminRouter.post(
  '/pages',
  validate({
    body: Joi.object({
      title: Joi.string().max(200).required(),
      slug: Joi.string().max(140).pattern(/^[a-z0-9-]+$/),
      body: Joi.string().required(),
      isPublished: Joi.boolean(),
    }),
  }),
  audit('cms:page_create', 'page'),
  asyncHandler(async (req, res) => created(res, await cmsService.createPage(req.body), 'Page created')),
);
adminRouter.patch(
  '/pages/:id',
  validate({
    ...idParam,
    body: Joi.object({
      title: Joi.string().max(200),
      slug: Joi.string().max(140).pattern(/^[a-z0-9-]+$/),
      body: Joi.string(),
      isPublished: Joi.boolean(),
    }).min(1),
  }),
  audit('cms:page_update', 'page'),
  asyncHandler(async (req, res) => ok(res, await cmsService.updatePage(req.params.id, req.body), 'Page updated')),
);
adminRouter.delete(
  '/pages/:id',
  validate(idParam),
  audit('cms:page_delete', 'page'),
  asyncHandler(async (req, res) => {
    await cmsService.deletePage(req.params.id);
    return ok(res, null, 'Page deleted');
  }),
);

// -- blogs --
adminRouter.get(
  '/blogs',
  authorize('blogs:manage'),
  validate({ query: Joi.object(pagination) }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const { total, rows } = await cmsService.listBlogs(req.query);
    return paginated(res, rows, { page, limit, total });
  }),
);
adminRouter.post(
  '/blogs',
  authorize('blogs:manage'),
  validate({
    body: Joi.object({
      title: Joi.string().max(200).required(),
      slug: Joi.string().max(200).pattern(/^[a-z0-9-]+$/),
      excerpt: Joi.string().max(400).allow(''),
      body: Joi.string().required(),
      coverImageUrl: Joi.string().uri().max(2048),
      isPublished: Joi.boolean(),
    }),
  }),
  audit('cms:blog_create', 'blog'),
  asyncHandler(async (req, res) => created(res, await cmsService.createBlog(req.user.id, req.body), 'Blog post created')),
);
adminRouter.patch(
  '/blogs/:id',
  authorize('blogs:manage'),
  validate({
    ...idParam,
    body: Joi.object({
      title: Joi.string().max(200),
      slug: Joi.string().max(200).pattern(/^[a-z0-9-]+$/),
      excerpt: Joi.string().max(400).allow(''),
      body: Joi.string(),
      coverImageUrl: Joi.string().uri().max(2048),
      isPublished: Joi.boolean(),
    }).min(1),
  }),
  audit('cms:blog_update', 'blog'),
  asyncHandler(async (req, res) => ok(res, await cmsService.updateBlog(req.params.id, req.body), 'Blog post updated')),
);
adminRouter.delete(
  '/blogs/:id',
  authorize('blogs:manage'),
  validate(idParam),
  audit('cms:blog_delete', 'blog'),
  asyncHandler(async (req, res) => {
    await cmsService.deleteBlog(req.params.id);
    return ok(res, null, 'Blog post deleted');
  }),
);

// -- faqs --
adminRouter.get('/faqs', asyncHandler(async (req, res) => ok(res, await cmsService.listFaqs({}))));
adminRouter.post(
  '/faqs',
  validate({
    body: Joi.object({
      category: Joi.string().max(60),
      question: Joi.string().required(),
      answer: Joi.string().required(),
      sortOrder: Joi.number().integer().min(0),
      isActive: Joi.boolean(),
    }),
  }),
  audit('cms:faq_create', 'faq'),
  asyncHandler(async (req, res) => created(res, await cmsService.createFaq(req.body), 'FAQ created')),
);
adminRouter.patch(
  '/faqs/:id',
  validate({
    ...idParam,
    body: Joi.object({
      category: Joi.string().max(60),
      question: Joi.string(),
      answer: Joi.string(),
      sortOrder: Joi.number().integer().min(0),
      isActive: Joi.boolean(),
    }).min(1),
  }),
  audit('cms:faq_update', 'faq'),
  asyncHandler(async (req, res) => ok(res, await cmsService.updateFaq(req.params.id, req.body), 'FAQ updated')),
);
adminRouter.delete(
  '/faqs/:id',
  validate(idParam),
  audit('cms:faq_delete', 'faq'),
  asyncHandler(async (req, res) => {
    await cmsService.deleteFaq(req.params.id);
    return ok(res, null, 'FAQ deleted');
  }),
);

module.exports = { publicRouter, adminRouter };
