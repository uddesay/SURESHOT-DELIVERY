const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { slugify } = require('../../utils/slugify');

const list = ({ page = 1, limit = 50, q }) => {
  const base = db('brands').whereNull('deleted_at').where({ is_active: true })
    .modify((qb) => q && qb.whereILike('name', `%${q}%`));
  return Promise.all([
    base.clone().count('* as count').first(),
    base.clone().orderBy('name').offset((page - 1) * limit).limit(limit),
  ]).then(([{ count }, rows]) => ({ total: Number(count), rows }));
};

const getBySlug = async (slug) => {
  const brand = await db('brands').where({ slug }).whereNull('deleted_at').first();
  if (!brand) throw ApiError.notFound('Brand');
  return brand;
};

const create = async (attrs) => {
  const [row] = await db('brands')
    .insert({
      id: uuid(),
      name: attrs.name,
      slug: attrs.slug || slugify(attrs.name),
      logo_url: attrs.logoUrl || null,
      description: attrs.description || null,
      is_active: attrs.isActive ?? true,
    })
    .returning('*');
  return row;
};

const update = async (id, attrs) => {
  const patch = {
    ...(attrs.name !== undefined ? { name: attrs.name } : {}),
    ...(attrs.slug !== undefined ? { slug: attrs.slug } : {}),
    ...(attrs.logoUrl !== undefined ? { logo_url: attrs.logoUrl } : {}),
    ...(attrs.description !== undefined ? { description: attrs.description } : {}),
    ...(attrs.isActive !== undefined ? { is_active: attrs.isActive } : {}),
  };
  const [row] = await db('brands').where({ id }).whereNull('deleted_at').update(patch).returning('*');
  if (!row) throw ApiError.notFound('Brand');
  return row;
};

const remove = async (id) => {
  const products = await db('products').where({ brand_id: id }).whereNull('deleted_at').first();
  if (products) throw ApiError.businessRule('Brand has products — reassign them first');
  const updated = await db('brands').where({ id }).whereNull('deleted_at')
    .update({ deleted_at: db.fn.now() });
  if (!updated) throw ApiError.notFound('Brand');
};

/** All brands, active or not, with product counts for staff. */
const listAdmin = async ({ page = 1, limit = 50, q, active }) => {
  const base = db('brands').whereNull('deleted_at')
    .modify((qb) => {
      if (q) qb.whereILike('name', `%${q}%`);
      if (active !== undefined) qb.where({ is_active: active });
    });
  const [{ count }, rows] = await Promise.all([
    base.clone().count('* as count').first(),
    base.clone().orderBy('name').offset((page - 1) * limit).limit(limit)
      .select('brands.*', db.raw('(SELECT COUNT(*)::int FROM products p WHERE p.brand_id = brands.id AND p.deleted_at IS NULL) as product_count')),
  ]);
  return { total: Number(count), rows };
};

module.exports = {
  listAdmin, list, getBySlug, create, update, remove };
