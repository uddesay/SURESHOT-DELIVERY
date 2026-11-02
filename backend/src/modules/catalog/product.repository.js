const db = require('../../config/database');

const PUBLIC_SORTS = {
  newest: ['p.published_at', 'desc'],
  price_asc: ['min_price', 'asc'],
  price_desc: ['min_price', 'desc'],
  rating: ['p.rating_avg', 'desc'],
  popularity: ['p.sold_count', 'desc'],
};

/** Public product cards with default-variant pricing. */
const listPublic = async ({ categoryIds, brandId, vendorId, vendor, priceMin, priceMax, rating, page, limit, sort, q }) => {
  const base = db('products as p')
    .join('product_variants as v', function join() {
      this.on('v.product_id', 'p.id').andOnVal('v.is_active', true);
    })
    .whereNull('p.deleted_at')
    .whereNull('v.deleted_at')
    .where('p.status', 'active')
    .modify((qb) => {
      if (q) qb.whereILike('p.title', `%${q.replace(/[\\%_]/g, '\\$&')}%`);
      if (categoryIds?.length) qb.whereIn('p.category_id', categoryIds);
      if (brandId) qb.where('p.brand_id', brandId);
      if (vendorId || vendor) qb.where('p.vendor_id', vendorId || vendor);
      if (rating) qb.where('p.rating_avg', '>=', rating);
      if (priceMin) qb.where('v.sale_price_minor', '>=', priceMin);
      if (priceMax) qb.where('v.sale_price_minor', '<=', priceMax);
    })
    .groupBy('p.id');

  const countRow = await db.from(base.clone().select('p.id').as('sub')).count('* as count').first();

  const [sortCol, sortDir] = PUBLIC_SORTS[sort] || PUBLIC_SORTS.newest;
  const rows = await base
    .clone()
    .select(
      'p.id', 'p.title', 'p.slug', 'p.rating_avg', 'p.rating_count', 'p.sold_count',
      'p.brand_id', 'p.category_id', 'p.is_cod_available',
      db.raw('MIN(v.sale_price_minor)::bigint as min_price'),
      db.raw('MIN(v.mrp_minor)::bigint as min_mrp'),
    )
    .orderByRaw(`${sortCol === 'min_price' ? 'MIN(v.sale_price_minor)' : sortCol} ${sortDir} NULLS LAST`)
    .offset((page - 1) * limit)
    .limit(limit);

  // Attach primary image per product in one query
  const ids = rows.map((r) => r.id);
  const media = ids.length
    ? await db('product_media')
      .whereIn('product_id', ids)
      .where({ media_type: 'image' })
      .orderBy(['product_id', 'sort_order'])
      .select('product_id', 'url', 'thumbnail_url')
    : [];
  const firstImage = new Map();
  for (const m of media) if (!firstImage.has(m.product_id)) firstImage.set(m.product_id, m);

  return {
    total: Number(countRow.count),
    rows: rows.map((r) => ({
      ...r,
      min_price: Number(r.min_price),
      min_mrp: Number(r.min_mrp),
      image: firstImage.get(r.id) || null,
    })),
  };
};

/** Full product detail: variants + options + media + specs + faqs + stock. */
const getDetail = async (where) => {
  const product = await db('products as p')
    .leftJoin('categories as c', 'c.id', 'p.category_id')
    .leftJoin('brands as b', 'b.id', 'p.brand_id')
    .leftJoin('vendors as ven', 'ven.id', 'p.vendor_id')
    .where(where)
    .whereNull('p.deleted_at')
    .select(
      'p.*',
      'c.name as category_name', 'c.slug as category_slug',
      'b.name as brand_name', 'b.slug as brand_slug',
      'ven.store_name as vendor_name', 'ven.store_slug as vendor_slug', 'ven.rating_avg as vendor_rating',
    )
    .first();
  if (!product) return null;

  const [variants, media, specs, faqs] = await Promise.all([
    db('product_variants').where({ product_id: product.id }).whereNull('deleted_at').orderBy('is_default', 'desc'),
    db('product_media').where({ product_id: product.id }).orderBy('sort_order'),
    db('product_specifications').where({ product_id: product.id }).orderBy(['group_name', 'sort_order']),
    db('product_faqs').where({ product_id: product.id }).orderBy('sort_order'),
  ]);

  const variantIds = variants.map((v) => v.id);
  const [options, stocks] = await Promise.all([
    variantIds.length
      ? db('variant_options').whereIn('variant_id', variantIds)
      : [],
    variantIds.length
      ? db('inventory_stocks')
        .whereIn('variant_id', variantIds)
        .groupBy('variant_id')
        .select('variant_id')
        .sum({ quantity: 'quantity' })
        .sum({ reserved: 'reserved' })
      : [],
  ]);

  const stockByVariant = new Map(stocks.map((s) => [s.variant_id, Number(s.quantity) - Number(s.reserved)]));
  const optionsByVariant = new Map();
  for (const o of options) {
    if (!optionsByVariant.has(o.variant_id)) optionsByVariant.set(o.variant_id, []);
    optionsByVariant.get(o.variant_id).push({ name: o.option_name, value: o.option_value });
  }

  return {
    ...product,
    variants: variants.map((v) => ({
      ...v,
      mrp_minor: Number(v.mrp_minor),
      sale_price_minor: Number(v.sale_price_minor),
      options: optionsByVariant.get(v.id) || [],
      available_stock: stockByVariant.get(v.id) ?? 0,
      in_stock: (stockByVariant.get(v.id) ?? 0) > 0,
    })),
    media,
    specifications: specs,
    faqs,
  };
};

/** Vendor's own products grid. */
const listByVendor = async (vendorId, { page, limit, status, q }) => {
  const base = db('products as p')
    .where('p.vendor_id', vendorId)
    .whereNull('p.deleted_at')
    .modify((qb) => {
      if (status) qb.where('p.status', status);
      if (q) qb.whereILike('p.title', `%${q}%`);
    });

  const [{ count }] = await base.clone().count('* as count');
  const rows = await base
    .clone()
    .orderBy('p.created_at', 'desc')
    .offset((page - 1) * limit)
    .limit(limit)
    .leftJoin('categories as c', 'c.id', 'p.category_id')
    .select(
      'p.id', 'p.title', 'p.slug', 'p.status', 'p.rejection_reason', 'p.rating_avg', 'p.sold_count', 'p.created_at',
      'c.name as category_name',
      db.raw('(SELECT MIN(v.sale_price_minor) FROM product_variants v WHERE v.product_id = p.id AND v.is_active) AS min_price'),
      db.raw('(SELECT MIN(v.mrp_minor) FROM product_variants v WHERE v.product_id = p.id AND v.is_active) AS min_mrp'),
      db.raw('(SELECT COUNT(*)::int FROM product_variants v WHERE v.product_id = p.id AND v.is_active) AS variant_count'),
      db.raw(`(SELECT COALESCE(SUM(st.quantity - st.reserved), 0)::int FROM inventory_stocks st
        JOIN product_variants v ON v.id = st.variant_id WHERE v.product_id = p.id AND v.is_active) AS stock`),
      db.raw('(SELECT m.url FROM product_media m WHERE m.product_id = p.id ORDER BY m.sort_order LIMIT 1) AS image_url'),
    );
  return { total: Number(count), rows };
};

const ADMIN_SORTS = {
  newest: ['p.created_at', 'desc'],
  updated: ['p.updated_at', 'desc'],
  title: ['p.title', 'asc'],
  price_asc: ['price_minor', 'asc'],
  price_desc: ['price_minor', 'desc'],
  stock_asc: ['stock', 'asc'],
  rating: ['p.rating_avg', 'desc'],
};

/** Admin catalogue: every vendor's products with merchandising and stock signals. */
const listForAdmin = async ({
  page, limit, status, vendorId, categoryId, brandId, stock, priceMin, priceMax, from, to, q, sort = 'newest',
}) => {
  const stockSql = `(SELECT COALESCE(SUM(s.quantity - s.reserved), 0)::int FROM inventory_stocks s
    JOIN product_variants sv ON sv.id = s.variant_id WHERE sv.product_id = p.id AND sv.deleted_at IS NULL)`;
  const base = db('products as p')
    .join('vendors as ven', 'ven.id', 'p.vendor_id')
    .leftJoin('categories as c', 'c.id', 'p.category_id')
    .leftJoin('brands as b', 'b.id', 'p.brand_id')
    .leftJoin('product_variants as dv', function joinDefault() {
      this.on('dv.product_id', 'p.id').andOn('dv.is_default', db.raw('true')).andOnNull('dv.deleted_at');
    })
    .whereNull('p.deleted_at')
    .modify((qb) => {
      if (status) qb.whereIn('p.status', String(status).split(','));
      if (vendorId) qb.where('p.vendor_id', vendorId);
      if (categoryId) qb.where('p.category_id', categoryId);
      if (brandId) qb.where('p.brand_id', brandId);
      if (priceMin !== undefined) qb.where('dv.sale_price_minor', '>=', priceMin);
      if (priceMax !== undefined) qb.where('dv.sale_price_minor', '<=', priceMax);
      if (from) qb.where('p.created_at', '>=', from);
      if (to) qb.where('p.created_at', '<', to);
      if (stock === 'out') qb.whereRaw(`${stockSql} <= 0`);
      if (stock === 'low') qb.whereRaw(`${stockSql} BETWEEN 1 AND 5`);
      if (stock === 'in') qb.whereRaw(`${stockSql} > 0`);
      if (q) qb.where((qb2) => qb2.whereILike('p.title', `%${q}%`).orWhereILike('dv.sku', `%${q}%`));
    });

  const [{ count }] = await base.clone().count('* as count');
  const [column, direction] = ADMIN_SORTS[sort] || ADMIN_SORTS.newest;
  const rows = await base
    .clone()
    .orderBy(column, direction)
    .orderBy('p.id')
    .offset((page - 1) * limit)
    .limit(limit)
    .select(
      'p.id', 'p.title', 'p.slug', 'p.status', 'p.created_at', 'p.updated_at', 'p.rating_avg', 'p.rating_count',
      'p.sold_count', 'p.rejection_reason', 'p.vendor_id', 'p.category_id', 'p.brand_id',
      'ven.store_name as vendor_name', 'c.name as category_name', 'b.name as brand_name',
      'dv.sku', db.raw('dv.sale_price_minor::bigint as price_minor'), db.raw('dv.mrp_minor::bigint as mrp_minor'),
      db.raw(`${stockSql} as stock`),
      db.raw('(SELECT url FROM product_media m WHERE m.product_id = p.id ORDER BY m.sort_order LIMIT 1) as image_url'),
      db.raw('(SELECT COUNT(*)::int FROM product_variants cv WHERE cv.product_id = p.id AND cv.deleted_at IS NULL) as variant_count'),
    );
  return {
    total: Number(count),
    rows: rows.map((r) => ({
      ...r,
      price_minor: r.price_minor == null ? null : Number(r.price_minor),
      mrp_minor: r.mrp_minor == null ? null : Number(r.mrp_minor),
      rating_avg: Number(r.rating_avg),
    })),
  };
};

module.exports = { listPublic, getDetail, listByVendor, listForAdmin };
