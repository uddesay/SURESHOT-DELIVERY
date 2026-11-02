const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');

const ROLE_GROUPS = {
  customer: ['customer'],
  vendor: ['vendor'],
  staff: ['super_admin', 'admin', 'support_agent'],
};

const USER_SORTS = {
  newest: ['created_at', 'desc'],
  oldest: ['created_at', 'asc'],
  spent: ['total_spent_minor', 'desc'],
  orders: ['order_count', 'desc'],
  last_order: ['last_order_at', 'desc'],
};

const list = async ({ page = 1, limit = 20, status, q, role, sort = 'newest' }) => {
  const base = db('users')
    .whereNull('deleted_at')
    .modify((qb) => {
      if (status) qb.where('status', status);
      if (role && ROLE_GROUPS[role]) {
        qb.whereExists(db('user_roles as ur').join('roles as r', 'r.id', 'ur.role_id')
          .whereRaw('ur.user_id = users.id').whereIn('r.name', ROLE_GROUPS[role]));
      }
      if (q) {
        qb.where((qb2) => qb2.whereILike('full_name', `%${q}%`)
          .orWhereILike('email', `%${q}%`)
          .orWhereILike('phone', `%${q}%`));
      }
    });
  const [{ count }] = await base.clone().count('* as count');
  const [column, direction] = USER_SORTS[sort] || USER_SORTS.newest;
  const stats = db('orders').whereNotIn('status', ['pending_payment', 'payment_failed'])
    .groupBy('user_id')
    .select('user_id', db.raw('COUNT(*)::int as order_count'),
      db.raw("COALESCE(SUM(total_minor) FILTER (WHERE status NOT IN ('cancelled','refunded','returned')), 0)::bigint as total_spent_minor"),
      db.raw('MAX(created_at) as last_order_at'))
    .as('st');
  const rows = await base.clone()
    .leftJoin(stats, 'st.user_id', 'users.id')
    .orderByRaw(`${column} ${direction} NULLS LAST`)
    .offset((page - 1) * limit)
    .limit(limit)
    .select('id', 'full_name', 'email', 'phone', 'status', 'is_email_verified', 'is_phone_verified', 'created_at', 'last_login_at',
      db.raw('COALESCE(st.order_count, 0) as order_count'), db.raw('COALESCE(st.total_spent_minor, 0) as total_spent_minor'), 'st.last_order_at',
      db.raw(`(SELECT array_agg(r.name) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = users.id) as roles`));
  return {
    total: Number(count),
    rows: rows.map((r) => {
      const orders = Number(r.order_count);
      const spent = Number(r.total_spent_minor);
      return { ...r, order_count: orders, total_spent_minor: spent, aov_minor: orders ? Math.round(spent / orders) : 0, roles: r.roles || [] };
    }),
  };
};

const getDetail = async (userId) => {
  const user = await db('users').where({ id: userId }).whereNull('deleted_at').first();
  if (!user) throw ApiError.notFound('User');
  const roles = await db('user_roles as ur')
    .join('roles as r', 'r.id', 'ur.role_id')
    .where('ur.user_id', userId)
    .pluck('r.name');
  const orderStats = await db('orders')
    .where({ user_id: userId })
    .select(
      db.raw('COUNT(*)::int as total_orders'),
      db.raw("COALESCE(SUM(total_minor), 0)::bigint as lifetime_value_minor"),
    )
    .first();

  const [addresses, wishlist, reviews, vendor] = await Promise.all([
    db('addresses').where({ user_id: userId }).whereNull('deleted_at').orderBy('is_default', 'desc'),
    db('wishlist_items as wi').join('wishlists as w', 'w.id', 'wi.wishlist_id').join('products as p', 'p.id', 'wi.product_id')
      .where('w.user_id', userId).select('p.id', 'p.title', 'wi.added_at as created_at').orderBy('wi.added_at', 'desc').limit(50),
    db('reviews as r').join('products as p', 'p.id', 'r.product_id').where('r.user_id', userId)
      .select('r.id', 'r.rating', 'r.title', 'r.status', 'r.created_at', 'p.title as product_title', 'p.id as product_id')
      .orderBy('r.created_at', 'desc').limit(50),
    db('vendors').where({ owner_user_id: userId }).whereNull('deleted_at').select('id', 'store_name', 'status').first(),
  ]);
  const { password_hash: _ph, ...safeUser } = user;
  return {
    ...safeUser,
    roles,
    totalOrders: orderStats.total_orders,
    lifetimeValueMinor: Number(orderStats.lifetime_value_minor),
    addresses,
    wishlist,
    reviews,
    vendor: vendor || null,
  };
};

const suspend = async (adminId, userId) => {
  const updated = await db('users').where({ id: userId, status: 'active' }).whereNull('deleted_at')
    .update({ status: 'suspended' });
  if (!updated) throw ApiError.businessRule('Only an active user can be suspended');
};

const reactivate = async (adminId, userId) => {
  const updated = await db('users').where({ id: userId, status: 'suspended' }).whereNull('deleted_at')
    .update({ status: 'active' });
  if (!updated) throw ApiError.businessRule('Only a suspended user can be reactivated');
};

module.exports = { list, getDetail, suspend, reactivate };
