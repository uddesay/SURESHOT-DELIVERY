const router = require('express').Router();
const Joi = require('joi');
const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');

router.use(authenticate);

const getDefaultWishlist = async (userId) => {
  let wl = await db('wishlists').where({ user_id: userId, is_default: true }).first();
  if (!wl) [wl] = await db('wishlists').insert({ id: uuid(), user_id: userId }).returning('*');
  return wl;
};

const productCards = async (productIds) => {
  if (!productIds.length) return [];
  const rows = await db('products as p')
    .leftJoin('brands as b', 'b.id', 'p.brand_id')
    .whereIn('p.id', productIds)
    .whereNull('p.deleted_at')
    .select('p.id', 'p.title', 'p.slug', 'p.status', 'p.rating_avg', 'p.rating_count', 'b.name as brand_name');
  const variants = await db('product_variants')
    .whereIn('product_id', productIds)
    .where({ is_default: true })
    .whereNull('deleted_at')
    .select('product_id', 'sale_price_minor', 'mrp_minor');
  const media = await db('product_media').whereIn('product_id', productIds).orderBy('sort_order');
  const priceMap = new Map(variants.map((v) => [v.product_id, v]));
  const imgMap = new Map();
  for (const m of media) if (!imgMap.has(m.product_id)) imgMap.set(m.product_id, m.thumbnail_url || m.url);
  return rows.map((r) => ({
    ...r,
    priceMinor: priceMap.get(r.id) ? Number(priceMap.get(r.id).sale_price_minor) : null,
    mrpMinor: priceMap.get(r.id) ? Number(priceMap.get(r.id).mrp_minor) : null,
    image: imgMap.get(r.id) || null,
  }));
};

/**
 * @openapi
 * /wishlist:
 *   get:
 *     tags: [Wishlist]
 *     summary: Default wishlist with product cards
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', asyncHandler(async (req, res) => {
  const wl = await getDefaultWishlist(req.user.id);
  const items = await db('wishlist_items').where({ wishlist_id: wl.id }).orderBy('added_at', 'desc');
  const cards = await productCards(items.map((i) => i.product_id));
  const cardById = new Map(cards.map((c) => [c.id, c]));
  return ok(res, items.map((i) => ({ addedAt: i.added_at, product: cardById.get(i.product_id) })).filter((i) => i.product));
}));

router.post(
  '/items',
  validate({ body: Joi.object({ productId: Joi.string().uuid().required() }) }),
  asyncHandler(async (req, res) => {
    const product = await db('products')
      .where({ id: req.body.productId }).whereNull('deleted_at').first();
    if (!product) throw ApiError.notFound('Product');
    const wl = await getDefaultWishlist(req.user.id);
    await db('wishlist_items')
      .insert({ wishlist_id: wl.id, product_id: req.body.productId })
      .onConflict(['wishlist_id', 'product_id'])
      .ignore();
    return ok(res, null, 'Added to wishlist');
  }),
);

router.delete(
  '/items/:productId',
  validate({ params: Joi.object({ productId: Joi.string().uuid().required() }) }),
  asyncHandler(async (req, res) => {
    const wl = await getDefaultWishlist(req.user.id);
    await db('wishlist_items').where({ wishlist_id: wl.id, product_id: req.params.productId }).del();
    return ok(res, null, 'Removed from wishlist');
  }),
);

// -------- recently viewed --------

const recentlyViewed = require('express').Router();
recentlyViewed.use(authenticate);

recentlyViewed.post(
  '/',
  validate({ body: Joi.object({ productId: Joi.string().uuid().required() }) }),
  asyncHandler(async (req, res) => {
    await db('recently_viewed')
      .insert({ user_id: req.user.id, product_id: req.body.productId, viewed_at: db.fn.now() })
      .onConflict(['user_id', 'product_id'])
      .merge({ viewed_at: db.fn.now() });
    // keep the list bounded
    await db.raw(
      `DELETE FROM recently_viewed WHERE user_id = ? AND product_id NOT IN (
         SELECT product_id FROM recently_viewed WHERE user_id = ? ORDER BY viewed_at DESC LIMIT 50)`,
      [req.user.id, req.user.id],
    );
    return ok(res, null);
  }),
);

recentlyViewed.get('/', asyncHandler(async (req, res) => {
  const rows = await db('recently_viewed')
    .where({ user_id: req.user.id })
    .orderBy('viewed_at', 'desc')
    .limit(20);
  const cards = await productCards(rows.map((r) => r.product_id));
  const cardById = new Map(cards.map((c) => [c.id, c]));
  return ok(res, rows.map((r) => cardById.get(r.product_id)).filter(Boolean));
}));

module.exports = { wishlist: router, recentlyViewed };
