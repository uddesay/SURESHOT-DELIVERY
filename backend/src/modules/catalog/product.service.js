const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const catalogCache = require('./catalog.cache');
const ApiError = require('../../utils/ApiError');
const { uniqueSlug } = require('../../utils/slugify');
const repo = require('./product.repository');
const categoryService = require('./category.service');
const searchService = require('../search/search.service');
const notificationService = require('../notifications/notification.service');

const notifyVendorOwner = async (vendorId, payload) => {
  const vendor = await db('vendors').where({ id: vendorId }).first();
  if (vendor) notificationService.notify(vendor.owner_user_id, payload);
};

// ---------------------------------------------------------------- public

const listPublic = async (params) => {
  let categoryIds;
  if (params.category) {
    const category = await db('categories').where({ slug: params.category }).whereNull('deleted_at').first();
    if (!category) throw ApiError.notFound('Category');
    categoryIds = await categoryService.getDescendantIds(category.id);
  }
  let brandId;
  if (params.brand) {
    const brand = await db('brands').where({ slug: params.brand }).whereNull('deleted_at').first();
    if (!brand) throw ApiError.notFound('Brand');
    brandId = brand.id;
  }
  return repo.listPublic({ ...params, categoryIds, brandId });
};

const getBySlug = async (slug) => {
  const product = await repo.getDetail({ 'p.slug': slug, 'p.status': 'active' });
  if (!product) throw ApiError.notFound('Product');
  return product;
};

const getRelated = async (slug, limit = 10) => {
  const product = await db('products').where({ slug }).whereNull('deleted_at').first();
  if (!product) throw ApiError.notFound('Product');
  const { rows } = await repo.listPublic({
    categoryIds: [product.category_id], page: 1, limit: limit + 1, sort: 'popularity',
  });
  return rows.filter((r) => r.id !== product.id).slice(0, limit);
};

// ---------------------------------------------------------------- vendor

const insertChildren = async (trx, productId, { variants, media, specifications, faqs }) => {
  const variantRows = variants.map((v, i) => ({
    id: uuid(),
    product_id: productId,
    sku: v.sku,
    barcode: v.barcode || null,
    mrp_minor: v.mrpMinor,
    sale_price_minor: v.salePriceMinor,
    weight_grams: v.weightGrams || null,
    length_mm: v.lengthMm || null,
    width_mm: v.widthMm || null,
    height_mm: v.heightMm || null,
    is_default: i === 0,
  }));
  // Updates reuse this for media/specs/FAQs with no variants; knex rejects empty inserts.
  if (variantRows.length) await trx('product_variants').insert(variantRows);

  const optionRows = [];
  variants.forEach((v, i) => {
    for (const [name, value] of Object.entries(v.options || {})) {
      optionRows.push({ id: uuid(), variant_id: variantRows[i].id, option_name: name, option_value: value });
    }
  });
  if (optionRows.length) await trx('variant_options').insert(optionRows);

  if (media?.length) {
    await trx('product_media').insert(media.map((m, i) => ({
      id: uuid(),
      product_id: productId,
      media_type: m.type || 'image',
      url: m.url,
      thumbnail_url: m.thumbnailUrl || null,
      alt_text: m.altText || null,
      sort_order: i,
    })));
  }

  if (specifications?.length) {
    await trx('product_specifications').insert(specifications.map((s, i) => ({
      id: uuid(),
      product_id: productId,
      group_name: s.group || 'General',
      spec_key: s.key,
      spec_value: s.value,
      sort_order: i,
    })));
  }

  if (faqs?.length) {
    await trx('product_faqs').insert(faqs.map((f, i) => ({
      id: uuid(), product_id: productId, question: f.question, answer: f.answer, sort_order: i,
    })));
  }

  return variantRows;
};

const variantColumns = (v, isDefault) => ({
  sku: v.sku,
  barcode: v.barcode || null,
  mrp_minor: v.mrpMinor,
  sale_price_minor: v.salePriceMinor,
  weight_grams: v.weightGrams || null,
  length_mm: v.lengthMm || null,
  width_mm: v.widthMm || null,
  height_mm: v.heightMm || null,
  is_default: isDefault,
  is_active: true,
  deleted_at: null,
});

/**
 * Reconciles variants by SKU instead of replacing them: matching SKUs are
 * updated in place (keeping their id, and so their stock, cart lines and order
 * history), new SKUs are inserted, and SKUs no longer listed are soft-deleted.
 * A previously removed SKU that comes back is restored.
 */
const syncVariants = async (trx, productId, variants) => {
  const existing = await trx('product_variants').where({ product_id: productId });
  const bySku = new Map(existing.map((v) => [v.sku, v]));
  const keep = new Set();

  for (const [i, v] of variants.entries()) {
    const match = bySku.get(v.sku);
    let variantId;
    if (match) {
      variantId = match.id;
      await trx('product_variants').where({ id: variantId }).update({ ...variantColumns(v, i === 0), updated_at: trx.fn.now() });
      await trx('variant_options').where({ variant_id: variantId }).del();
    } else {
      variantId = uuid();
      await trx('product_variants').insert({ id: variantId, product_id: productId, ...variantColumns(v, i === 0) });
    }
    keep.add(variantId);
    const options = Object.entries(v.options || {});
    if (options.length) {
      await trx('variant_options').insert(options.map(([name, value]) => ({
        id: uuid(), variant_id: variantId, option_name: name, option_value: value,
      })));
    }
  }

  const removed = existing.filter((v) => !keep.has(v.id) && !v.deleted_at).map((v) => v.id);
  if (removed.length) {
    await trx('product_variants').whereIn('id', removed)
      .update({ deleted_at: trx.fn.now(), is_active: false, is_default: false });
  }
};

const create = async (vendor, attrs) => {
  const category = await db('categories').where({ id: attrs.categoryId }).whereNull('deleted_at').first();
  if (!category) throw ApiError.businessRule('Category does not exist');

  const skus = attrs.variants.map((v) => v.sku);
  if (new Set(skus).size !== skus.length) throw ApiError.businessRule('Duplicate SKUs in variants');
  const existingSku = await db('product_variants').whereIn('sku', skus).first();
  if (existingSku) throw ApiError.conflict(`SKU '${existingSku.sku}' already exists`);

  const productId = uuid();
  await db.transaction(async (trx) => {
    await trx('products').insert({
      id: productId,
      vendor_id: vendor.id,
      category_id: attrs.categoryId,
      brand_id: attrs.brandId || null,
      title: attrs.title,
      slug: uniqueSlug(attrs.title),
      description: attrs.description || '',
      highlights: JSON.stringify(attrs.highlights || []),
      status: attrs.submit ? 'pending_approval' : 'draft',
      hsn_code: attrs.hsnCode || null,
      tax_rate_bp: attrs.taxRateBp ?? 1800,
      is_returnable: attrs.isReturnable ?? true,
      return_window_days: attrs.returnWindowDays ?? 7,
      is_cod_available: attrs.isCodAvailable ?? true,
      seo_title: attrs.seoTitle || null,
      seo_description: attrs.seoDescription || null,
    });
    const variantRows = await insertChildren(trx, productId, attrs);

    // Initial stock into the vendor's (or platform) warehouse when provided
    if (attrs.warehouseId) {
      const stockRows = attrs.variants
        .map((v, i) => ({ variant: variantRows[i], qty: v.initialStock || 0 }))
        .filter((s) => s.qty > 0);
      if (stockRows.length) {
        await trx('inventory_stocks').insert(stockRows.map((s) => ({
          variant_id: s.variant.id, warehouse_id: attrs.warehouseId, quantity: s.qty,
        })));
        await trx('inventory_movements').insert(stockRows.map((s) => ({
          id: uuid(),
          variant_id: s.variant.id,
          warehouse_id: attrs.warehouseId,
          movement_type: 'purchase',
          quantity_delta: s.qty,
          reference_type: 'product_create',
          reference_id: productId,
          actor_id: vendor.owner_user_id,
        })));
      }
    }
  });

  return repo.getDetail({ 'p.id': productId });
};

const getOwned = async (vendorId, productId) => {
  const product = await db('products').where({ id: productId, vendor_id: vendorId }).whereNull('deleted_at').first();
  if (!product) throw ApiError.notFound('Product');
  return product;
};

/**
 * Update replaces child collections when provided (variants/media/specs/faqs
 * are managed as a document from the vendor's perspective). Any content edit
 * on an active product sends it back through approval.
 */
const update = async (vendor, productId, attrs) => {
  const product = await getOwned(vendor.id, productId);

  if (attrs.variants) {
    const skus = attrs.variants.map((v) => v.sku);
    if (new Set(skus).size !== skus.length) throw ApiError.businessRule('Duplicate SKUs in variants');
    const clash = await db('product_variants')
      .whereIn('sku', skus)
      .whereNot({ product_id: productId })
      .first();
    if (clash) throw ApiError.conflict(`SKU '${clash.sku}' already exists`);
  }

  await db.transaction(async (trx) => {
    const patch = {
      ...(attrs.title !== undefined ? { title: attrs.title } : {}),
      ...(attrs.categoryId !== undefined ? { category_id: attrs.categoryId } : {}),
      ...(attrs.brandId !== undefined ? { brand_id: attrs.brandId } : {}),
      ...(attrs.description !== undefined ? { description: attrs.description } : {}),
      ...(attrs.highlights !== undefined ? { highlights: JSON.stringify(attrs.highlights) } : {}),
      ...(attrs.hsnCode !== undefined ? { hsn_code: attrs.hsnCode } : {}),
      ...(attrs.taxRateBp !== undefined ? { tax_rate_bp: attrs.taxRateBp } : {}),
      ...(attrs.isReturnable !== undefined ? { is_returnable: attrs.isReturnable } : {}),
      ...(attrs.returnWindowDays !== undefined ? { return_window_days: attrs.returnWindowDays } : {}),
      ...(attrs.isCodAvailable !== undefined ? { is_cod_available: attrs.isCodAvailable } : {}),
      ...(attrs.seoTitle !== undefined ? { seo_title: attrs.seoTitle } : {}),
      ...(attrs.seoDescription !== undefined ? { seo_description: attrs.seoDescription } : {}),
    };
    if (product.status === 'active' && (Object.keys(patch).length || attrs.variants)) {
      patch.status = 'pending_approval';
    }
    if (attrs.submit && ['draft', 'rejected'].includes(product.status)) {
      patch.status = 'pending_approval';
      patch.rejection_reason = null;
    }
    if (Object.keys(patch).length) await trx('products').where({ id: productId }).update(patch);

    if (attrs.variants) await syncVariants(trx, productId, attrs.variants);
    if (attrs.media) {
      await trx('product_media').where({ product_id: productId }).del();
      await insertChildren(trx, productId, { variants: [], media: attrs.media });
    }
    if (attrs.specifications) {
      await trx('product_specifications').where({ product_id: productId }).del();
      await insertChildren(trx, productId, { variants: [], specifications: attrs.specifications });
    }
    if (attrs.faqs) {
      await trx('product_faqs').where({ product_id: productId }).del();
      await insertChildren(trx, productId, { variants: [], faqs: attrs.faqs });
    }
  });

  const updated = await repo.getDetail({ 'p.id': productId });
  if (updated.status === 'active') searchService.indexProduct(productId);
  else searchService.removeProduct(productId);
  return updated;
};

const remove = async (vendor, productId) => {
  await getOwned(vendor.id, productId);
  await db('products').where({ id: productId }).update({ deleted_at: db.fn.now(), status: 'archived' });
  searchService.removeProduct(productId);
};

// ---------------------------------------------------------------- admin

const approve = async (adminId, productId) => {
  const product = await db('products').where({ id: productId }).whereNull('deleted_at').first();
  if (!product) throw ApiError.notFound('Product');
  if (product.status !== 'pending_approval') {
    throw ApiError.businessRule(`Only products pending approval can be approved (current: ${product.status})`);
  }
  await db('products').where({ id: productId }).update({
    status: 'active',
    published_at: product.published_at || db.fn.now(),
    rejection_reason: null,
  });
  searchService.indexProduct(productId);
  notifyVendorOwner(product.vendor_id, {
    title: 'Product approved',
    body: `"${product.title}" is now live on Sureshot.`,
    type: 'product_approved',
    data: { productId },
  });
  return repo.getDetail({ 'p.id': productId });
};

const reject = async (adminId, productId, reason) => {
  const product = await db('products').where({ id: productId }).whereNull('deleted_at').first();
  if (!product) throw ApiError.notFound('Product');
  if (product.status !== 'pending_approval') {
    throw ApiError.businessRule('Only products pending approval can be rejected');
  }
  await db('products').where({ id: productId }).update({ status: 'rejected', rejection_reason: reason });
  notifyVendorOwner(product.vendor_id, {
    title: 'Product rejected',
    body: `"${product.title}" was rejected: ${reason}`,
    type: 'product_rejected',
    data: { productId },
  });
  searchService.removeProduct(productId);
};


// ------------------------------------------------- admin catalogue management

const ADMIN_STATUSES = ['draft', 'pending_approval', 'active', 'inactive'];

const loadVendor = async (vendorId) => {
  const vendor = await db('vendors').where({ id: vendorId }).whereNull('deleted_at').first();
  if (!vendor) throw ApiError.businessRule('Vendor does not exist');
  return vendor;
};

const applyAdminStatus = async (productId, status) => {
  if (!status) return;
  if (!ADMIN_STATUSES.includes(status)) throw ApiError.badRequest(`Unsupported status: ${status}`);
  const product = await db('products').where({ id: productId }).first();
  await db('products').where({ id: productId }).update({
    status,
    rejection_reason: null,
    ...(status === 'active' && !product.published_at ? { published_at: db.fn.now() } : {}),
  });
};

const syncSearch = (product) => {
  if (product?.status === 'active') searchService.indexProduct(product.id);
  else if (product) searchService.removeProduct(product.id);
};

/**
 * Staff create a listing on behalf of a vendor. Staff are the approvers, so a
 * product may be published directly. Initial stock goes to the vendor's first
 * active warehouse unless one is given.
 */
const adminCreate = async (attrs) => {
  const vendor = await loadVendor(attrs.vendorId);
  let { warehouseId } = attrs;
  if (!warehouseId && attrs.variants.some((v) => v.initialStock > 0)) {
    const warehouse = await db('warehouses').where({ vendor_id: vendor.id, is_active: true }).orderBy('created_at').first();
    if (!warehouse) throw ApiError.businessRule('The vendor has no active warehouse to receive initial stock');
    warehouseId = warehouse.id;
  }
  const created = await create(vendor, { ...attrs, warehouseId, submit: false });
  await applyAdminStatus(created.id, attrs.status || 'draft');
  const product = await repo.getDetail({ 'p.id': created.id });
  syncSearch(product);
  return product;
};

/** Staff edits keep the product's status unless a new one is requested (no re-approval loop). */
const adminUpdate = async (productId, attrs) => {
  const product = await db('products').where({ id: productId }).whereNull('deleted_at').first();
  if (!product) throw ApiError.notFound('Product');
  const { status, vendorId: _ignored, ...content } = attrs;
  if (Object.keys(content).length) await update({ id: product.vendor_id }, productId, { ...content, submit: false });
  await applyAdminStatus(productId, status || (product.status === 'active' ? 'active' : null));
  const updated = await repo.getDetail({ 'p.id': productId });
  syncSearch(updated);
  return updated;
};

const BULK_ACTIONS = {
  publish: { status: 'active' },
  unpublish: { status: 'inactive' },
  draft: { status: 'draft' },
};

/** Applies one action to many products; returns per-id outcome so the UI can report partial success. */
const adminBulk = async ({ ids, action, categoryId }) => {
  const products = await db('products').whereIn('id', ids).whereNull('deleted_at');
  const found = new Set(products.map((p) => p.id));
  const results = ids.filter((id) => !found.has(id)).map((id) => ({ id, ok: false, message: 'Not found' }));

  if (action === 'category') {
    const category = await db('categories').where({ id: categoryId }).whereNull('deleted_at').first();
    if (!category) throw ApiError.businessRule('Category does not exist');
    await db('products').whereIn('id', [...found]).update({ category_id: categoryId });
  } else if (action === 'archive') {
    await db('products').whereIn('id', [...found]).update({ deleted_at: db.fn.now(), status: 'archived' });
  } else if (BULK_ACTIONS[action]) {
    if (action === 'publish') {
      const withVariants = await db('product_variants').whereIn('product_id', [...found]).whereNull('deleted_at').distinct('product_id');
      const publishable = new Set(withVariants.map((v) => v.product_id));
      for (const id of [...found]) {
        if (!publishable.has(id)) {
          found.delete(id);
          results.push({ id, ok: false, message: 'Add at least one variant before publishing' });
        }
      }
      await db('products').whereIn('id', [...found]).whereNull('published_at').update({ published_at: db.fn.now() });
    }
    await db('products').whereIn('id', [...found]).update({ ...BULK_ACTIONS[action], rejection_reason: null });
  } else {
    throw ApiError.badRequest(`Unsupported bulk action: ${action}`);
  }

  const live = new Set(products.filter((p) => p.status === 'active').map((p) => p.id));
  for (const id of found) {
    if (action === 'publish' || (action === 'category' && live.has(id))) searchService.indexProduct(id);
    else if (action !== 'category') searchService.removeProduct(id);
    results.push({ id, ok: true });
  }
  return { updated: found.size, failed: results.filter((r) => !r.ok).length, results };
};

const adminGet = async (productId) => {
  const product = await repo.getDetail({ 'p.id': productId });
  if (!product) throw ApiError.notFound('Product');
  return product;
};

// Anything that changes what the public catalogue shows (publish, edit, remove, bulk edit)
// busts the shared catalogue cache, so storefront visitors see it immediately.
const withBust = (fn) => async (...args) => { const result = await fn(...args); catalogCache.bustCatalog(); return result; };

module.exports = {
  syncVariants,
  adminCreate: withBust(adminCreate),
  adminUpdate: withBust(adminUpdate),
  adminBulk: withBust(adminBulk),
  adminGet,
  listPublic,
  getBySlug,
  getRelated,
  create: withBust(create),
  update: withBust(update),
  remove: withBust(remove),
  getOwned,
  approve: withBust(approve),
  reject: withBust(reject),
  listByVendor: repo.listByVendor,
  listForAdmin: repo.listForAdmin,
  getDetail: repo.getDetail,
};
