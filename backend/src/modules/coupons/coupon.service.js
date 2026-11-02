const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');

/**
 * Coupon engine. computeDiscount() is the single source of truth used by
 * cart preview and checkout. Redemption rows are written at order creation.
 */

const findActiveByCode = async (code, trx = db) => {
  const now = new Date();
  const coupon = await trx('coupons').whereRaw('UPPER(code) = ?', [code.toUpperCase()]).first();
  if (!coupon || !coupon.is_active) throw ApiError.businessRule('Invalid coupon code');
  if (new Date(coupon.starts_at) > now) throw ApiError.businessRule('Coupon is not active yet');
  if (new Date(coupon.ends_at) < now) throw ApiError.businessRule('Coupon has expired');
  return coupon;
};

/**
 * @param coupon coupons row
 * @param items [{ productId, categoryId, vendorId, unitPriceMinor, quantity }]
 * @param userId
 * @returns { discountMinor, eligibleSubtotalMinor }
 */
const computeDiscount = async (coupon, items, userId, trx = db) => {
  // usage limits
  if (coupon.usage_limit_total) {
    const [{ count }] = await trx('coupon_redemptions').where({ coupon_id: coupon.id }).count('* as count');
    if (Number(count) >= coupon.usage_limit_total) throw ApiError.businessRule('Coupon usage limit reached');
  }
  const [{ count: userCount }] = await trx('coupon_redemptions')
    .where({ coupon_id: coupon.id, user_id: userId })
    .count('* as count');
  if (Number(userCount) >= coupon.usage_limit_per_user) {
    throw ApiError.businessRule('You have already used this coupon');
  }

  if (coupon.applicable_scope === 'first_order') {
    const order = await trx('orders').where({ user_id: userId }).whereNot('status', 'payment_failed').first();
    if (order) throw ApiError.businessRule('Coupon is valid on first order only');
  }

  // eligible line items
  const scopeIds = coupon.scope_ids || [];
  const eligible = items.filter((it) => {
    switch (coupon.applicable_scope) {
      case 'category': return scopeIds.includes(it.categoryId);
      case 'product': return scopeIds.includes(it.productId);
      case 'vendor': return scopeIds.includes(it.vendorId);
      default: return true; // all / first_order
    }
  });
  if (!eligible.length) throw ApiError.businessRule('Coupon is not applicable to items in your cart');

  const eligibleSubtotal = eligible.reduce((sum, it) => sum + it.unitPriceMinor * it.quantity, 0);
  if (eligibleSubtotal < Number(coupon.min_order_minor)) {
    throw ApiError.businessRule(`Minimum order value for this coupon is ${Number(coupon.min_order_minor) / 100}`);
  }

  let discount;
  if (coupon.discount_type === 'percent') {
    discount = Math.floor((eligibleSubtotal * coupon.discount_value) / 10000); // value in basis points
    if (coupon.max_discount_minor) discount = Math.min(discount, Number(coupon.max_discount_minor));
  } else {
    discount = Math.min(Number(coupon.discount_value), eligibleSubtotal);
  }

  return { discountMinor: discount, eligibleSubtotalMinor: eligibleSubtotal };
};

const recordRedemption = (trx, { couponId, userId, orderId, discountMinor }) =>
  trx('coupon_redemptions').insert({
    id: uuid(), coupon_id: couponId, user_id: userId, order_id: orderId, discount_minor: discountMinor,
  });

// ---------------- public ----------------

// NOTE: `_userId` is accepted but not yet applied. The caller passes the
// authenticated user, but this listing returns every active platform coupon
// without filtering out ones the user has already exhausted
// (`usage_limit_per_user` / `coupon_redemptions`), so a user can be shown a
// coupon that then fails at apply-time. Left as-is deliberately — fixing it
// is a behaviour change, not a lint fix.
const listAvailable = async (_userId) => {
  const now = new Date();
  const coupons = await db('coupons')
    .where({ is_active: true })
    .where('starts_at', '<=', now)
    .where('ends_at', '>', now)
    .whereNull('vendor_id')
    .orderBy('ends_at')
    .limit(50);
  return coupons.map((c) => ({
    code: c.code,
    title: c.title,
    description: c.description,
    discountType: c.discount_type,
    discountValue: c.discount_value,
    maxDiscountMinor: c.max_discount_minor ? Number(c.max_discount_minor) : null,
    minOrderMinor: Number(c.min_order_minor),
    endsAt: c.ends_at,
  }));
};

// ---------------- admin ----------------

const create = async (creatorId, attrs) => {
  const [row] = await db('coupons')
    .insert({
      id: uuid(),
      code: attrs.code.toUpperCase(),
      title: attrs.title,
      description: attrs.description || null,
      discount_type: attrs.discountType,
      discount_value: attrs.discountValue,
      max_discount_minor: attrs.maxDiscountMinor ?? null,
      min_order_minor: attrs.minOrderMinor ?? 0,
      usage_limit_total: attrs.usageLimitTotal ?? null,
      usage_limit_per_user: attrs.usageLimitPerUser ?? 1,
      applicable_scope: attrs.applicableScope ?? 'all',
      scope_ids: attrs.scopeIds ?? null,
      vendor_id: attrs.vendorId ?? null,
      created_by: creatorId,
      starts_at: attrs.startsAt,
      ends_at: attrs.endsAt,
      is_active: attrs.isActive ?? true,
    })
    .returning('*');
  return row;
};

const update = async (id, attrs) => {
  const patch = {
    ...(attrs.title !== undefined ? { title: attrs.title } : {}),
    ...(attrs.discountType !== undefined ? { discount_type: attrs.discountType } : {}),
    ...(attrs.discountValue !== undefined ? { discount_value: attrs.discountValue } : {}),
    ...(attrs.applicableScope !== undefined ? { applicable_scope: attrs.applicableScope } : {}),
    ...(attrs.scopeIds !== undefined ? { scope_ids: attrs.scopeIds } : {}),
    ...(attrs.description !== undefined ? { description: attrs.description } : {}),
    ...(attrs.maxDiscountMinor !== undefined ? { max_discount_minor: attrs.maxDiscountMinor } : {}),
    ...(attrs.minOrderMinor !== undefined ? { min_order_minor: attrs.minOrderMinor } : {}),
    ...(attrs.usageLimitTotal !== undefined ? { usage_limit_total: attrs.usageLimitTotal } : {}),
    ...(attrs.usageLimitPerUser !== undefined ? { usage_limit_per_user: attrs.usageLimitPerUser } : {}),
    ...(attrs.startsAt !== undefined ? { starts_at: attrs.startsAt } : {}),
    ...(attrs.endsAt !== undefined ? { ends_at: attrs.endsAt } : {}),
    ...(attrs.isActive !== undefined ? { is_active: attrs.isActive } : {}),
  };
  const [row] = await db('coupons').where({ id }).update(patch).returning('*');
  if (!row) throw ApiError.notFound('Coupon');
  return row;
};

/** Lifecycle derived from the active flag and the validity window. */
const couponState = (coupon, now = new Date()) => {
  if (!coupon.is_active) return 'disabled';
  if (new Date(coupon.starts_at) > now) return 'scheduled';
  if (new Date(coupon.ends_at) <= now) return 'expired';
  return 'active';
};

const listAdmin = async ({ page = 1, limit = 20, q, active, state }) => {
  const base = db('coupons').modify((qb) => {
    if (q) qb.where((qb2) => qb2.whereILike('code', `%${q}%`).orWhereILike('title', `%${q}%`));
    if (active !== undefined) qb.where('is_active', active);
    if (state === 'disabled') qb.where('is_active', false);
    if (state === 'scheduled') qb.where('is_active', true).where('starts_at', '>', db.fn.now());
    if (state === 'expired') qb.where('is_active', true).where('ends_at', '<=', db.fn.now());
    if (state === 'active') qb.where('is_active', true).where('starts_at', '<=', db.fn.now()).where('ends_at', '>', db.fn.now());
  });
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone().orderBy('created_at', 'desc').offset((page - 1) * limit).limit(limit)
    .select('coupons.*',
      db.raw('(SELECT COUNT(*)::int FROM coupon_redemptions r WHERE r.coupon_id = coupons.id) as redemptions'),
      db.raw('(SELECT COALESCE(SUM(discount_minor), 0)::bigint FROM coupon_redemptions r WHERE r.coupon_id = coupons.id) as discount_given_minor'));
  return {
    total: Number(count),
    rows: rows.map((r) => ({
      ...r,
      min_order_minor: Number(r.min_order_minor),
      max_discount_minor: r.max_discount_minor == null ? null : Number(r.max_discount_minor),
      discount_given_minor: Number(r.discount_given_minor),
      state: couponState(r),
    })),
  };
};

module.exports = {
  findActiveByCode, computeDiscount, recordRedemption, listAvailable, create, update, listAdmin, couponState,
};
