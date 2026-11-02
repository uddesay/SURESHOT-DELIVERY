const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');

const PUBLIC_FIELDS = [
  'v.id', 'v.store_name', 'v.store_slug', 'v.description', 'v.logo_url', 'v.banner_url',
  'v.rating_avg', 'v.rating_count', 'v.created_at',
];

/** Active products per store, plus each store's first warehouse city. */
const withStats = (qb) => qb
  .select(
    db.raw("(SELECT COUNT(*)::int FROM products p WHERE p.vendor_id = v.id AND p.status = 'active' AND p.deleted_at IS NULL) AS product_count"),
    db.raw('(SELECT w.city FROM warehouses w WHERE w.vendor_id = v.id ORDER BY w.created_at LIMIT 1) AS city'),
  );

/** Category ids for a slug: the category itself and its direct children. */
const categoryIds = async (slug) => {
  const cat = await db('categories').where({ slug, is_active: true }).first();
  if (!cat) return null;
  const children = await db('categories').where({ parent_id: cat.id, is_active: true }).pluck('id');
  return [cat.id, ...children];
};

/** For each store: the root departments it sells in and up to 3 product photos. */
const decorate = async (rows) => {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const depts = await db('products as p')
    .join('categories as c', 'c.id', 'p.category_id')
    .leftJoin('categories as parent', 'parent.id', 'c.parent_id')
    .whereIn('p.vendor_id', ids).where('p.status', 'active').whereNull('p.deleted_at')
    .distinct('p.vendor_id', db.raw('COALESCE(parent.name, c.name) AS name'), db.raw('COALESCE(parent.slug, c.slug) AS slug'));
  const photos = await db.raw(`
    SELECT vendor_id, url FROM (
      SELECT p.vendor_id, m.url, ROW_NUMBER() OVER (PARTITION BY p.vendor_id ORDER BY p.sold_count DESC, p.id) AS rn
      FROM products p JOIN product_media m ON m.product_id = p.id AND m.sort_order = 0
      WHERE p.vendor_id = ANY(?) AND p.status = 'active' AND p.deleted_at IS NULL
    ) x WHERE rn <= 3`, [ids]);
  return rows.map((r) => ({
    ...r,
    departments: depts.filter((d) => d.vendor_id === r.id).map(({ name, slug }) => ({ name, slug })),
    preview_images: photos.rows.filter((p) => p.vendor_id === r.id).map((p) => p.url),
  }));
};

const list = async ({ q, category, sort = 'popular', page = 1, limit = 20 }) => {
  const base = db('vendors as v').where('v.status', 'approved').whereNull('v.deleted_at');
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    base.where((w) => w.whereILike('v.store_name', like).orWhereILike('v.description', like));
  }
  if (category) {
    const ids = await categoryIds(category);
    if (!ids) return { rows: [], total: 0 };
    base.whereExists(db('products as p').whereRaw('p.vendor_id = v.id').whereIn('p.category_id', ids)
      .where('p.status', 'active').whereNull('p.deleted_at'));
  }
  const [{ total }] = await base.clone().count({ total: '*' });
  const order = {
    popular: [{ column: 'v.rating_count', order: 'desc' }, { column: 'v.store_name' }],
    rating: [{ column: 'v.rating_avg', order: 'desc' }, { column: 'v.store_name' }],
    name: [{ column: 'v.store_name' }],
    newest: [{ column: 'v.created_at', order: 'desc' }],
  }[sort];
  const rows = await withStats(base.clone().select(PUBLIC_FIELDS)).orderBy(order).limit(limit).offset((page - 1) * limit);
  return { rows: await decorate(rows), total: Number(total) };
};

const getBySlug = async (slug) => {
  const row = await withStats(db('vendors as v').select(PUBLIC_FIELDS))
    .where({ 'v.store_slug': slug, 'v.status': 'approved' }).whereNull('v.deleted_at').first();
  if (!row) throw ApiError.notFound('Store');
  const [store] = await decorate([row]);
  return store;
};

module.exports = { list, getBySlug };
