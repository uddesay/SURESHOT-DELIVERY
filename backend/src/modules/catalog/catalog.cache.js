const db = require('../../config/database');
const cache = require('../../utils/cache');
const logger = require('../../utils/logger');

/**
 * Cache invalidation for the public catalogue.
 *
 * Orders, cancellations and stock changes are frequent: they evict only the affected
 * products' detail pages, so the (much larger) listing caches keep serving everyone.
 * Rarer events (a product approved, edited, removed) bust the whole catalogue namespace
 * so the change shows up immediately. All of it is best-effort: a failure here must never
 * fail the order or the stock update that triggered it.
 */
const evictSlugs = async (slugs) => {
  await Promise.all(slugs.flatMap((slug) => [cache.del('catalog', `p:${slug}`), cache.del('catalog', `rel:${slug}`)]));
};

const evictOrder = async (orderId) => {
  try {
    const slugs = await db('order_items as i').join('products as p', 'p.id', 'i.product_id').where('i.order_id', orderId).distinct().pluck('p.slug');
    await evictSlugs(slugs);
  } catch (err) { logger.debug({ err }, 'catalog cache eviction failed'); }
};

const evictVariants = async (variantIds) => {
  try {
    const slugs = await db('product_variants as v').join('products as p', 'p.id', 'v.product_id').whereIn('v.id', variantIds).distinct().pluck('p.slug');
    await evictSlugs(slugs);
  } catch (err) { logger.debug({ err }, 'catalog cache eviction failed'); }
};

const bustCatalog = () => cache.bust('catalog').catch(() => {});

module.exports = { evictOrder, evictVariants, bustCatalog };
