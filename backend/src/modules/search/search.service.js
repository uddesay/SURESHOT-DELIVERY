const esClient = require('../../config/elasticsearch');
const db = require('../../config/database');
const logger = require('../../utils/logger');

const INDEX = 'products';

/**
 * Product search index. Indexing is best-effort (never blocks the write path);
 * searchProducts falls back to Postgres trigram search when ES is unavailable.
 */

const ensureIndex = async () => {
  const exists = await esClient.indices.exists({ index: INDEX });
  if (exists) return;
  await esClient.indices.create({
    index: INDEX,
    settings: {
      analysis: {
        analyzer: {
          autocomplete: { tokenizer: 'autocomplete_tokenizer', filter: ['lowercase'] },
          autocomplete_search: { tokenizer: 'lowercase' },
        },
        tokenizer: {
          autocomplete_tokenizer: {
            type: 'edge_ngram', min_gram: 2, max_gram: 15, token_chars: ['letter', 'digit'],
          },
        },
      },
    },
    mappings: {
      properties: {
        title: {
          type: 'text',
          analyzer: 'standard',
          fields: {
            autocomplete: { type: 'text', analyzer: 'autocomplete', search_analyzer: 'autocomplete_search' },
            keyword: { type: 'keyword' },
          },
        },
        description: { type: 'text' },
        slug: { type: 'keyword' },
        category_id: { type: 'keyword' },
        category_name: { type: 'keyword' },
        brand_id: { type: 'keyword' },
        brand_name: { type: 'keyword' },
        vendor_id: { type: 'keyword' },
        tags: { type: 'keyword' },
        price_minor: { type: 'long' },
        mrp_minor: { type: 'long' },
        discount_percent: { type: 'integer' },
        rating_avg: { type: 'float' },
        rating_count: { type: 'integer' },
        sold_count: { type: 'integer' },
        in_stock: { type: 'boolean' },
        is_cod_available: { type: 'boolean' },
        image_url: { type: 'keyword', index: false },
        options: { type: 'object', enabled: true },
        published_at: { type: 'date' },
      },
    },
  });
  logger.info(`Elasticsearch index '${INDEX}' created`);
};

/** Builds the ES document for a product from Postgres (default variant drives price/stock). */
const buildDocument = async (productId) => {
  const product = await db('products as p')
    .leftJoin('categories as c', 'c.id', 'p.category_id')
    .leftJoin('brands as b', 'b.id', 'p.brand_id')
    .where('p.id', productId)
    .select('p.*', 'c.name as category_name', 'b.name as brand_name')
    .first();
  if (!product) return null;

  const variants = await db('product_variants')
    .where({ product_id: productId, is_active: true })
    .whereNull('deleted_at')
    .orderBy('is_default', 'desc');
  const primary = variants[0];
  if (!primary) return null;

  const stock = await db('inventory_stocks')
    .whereIn('variant_id', variants.map((v) => v.id))
    .sum({ available: db.raw('quantity - reserved') })
    .first();

  const media = await db('product_media')
    .where({ product_id: productId })
    .orderBy('sort_order')
    .first();

  const options = await db('variant_options')
    .whereIn('variant_id', variants.map((v) => v.id))
    .select('option_name', 'option_value');
  const optionMap = {};
  for (const o of options) {
    optionMap[o.option_name] = [...new Set([...(optionMap[o.option_name] || []), o.option_value])];
  }

  const tags = await db('product_tags as pt')
    .join('tags as t', 't.id', 'pt.tag_id')
    .where('pt.product_id', productId)
    .pluck('t.name');

  const price = Number(primary.sale_price_minor);
  const mrp = Number(primary.mrp_minor);

  return {
    title: product.title,
    description: product.description?.slice(0, 2000) || '',
    slug: product.slug,
    category_id: product.category_id,
    category_name: product.category_name,
    brand_id: product.brand_id,
    brand_name: product.brand_name,
    vendor_id: product.vendor_id,
    tags,
    price_minor: price,
    mrp_minor: mrp,
    discount_percent: mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0,
    rating_avg: Number(product.rating_avg),
    rating_count: product.rating_count,
    sold_count: product.sold_count,
    in_stock: Number(stock?.available || 0) > 0,
    is_cod_available: product.is_cod_available,
    image_url: media?.thumbnail_url || media?.url || null,
    options: optionMap,
    published_at: product.published_at,
  };
};

const indexProduct = async (productId) => {
  try {
    const doc = await buildDocument(productId);
    if (!doc) return;
    await esClient.index({ index: INDEX, id: productId, document: doc });
  } catch (err) {
    logger.warn({ err, productId }, 'ES index failed (non-blocking)');
  }
};

const removeProduct = async (productId) => {
  try {
    await esClient.delete({ index: INDEX, id: productId });
  } catch (err) {
    if (err.meta?.statusCode !== 404) logger.warn({ err, productId }, 'ES delete failed');
  }
};

/** Full-catalog reindex (reconciliation job / initial bootstrap). */
const reindexAll = async () => {
  await ensureIndex();
  const ids = await db('products').where({ status: 'active' }).whereNull('deleted_at').pluck('id');
  for (const id of ids) await indexProduct(id); // sequential: bounded memory, dev-scale
  return ids.length;
};

const buildFilters = (params) => {
  const filter = [];
  if (params.category) filter.push({ term: { category_id: params.category } });
  if (params.brand) filter.push({ term: { brand_id: params.brand } });
  if (params.vendor) filter.push({ term: { vendor_id: params.vendor } });
  if (params.inStock) filter.push({ term: { in_stock: true } });
  if (params.rating) filter.push({ range: { rating_avg: { gte: params.rating } } });
  if (params.priceMin || params.priceMax) {
    filter.push({
      range: {
        price_minor: {
          ...(params.priceMin ? { gte: params.priceMin } : {}),
          ...(params.priceMax ? { lte: params.priceMax } : {}),
        },
      },
    });
  }
  return filter;
};

const SORTS = {
  relevance: ['_score'],
  price_asc: [{ price_minor: 'asc' }],
  price_desc: [{ price_minor: 'desc' }],
  rating: [{ rating_avg: 'desc' }],
  newest: [{ published_at: 'desc' }],
  popularity: [{ sold_count: 'desc' }],
};

const searchProducts = async (params) => {
  const { q, page = 1, limit = 20, sort = 'relevance' } = params;
  // Skip ES outright while it's in its failure cooldown — otherwise every
  // search pays the connect timeout before reaching the fallback below.
  if (!esClient.isAvailable()) return searchProductsFallback(params);

  try {
    const result = await esClient.search({
      index: INDEX,
      from: (page - 1) * limit,
      size: limit,
      query: {
        bool: {
          must: q
            ? [{
              multi_match: {
                query: q,
                fields: ['title^3', 'title.autocomplete^2', 'brand_name^2', 'category_name', 'tags^2', 'description'],
                fuzziness: 'AUTO',
              },
            }]
            : [{ match_all: {} }],
          filter: buildFilters(params),
        },
      },
      sort: SORTS[sort] || SORTS.relevance,
      aggs: {
        brands: { terms: { field: 'brand_name', size: 20 } },
        categories: { terms: { field: 'category_name', size: 20 } },
        price_ranges: {
          range: {
            field: 'price_minor',
            ranges: [
              { to: 50000 }, { from: 50000, to: 100000 }, { from: 100000, to: 500000 },
              { from: 500000, to: 1000000 }, { from: 1000000 },
            ],
          },
        },
      },
    });

    esClient.markAvailable();
    return {
      source: 'elasticsearch',
      total: result.hits.total.value,
      rows: result.hits.hits.map((h) => ({ id: h._id, score: h._score, ...h._source })),
      facets: {
        brands: result.aggregations.brands.buckets,
        categories: result.aggregations.categories.buckets,
        priceRanges: result.aggregations.price_ranges.buckets,
      },
    };
  } catch (err) {
    esClient.markUnavailable(err);
    return searchProductsFallback(params);
  }
};

/** Postgres trigram fallback keeps search alive when ES is down. */
const searchProductsFallback = async ({ q, page = 1, limit = 20 }) => {
  const base = db('products as p')
    .where('p.status', 'active')
    .whereNull('p.deleted_at')
    .modify((qb) => {
      if (q) qb.whereRaw('p.title % ? OR p.title ILIKE ?', [q, `%${q}%`]);
    });

  const [{ count }] = await base.clone().count('* as count');
  const rows = await base
    .clone()
    .leftJoin('brands as b', 'b.id', 'p.brand_id')
    .select('p.id', 'p.title', 'p.slug', 'p.rating_avg', 'p.rating_count', 'b.name as brand_name')
    .orderByRaw(q ? 'similarity(p.title, ?) DESC' : 'p.published_at DESC NULLS LAST', q ? [q] : [])
    .offset((page - 1) * limit)
    .limit(limit);

  return { source: 'postgres_fallback', total: Number(count), rows, facets: null };
};

const suggest = async (q) => {
  // Autocomplete is the most latency-sensitive path in the app (it fires per
  // keystroke), so the cooldown check matters even more here than in search.
  const suggestFallback = () => db('products')
    .where({ status: 'active' })
    .whereNull('deleted_at')
    .whereILike('title', `${q}%`)
    .select('id', 'title', 'slug')
    .limit(8);

  if (!esClient.isAvailable()) return suggestFallback();

  try {
    const result = await esClient.search({
      index: INDEX,
      size: 8,
      _source: ['title', 'slug', 'image_url', 'price_minor'],
      query: { match: { 'title.autocomplete': { query: q, operator: 'and' } } },
    });
    esClient.markAvailable();
    return result.hits.hits.map((h) => ({ id: h._id, ...h._source }));
  } catch (err) {
    esClient.markUnavailable(err);
    return suggestFallback();
  }
};

module.exports = { ensureIndex, indexProduct, removeProduct, reindexAll, searchProducts, suggest };
