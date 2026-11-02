const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const defaultDb = db;
const ApiError = require('../../utils/ApiError');
const couponService = require('../coupons/coupon.service');

const FREE_SHIPPING_THRESHOLD_KEY = 'checkout.free_shipping_threshold_minor';
const DEFAULT_SHIPPING_MINOR = 4900; // ₹49

const getOrCreateCart = async (userId, db = defaultDb) => {
  let cart = await db('carts').where({ user_id: userId }).first();
  if (!cart) {
    [cart] = await db('carts').insert({ id: uuid(), user_id: userId }).returning('*');
  }
  return cart;
};

/** Cart items joined with live product/variant/stock data. */
const loadItems = async (cartId, db = defaultDb) => {
  const rows = await db('cart_items as ci')
    .join('product_variants as v', 'v.id', 'ci.variant_id')
    .join('products as p', 'p.id', 'v.product_id')
    .leftJoin('vendors as ven', 'ven.id', 'p.vendor_id')
    .where('ci.cart_id', cartId)
    .whereNull('v.deleted_at')
    .whereNull('p.deleted_at')
    .select(
      'ci.id as item_id', 'ci.quantity', 'ci.is_saved_for_later',
      'v.id as variant_id', 'v.sku', 'v.sale_price_minor', 'v.mrp_minor', 'v.is_active as variant_active',
      'p.id as product_id', 'p.title', 'p.slug', 'p.status as product_status',
      'p.category_id', 'p.vendor_id', 'p.tax_rate_bp', 'p.is_cod_available',
      'ven.store_name as vendor_name',
    );

  const variantIds = rows.map((r) => r.variant_id);
  const [stocks, options, media] = await Promise.all([
    variantIds.length
      ? db('inventory_stocks').whereIn('variant_id', variantIds).groupBy('variant_id')
        .select('variant_id').sum({ quantity: 'quantity' }).sum({ reserved: 'reserved' })
      : [],
    variantIds.length ? db('variant_options').whereIn('variant_id', variantIds) : [],
    rows.length
      ? db('product_media').whereIn('product_id', rows.map((r) => r.product_id)).orderBy('sort_order')
      : [],
  ]);

  const stockMap = new Map(stocks.map((s) => [s.variant_id, Number(s.quantity) - Number(s.reserved)]));
  const optMap = new Map();
  for (const o of options) {
    optMap.set(o.variant_id, [...(optMap.get(o.variant_id) || []), { name: o.option_name, value: o.option_value }]);
  }
  const imgMap = new Map();
  for (const m of media) if (!imgMap.has(m.product_id)) imgMap.set(m.product_id, m.thumbnail_url || m.url);

  return rows.map((r) => {
    const available = stockMap.get(r.variant_id) ?? 0;
    const purchasable = r.product_status === 'active' && r.variant_active && available > 0;
    return {
      itemId: r.item_id,
      productId: r.product_id,
      variantId: r.variant_id,
      title: r.title,
      slug: r.slug,
      sku: r.sku,
      image: imgMap.get(r.product_id) || null,
      options: optMap.get(r.variant_id) || [],
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      categoryId: r.category_id,
      unitPriceMinor: Number(r.sale_price_minor),
      mrpMinor: Number(r.mrp_minor),
      taxRateBp: r.tax_rate_bp,
      quantity: r.quantity,
      isSavedForLater: r.is_saved_for_later,
      isCodAvailable: r.is_cod_available,
      availableStock: available,
      purchasable,
      lineTotalMinor: Number(r.sale_price_minor) * r.quantity,
    };
  });
};

/**
 * Builds a single cart-item-shaped object for "Buy Now" checkout — same
 * shape as a `loadItems()` row, but never reads or writes `cart_items`, so
 * it can be checked out without touching (or being contaminated by)
 * whatever else is sitting in the user's persisted cart.
 */
const loadSingleItem = async (variantId, quantity, db = defaultDb) => {
  const row = await db('product_variants as v')
    .join('products as p', 'p.id', 'v.product_id')
    .leftJoin('vendors as ven', 'ven.id', 'p.vendor_id')
    .where('v.id', variantId)
    .whereNull('v.deleted_at')
    .whereNull('p.deleted_at')
    .select(
      'v.id as variant_id', 'v.sku', 'v.sale_price_minor', 'v.mrp_minor', 'v.is_active as variant_active',
      'p.id as product_id', 'p.title', 'p.slug', 'p.status as product_status',
      'p.category_id', 'p.vendor_id', 'p.tax_rate_bp', 'p.is_cod_available',
      'ven.store_name as vendor_name',
    )
    .first();
  if (!row) throw ApiError.businessRule('This product is not available');

  const [stock, options, media] = await Promise.all([
    db('inventory_stocks').where({ variant_id: variantId })
      .sum({ quantity: 'quantity' }).sum({ reserved: 'reserved' }).first(),
    db('variant_options').where({ variant_id: variantId }),
    db('product_media').where({ product_id: row.product_id }).orderBy('sort_order'),
  ]);

  const available = Number(stock?.quantity || 0) - Number(stock?.reserved || 0);
  const purchasable = row.product_status === 'active' && row.variant_active && available > 0;

  return {
    itemId: 'buy-now', // synthetic — never mutated, no cart_items row to reference
    productId: row.product_id,
    variantId: row.variant_id,
    title: row.title,
    slug: row.slug,
    sku: row.sku,
    image: media[0]?.thumbnail_url || media[0]?.url || null,
    options: options.map((o) => ({ name: o.option_name, value: o.option_value })),
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    categoryId: row.category_id,
    unitPriceMinor: Number(row.sale_price_minor),
    mrpMinor: Number(row.mrp_minor),
    taxRateBp: row.tax_rate_bp,
    quantity,
    isSavedForLater: false,
    isCodAvailable: row.is_cod_available,
    availableStock: available,
    purchasable,
    lineTotalMinor: Number(row.sale_price_minor) * quantity,
  };
};

/** Totals over active (non-saved, purchasable) items, with optional coupon. */
const computeTotals = async (cart, items, userId, db = defaultDb) => {
  const active = items.filter((i) => !i.isSavedForLater && i.purchasable);
  const subtotal = active.reduce((sum, i) => sum + i.lineTotalMinor, 0);

  let discount = 0;
  let coupon = null;
  let couponError = null;
  if (cart.coupon_id) {
    const row = await db('coupons').where({ id: cart.coupon_id }).first();
    if (row) {
      try {
        const validCoupon = await couponService.findActiveByCode(row.code, db);
        const result = await couponService.computeDiscount(
          validCoupon,
          active.map((i) => ({
            productId: i.productId, categoryId: i.categoryId, vendorId: i.vendorId,
            unitPriceMinor: i.unitPriceMinor, quantity: i.quantity,
          })),
          userId, db,
        );
        discount = result.discountMinor;
        coupon = { code: row.code, title: row.title };
      } catch (err) {
        couponError = err.message; // stale coupon stays visible with the reason
      }
    }
  }

  const setting = await db('settings').where({ key: FREE_SHIPPING_THRESHOLD_KEY }).first();
  const freeAbove = setting ? Number(setting.value) : 49900;
  const shipping = subtotal === 0 || subtotal - discount >= freeAbove ? 0 : DEFAULT_SHIPPING_MINOR;

  // Prices are tax-inclusive (Indian retail convention); tax shown as informational split.
  const taxIncluded = active.reduce(
    (sum, i) => sum + Math.round((i.lineTotalMinor * i.taxRateBp) / (10000 + i.taxRateBp)),
    0,
  );

  return {
    itemCount: active.reduce((sum, i) => sum + i.quantity, 0),
    subtotalMinor: subtotal,
    discountMinor: discount,
    shippingMinor: shipping,
    taxIncludedMinor: taxIncluded,
    totalMinor: subtotal - discount + shipping,
    coupon,
    couponError,
    freeShippingThresholdMinor: freeAbove,
  };
};

/**
 * "Buy Now" preview — same response shape as `getCart()`, but for one
 * ad-hoc variant/quantity instead of the persisted cart. Read-only: never
 * touches `cart_items`, so the checkout screen can show accurate totals
 * (tax, shipping threshold) for a single-item purchase without disturbing
 * whatever else is already in the user's cart.
 */
const previewSingleItem = async (variantId, quantity) => {
  const item = await loadSingleItem(variantId, quantity);
  const totals = await computeTotals({ coupon_id: null }, [item], null);
  return { id: 'buy-now', items: [item], savedForLater: [], totals };
};

const getCart = async (userId) => {
  const cart = await getOrCreateCart(userId);
  const items = await loadItems(cart.id);
  const totals = await computeTotals(cart, items, userId);
  return {
    id: cart.id,
    items: items.filter((i) => !i.isSavedForLater),
    savedForLater: items.filter((i) => i.isSavedForLater),
    totals,
  };
};

const addItem = async (userId, { variantId, quantity }) => {
  const variant = await db('product_variants as v')
    .join('products as p', 'p.id', 'v.product_id')
    .where('v.id', variantId)
    .whereNull('v.deleted_at')
    .where('v.is_active', true)
    .where('p.status', 'active')
    .whereNull('p.deleted_at')
    .select('v.id')
    .first();
  if (!variant) throw ApiError.businessRule('This product is not available');

  const stock = await db('inventory_stocks')
    .where({ variant_id: variantId })
    .sum({ available: db.raw('quantity - reserved') })
    .first();
  if (Number(stock?.available || 0) < quantity) throw ApiError.businessRule('Not enough stock available');

  const cart = await getOrCreateCart(userId);
  await db('cart_items')
    .insert({ id: uuid(), cart_id: cart.id, variant_id: variantId, quantity })
    .onConflict(['cart_id', 'variant_id'])
    .merge({ quantity, is_saved_for_later: false, updated_at: db.fn.now() });

  return getCart(userId);
};

const updateItem = async (userId, itemId, { quantity, saveForLater }) => {
  const cart = await getOrCreateCart(userId);
  const item = await db('cart_items').where({ id: itemId, cart_id: cart.id }).first();
  if (!item) throw ApiError.notFound('Cart item');

  await db('cart_items').where({ id: itemId }).update({
    ...(quantity !== undefined ? { quantity } : {}),
    ...(saveForLater !== undefined ? { is_saved_for_later: saveForLater } : {}),
  });
  return getCart(userId);
};

const removeItem = async (userId, itemId) => {
  const cart = await getOrCreateCart(userId);
  const deleted = await db('cart_items').where({ id: itemId, cart_id: cart.id }).del();
  if (!deleted) throw ApiError.notFound('Cart item');
  return getCart(userId);
};

const applyCoupon = async (userId, code) => {
  const cart = await getOrCreateCart(userId);
  const coupon = await couponService.findActiveByCode(code);
  const items = await loadItems(cart.id);
  const active = items.filter((i) => !i.isSavedForLater && i.purchasable);
  if (!active.length) throw ApiError.businessRule('Your cart is empty');

  // Validates limits/scope/min-order; throws with a specific reason if not applicable.
  await couponService.computeDiscount(
    coupon,
    active.map((i) => ({
      productId: i.productId, categoryId: i.categoryId, vendorId: i.vendorId,
      unitPriceMinor: i.unitPriceMinor, quantity: i.quantity,
    })),
    userId,
  );

  await db('carts').where({ id: cart.id }).update({ coupon_id: coupon.id });
  return getCart(userId);
};

const removeCoupon = async (userId) => {
  const cart = await getOrCreateCart(userId);
  await db('carts').where({ id: cart.id }).update({ coupon_id: null });
  return getCart(userId);
};

const clear = async (userId, trx = db) => {
  const cart = await trx('carts').where({ user_id: userId }).first();
  if (cart) {
    await trx('cart_items').where({ cart_id: cart.id, is_saved_for_later: false }).del();
    await trx('carts').where({ id: cart.id }).update({ coupon_id: null });
  }
};

module.exports = {
  getCart, addItem, updateItem, removeItem, applyCoupon, removeCoupon, clear,
  getOrCreateCart, loadItems, loadSingleItem, previewSingleItem, computeTotals,
};
