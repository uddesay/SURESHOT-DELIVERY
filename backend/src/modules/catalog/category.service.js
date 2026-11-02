const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const redis = require('../../config/redis');
const ApiError = require('../../utils/ApiError');
const { slugify } = require('../../utils/slugify');
const logger = require('../../utils/logger');

const CACHE_KEY = 'catalog:category_tree';
const CACHE_TTL = 600;

const invalidateCache = () => redis.del(CACHE_KEY).catch(() => {});

/** Nested category tree, cached in Redis. */
const getTree = async () => {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    logger.warn({ err }, 'Category cache read failed');
  }

  const rows = await db('categories')
    .whereNull('deleted_at')
    .where({ is_active: true })
    .orderBy('sort_order')
    .select('id', 'parent_id', 'name', 'slug', 'image_url', 'icon_url', 'sort_order');

  const byParent = new Map();
  for (const row of rows) {
    const key = row.parent_id || 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(row);
  }
  const attach = (node) => ({ ...node, children: (byParent.get(node.id) || []).map(attach) });
  const tree = (byParent.get('root') || []).map(attach);

  redis.set(CACHE_KEY, JSON.stringify(tree), 'EX', CACHE_TTL).catch(() => {});
  return tree;
};

const getBySlug = async (slug) => {
  const category = await db('categories').where({ slug }).whereNull('deleted_at').first();
  if (!category) throw ApiError.notFound('Category');
  const children = await db('categories')
    .where({ parent_id: category.id, is_active: true })
    .whereNull('deleted_at')
    .orderBy('sort_order');
  return { ...category, children };
};

/** IDs of a category and all its descendants (for product filtering). */
const getDescendantIds = async (categoryId) => {
  const { rows } = await db.raw(
    `WITH RECURSIVE tree AS (
       SELECT id FROM categories WHERE id = ?
       UNION ALL
       SELECT c.id FROM categories c JOIN tree t ON c.parent_id = t.id
     ) SELECT id FROM tree`,
    [categoryId],
  );
  return rows.map((r) => r.id);
};

// -------- admin --------

const create = async (attrs) => {
  if (attrs.parentId) {
    const parent = await db('categories').where({ id: attrs.parentId }).whereNull('deleted_at').first();
    if (!parent) throw ApiError.businessRule('Parent category does not exist');
  }
  const [row] = await db('categories')
    .insert({
      id: uuid(),
      parent_id: attrs.parentId || null,
      name: attrs.name,
      slug: attrs.slug || slugify(attrs.name),
      description: attrs.description || null,
      image_url: attrs.imageUrl || null,
      icon_url: attrs.iconUrl || null,
      commission_rate_bp: attrs.commissionRateBp ?? 1000,
      sort_order: attrs.sortOrder ?? 0,
      is_active: attrs.isActive ?? true,
      seo_title: attrs.seoTitle || null,
      seo_description: attrs.seoDescription || null,
    })
    .returning('*');
  await invalidateCache();
  return row;
};

const update = async (id, attrs) => {
  const existing = await db('categories').where({ id }).whereNull('deleted_at').first();
  if (!existing) throw ApiError.notFound('Category');
  if (attrs.parentId === id) throw ApiError.businessRule('A category cannot be its own parent');
  if (attrs.parentId) {
    const descendants = await getDescendantIds(id);
    if (descendants.includes(attrs.parentId)) {
      throw ApiError.businessRule('Cannot move a category under its own descendant');
    }
  }

  const patch = {
    ...(attrs.parentId !== undefined ? { parent_id: attrs.parentId } : {}),
    ...(attrs.name !== undefined ? { name: attrs.name } : {}),
    ...(attrs.slug !== undefined ? { slug: attrs.slug } : {}),
    ...(attrs.description !== undefined ? { description: attrs.description } : {}),
    ...(attrs.imageUrl !== undefined ? { image_url: attrs.imageUrl } : {}),
    ...(attrs.iconUrl !== undefined ? { icon_url: attrs.iconUrl } : {}),
    ...(attrs.commissionRateBp !== undefined ? { commission_rate_bp: attrs.commissionRateBp } : {}),
    ...(attrs.sortOrder !== undefined ? { sort_order: attrs.sortOrder } : {}),
    ...(attrs.isActive !== undefined ? { is_active: attrs.isActive } : {}),
    ...(attrs.seoTitle !== undefined ? { seo_title: attrs.seoTitle } : {}),
    ...(attrs.seoDescription !== undefined ? { seo_description: attrs.seoDescription } : {}),
  };
  const [row] = await db('categories').where({ id }).update(patch).returning('*');
  await invalidateCache();
  return row;
};

const remove = async (id) => {
  const children = await db('categories').where({ parent_id: id }).whereNull('deleted_at').first();
  if (children) throw ApiError.businessRule('Delete or move child categories first');
  const products = await db('products').where({ category_id: id }).whereNull('deleted_at').first();
  if (products) throw ApiError.businessRule('Category has products — move them first');

  const updated = await db('categories').where({ id }).whereNull('deleted_at')
    .update({ deleted_at: db.fn.now() });
  if (!updated) throw ApiError.notFound('Category');
  await invalidateCache();
};

/** Every category including inactive ones, with live product counts, for staff. */
const listAdmin = async () => {
  const rows = await db('categories as c')
    .whereNull('c.deleted_at')
    .orderBy(['c.sort_order', 'c.name'])
    .select('c.id', 'c.parent_id', 'c.name', 'c.slug', 'c.description', 'c.image_url', 'c.commission_rate_bp',
      'c.sort_order', 'c.is_active', 'c.seo_title', 'c.seo_description', 'c.updated_at',
      db.raw('(SELECT COUNT(*)::int FROM products p WHERE p.category_id = c.id AND p.deleted_at IS NULL) as product_count'));
  return rows;
};

module.exports = { listAdmin, getTree, getBySlug, getDescendantIds, create, update, remove };
