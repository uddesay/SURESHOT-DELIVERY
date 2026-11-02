const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { slugify, uniqueSlug } = require('../../utils/slugify');

// ---------------------------------------------------------------- banners

const listBanners = async ({ placement, activeOnly }) => {
  const now = new Date();
  return db('banners')
    .modify((qb) => {
      if (placement) qb.where({ placement });
      if (activeOnly) {
        qb.where({ is_active: true })
          .where((qb2) => qb2.whereNull('starts_at').orWhere('starts_at', '<=', now))
          .where((qb2) => qb2.whereNull('ends_at').orWhere('ends_at', '>', now));
      }
    })
    .orderBy('sort_order');
};

const createBanner = async (attrs) => {
  const [row] = await db('banners')
    .insert({
      id: uuid(),
      title: attrs.title,
      image_url: attrs.imageUrl,
      placement: attrs.placement ?? 'home_hero',
      target_type: attrs.targetType ?? 'none',
      target_value: attrs.targetValue ?? null,
      sort_order: attrs.sortOrder ?? 0,
      starts_at: attrs.startsAt ?? null,
      ends_at: attrs.endsAt ?? null,
      is_active: attrs.isActive ?? true,
    })
    .returning('*');
  return row;
};

const updateBanner = async (id, attrs) => {
  const patch = {
    ...(attrs.title !== undefined ? { title: attrs.title } : {}),
    ...(attrs.imageUrl !== undefined ? { image_url: attrs.imageUrl } : {}),
    ...(attrs.placement !== undefined ? { placement: attrs.placement } : {}),
    ...(attrs.targetType !== undefined ? { target_type: attrs.targetType } : {}),
    ...(attrs.targetValue !== undefined ? { target_value: attrs.targetValue } : {}),
    ...(attrs.sortOrder !== undefined ? { sort_order: attrs.sortOrder } : {}),
    ...(attrs.startsAt !== undefined ? { starts_at: attrs.startsAt } : {}),
    ...(attrs.endsAt !== undefined ? { ends_at: attrs.endsAt } : {}),
    ...(attrs.isActive !== undefined ? { is_active: attrs.isActive } : {}),
  };
  const [row] = await db('banners').where({ id }).update(patch).returning('*');
  if (!row) throw ApiError.notFound('Banner');
  return row;
};

const deleteBanner = async (id) => {
  const deleted = await db('banners').where({ id }).del();
  if (!deleted) throw ApiError.notFound('Banner');
};

// ---------------------------------------------------------------- pages

const listPages = async ({ publishedOnly }) =>
  db('pages').modify((qb) => publishedOnly && qb.where({ is_published: true })).orderBy('title');

const getPageBySlug = async (slug) => {
  const page = await db('pages').where({ slug }).first();
  if (!page) throw ApiError.notFound('Page');
  return page;
};

const createPage = async (attrs) => {
  let slug = slugify(attrs.title);
  if (await db('pages').where({ slug }).first()) slug = uniqueSlug(attrs.title);
  const [row] = await db('pages')
    .insert({
      id: uuid(),
      slug: attrs.slug || slug,
      title: attrs.title,
      body: attrs.body,
      is_published: attrs.isPublished ?? false,
    })
    .returning('*');
  return row;
};

const updatePage = async (id, attrs) => {
  const patch = {
    ...(attrs.title !== undefined ? { title: attrs.title } : {}),
    ...(attrs.slug !== undefined ? { slug: attrs.slug } : {}),
    ...(attrs.body !== undefined ? { body: attrs.body } : {}),
    ...(attrs.isPublished !== undefined ? { is_published: attrs.isPublished } : {}),
  };
  const [row] = await db('pages').where({ id }).update(patch).returning('*');
  if (!row) throw ApiError.notFound('Page');
  return row;
};

const deletePage = async (id) => {
  const deleted = await db('pages').where({ id }).del();
  if (!deleted) throw ApiError.notFound('Page');
};

// ---------------------------------------------------------------- blogs

const listBlogs = async ({ page = 1, limit = 20, publishedOnly }) => {
  const base = db('blogs').modify((qb) => publishedOnly && qb.where({ is_published: true }));
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone().orderBy('created_at', 'desc').offset((page - 1) * limit).limit(limit);
  return { total: Number(count), rows };
};

const getBlogBySlug = async (slug) => {
  const blog = await db('blogs').where({ slug }).first();
  if (!blog) throw ApiError.notFound('Blog post');
  return blog;
};

const createBlog = async (authorId, attrs) => {
  let slug = slugify(attrs.title);
  if (await db('blogs').where({ slug }).first()) slug = uniqueSlug(attrs.title);
  const isPublished = attrs.isPublished ?? false;
  const [row] = await db('blogs')
    .insert({
      id: uuid(),
      slug: attrs.slug || slug,
      title: attrs.title,
      excerpt: attrs.excerpt ?? null,
      body: attrs.body,
      cover_image_url: attrs.coverImageUrl ?? null,
      author_id: authorId,
      is_published: isPublished,
      published_at: isPublished ? db.fn.now() : null,
    })
    .returning('*');
  return row;
};

const updateBlog = async (id, attrs) => {
  const existing = await db('blogs').where({ id }).first();
  if (!existing) throw ApiError.notFound('Blog post');

  const patch = {
    ...(attrs.title !== undefined ? { title: attrs.title } : {}),
    ...(attrs.slug !== undefined ? { slug: attrs.slug } : {}),
    ...(attrs.excerpt !== undefined ? { excerpt: attrs.excerpt } : {}),
    ...(attrs.body !== undefined ? { body: attrs.body } : {}),
    ...(attrs.coverImageUrl !== undefined ? { cover_image_url: attrs.coverImageUrl } : {}),
  };
  if (attrs.isPublished !== undefined) {
    patch.is_published = attrs.isPublished;
    if (attrs.isPublished && !existing.is_published) patch.published_at = db.fn.now();
  }
  const [row] = await db('blogs').where({ id }).update(patch).returning('*');
  return row;
};

const deleteBlog = async (id) => {
  const deleted = await db('blogs').where({ id }).del();
  if (!deleted) throw ApiError.notFound('Blog post');
};

// ---------------------------------------------------------------- faqs

const listFaqs = async ({ category, activeOnly }) =>
  db('faqs')
    .modify((qb) => {
      if (category) qb.where({ category });
      if (activeOnly) qb.where({ is_active: true });
    })
    .orderBy(['category', 'sort_order']);

const createFaq = async (attrs) => {
  const [row] = await db('faqs')
    .insert({
      id: uuid(),
      category: attrs.category ?? 'general',
      question: attrs.question,
      answer: attrs.answer,
      sort_order: attrs.sortOrder ?? 0,
      is_active: attrs.isActive ?? true,
    })
    .returning('*');
  return row;
};

const updateFaq = async (id, attrs) => {
  const patch = {
    ...(attrs.category !== undefined ? { category: attrs.category } : {}),
    ...(attrs.question !== undefined ? { question: attrs.question } : {}),
    ...(attrs.answer !== undefined ? { answer: attrs.answer } : {}),
    ...(attrs.sortOrder !== undefined ? { sort_order: attrs.sortOrder } : {}),
    ...(attrs.isActive !== undefined ? { is_active: attrs.isActive } : {}),
  };
  const [row] = await db('faqs').where({ id }).update(patch).returning('*');
  if (!row) throw ApiError.notFound('FAQ');
  return row;
};

const deleteFaq = async (id) => {
  const deleted = await db('faqs').where({ id }).del();
  if (!deleted) throw ApiError.notFound('FAQ');
};

module.exports = {
  listBanners, createBanner, updateBanner, deleteBanner,
  listPages, getPageBySlug, createPage, updatePage, deletePage,
  listBlogs, getBlogBySlug, createBlog, updateBlog, deleteBlog,
  listFaqs, createFaq, updateFaq, deleteFaq,
};
