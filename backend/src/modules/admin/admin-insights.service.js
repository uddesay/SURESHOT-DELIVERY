const db = require('../../config/database');

/** Orders that represent a placed purchase (excludes abandoned online payments). */
const PLACED_EXCLUDED = ['pending_payment', 'payment_failed'];
/** Orders whose value still counts as a sale (not cancelled, returned or refunded). */
const NET_STATUSES = ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
const REFUND_STATUSES = ['return_requested', 'returned', 'refunded'];
const DAY_MS = 86400000;

/**
 * Resolves the requested window and an equally long window immediately before
 * it, so every KPI can be compared like-for-like.
 */
const resolvePeriods = ({ from, to }, now = new Date()) => {
  const end = to ? new Date(to) : new Date(Math.ceil(now.getTime() / DAY_MS) * DAY_MS);
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * DAY_MS);
  if (!(start < end)) throw new RangeError('from must be before to');
  const length = end.getTime() - start.getTime();
  return {
    current: { from: start, to: end },
    previous: { from: new Date(start.getTime() - length), to: start },
    days: Math.max(1, Math.round(length / DAY_MS)),
  };
};

/** Percentage change, null when there is no baseline to compare against. */
const percentChange = (current, previous) => {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

const ratio = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

const periodTotals = async ({ from, to }) => {
  const inRange = (qb, column = 'created_at') => qb.where(column, '>=', from).where(column, '<', to);
  const [orders, customers, repeat, vendors] = await Promise.all([
    db('orders').modify(inRange).whereNotIn('status', PLACED_EXCLUDED)
      .select(
        db.raw('COUNT(*)::int as placed'),
        db.raw('COALESCE(SUM(total_minor), 0)::bigint as gmv'),
        db.raw('COUNT(*) FILTER (WHERE status = ANY(?))::int as net_orders', [NET_STATUSES]),
        db.raw('COALESCE(SUM(total_minor) FILTER (WHERE status = ANY(?)), 0)::bigint as net_sales', [NET_STATUSES]),
        db.raw('COUNT(*) FILTER (WHERE status = ANY(?))::int as refunded', [REFUND_STATUSES]),
        db.raw('COUNT(DISTINCT user_id)::int as buyers'),
      ).first(),
    db('users as u').join('user_roles as ur', 'ur.user_id', 'u.id').join('roles as r', 'r.id', 'ur.role_id')
      .where('r.name', 'customer').whereNull('u.deleted_at').modify((qb) => inRange(qb, 'u.created_at'))
      .countDistinct('u.id as count').first(),
    // Buyers in the window who had also ordered before the window started.
    db('orders as o').modify((qb) => inRange(qb, 'o.created_at')).whereNotIn('o.status', PLACED_EXCLUDED)
      .whereExists(db('orders as p').whereRaw('p.user_id = o.user_id').where('p.created_at', '<', from)
        .whereNotIn('p.status', PLACED_EXCLUDED))
      .countDistinct('o.user_id as count').first(),
    db('vendors').where({ status: 'approved' }).whereNull('deleted_at')
      .where((qb) => qb.whereNull('approved_at').orWhere('approved_at', '<', to)).count('* as count').first(),
  ]);
  const netSales = Number(orders.net_sales);
  return {
    gmv: Number(orders.gmv),
    netSales,
    orders: orders.placed,
    aov: orders.net_orders ? Math.round(netSales / orders.net_orders) : 0,
    newCustomers: Number(customers.count),
    activeVendors: Number(vendors.count),
    repeatRate: ratio(Number(repeat.count), orders.buyers),
    refundRate: ratio(orders.refunded, orders.placed),
  };
};

const dailySeries = async ({ from, to }) => {
  const [orderRows, userRows] = await Promise.all([
    db('orders').where('created_at', '>=', from).where('created_at', '<', to).whereNotIn('status', PLACED_EXCLUDED)
      .select(
        db.raw("to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') as day"),
        db.raw('COUNT(*)::int as orders'),
        db.raw('COALESCE(SUM(total_minor), 0)::bigint as gmv'),
        db.raw('COALESCE(SUM(total_minor) FILTER (WHERE status = ANY(?)), 0)::bigint as revenue', [NET_STATUSES]),
        db.raw('COUNT(*) FILTER (WHERE status = ANY(?))::int as net_orders', [NET_STATUSES]),
      ).groupBy('day'),
    db('users as u').join('user_roles as ur', 'ur.user_id', 'u.id').join('roles as r', 'r.id', 'ur.role_id')
      .where('r.name', 'customer').whereNull('u.deleted_at')
      .where('u.created_at', '>=', from).where('u.created_at', '<', to)
      .select(db.raw("to_char(date_trunc('day', u.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') as day"),
        db.raw('COUNT(DISTINCT u.id)::int as customers'))
      .groupBy('day'),
  ]);
  return buildDailySeries({ from, to }, orderRows, userRows);
};

/** Fills every day in the window so charts never skip empty days. */
const buildDailySeries = ({ from, to }, orderRows, userRows) => {
  const orders = new Map(orderRows.map((r) => [r.day, r]));
  const users = new Map(userRows.map((r) => [r.day, r]));
  const series = [];
  for (let t = new Date(from).getTime(); t < new Date(to).getTime(); t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    const o = orders.get(day);
    const revenue = Number(o?.revenue || 0);
    const netOrders = Number(o?.net_orders || 0);
    series.push({
      date: day,
      gmv: Number(o?.gmv || 0),
      revenue,
      orders: Number(o?.orders || 0),
      netOrders,
      customers: Number(users.get(day)?.customers || 0),
      aov: netOrders ? Math.round(revenue / netOrders) : 0,
    });
  }
  return series;
};

const getOverview = async (query) => {
  const { current, previous, days } = resolvePeriods(query);
  const [now, before, series, previousSeries, queues] = await Promise.all([
    periodTotals(current),
    periodTotals(previous),
    dailySeries(current),
    dailySeries(previous),
    getQueues(),
  ]);
  const kpis = Object.fromEntries(Object.keys(now).map((key) => [key, {
    value: now[key], previous: before[key], change: percentChange(now[key], before[key]),
  }]));
  return {
    range: { from: current.from.toISOString(), to: current.to.toISOString(), days },
    previousRange: { from: previous.from.toISOString(), to: previous.to.toISOString() },
    kpis,
    series,
    previousSeries,
    queues,
  };
};

const getQueues = async () => {
  const count = (qb) => qb.count('* as count').first().then((r) => Number(r.count));
  const [products, vendors, payouts, returns, tickets, lowStock, reviews] = await Promise.all([
    count(db('products').where({ status: 'pending_approval' }).whereNull('deleted_at')),
    count(db('vendors').whereIn('status', ['pending', 'under_review']).whereNull('deleted_at')),
    count(db('vendor_payouts').where({ status: 'pending' })),
    count(db('return_requests').where({ status: 'requested' })),
    count(db('support_tickets').whereIn('status', ['open', 'in_progress'])),
    count(db('inventory_stocks as s').join('product_variants as v', 'v.id', 's.variant_id').whereNull('v.deleted_at')
      .whereRaw('(s.quantity - s.reserved) <= s.low_stock_threshold')),
    count(db('reviews').where({ status: 'pending' })),
  ]);
  return { products, vendors, payouts, returns, tickets, lowStock, reviews };
};

/** Top products, categories and vendors by net sales inside the window, plus order status mix. */
const getBreakdown = async (query) => {
  const { current: { from, to } } = resolvePeriods(query);
  const limit = query.limit || 8;
  const lines = () => db('order_items as oi').join('orders as o', 'o.id', 'oi.order_id')
    .whereIn('o.status', NET_STATUSES).where('o.created_at', '>=', from).where('o.created_at', '<', to);
  const money = [
    db.raw('COALESCE(SUM(oi.line_total_minor), 0)::bigint as revenue_minor'),
    db.raw('COALESCE(SUM(oi.quantity), 0)::int as units'),
    db.raw('COUNT(DISTINCT oi.order_id)::int as orders'),
  ];
  const [products, categories, vendors, statuses, payments] = await Promise.all([
    lines().join('products as p', 'p.id', 'oi.product_id').groupBy('p.id', 'p.title')
      .select('p.id', 'p.title as name', ...money).orderBy('revenue_minor', 'desc').limit(limit),
    lines().join('products as p', 'p.id', 'oi.product_id').join('categories as c', 'c.id', 'p.category_id')
      .groupBy('c.id', 'c.name').select('c.id', 'c.name', ...money).orderBy('revenue_minor', 'desc').limit(limit),
    lines().join('vendors as v', 'v.id', 'oi.vendor_id').groupBy('v.id', 'v.store_name')
      .select('v.id', 'v.store_name as name', ...money, db.raw('COALESCE(SUM(oi.commission_minor), 0)::bigint as commission_minor'))
      .orderBy('revenue_minor', 'desc').limit(limit),
    db('orders').where('created_at', '>=', from).where('created_at', '<', to)
      .groupBy('status').select('status', db.raw('COUNT(*)::int as count')).orderBy('count', 'desc'),
    db('orders').where('created_at', '>=', from).where('created_at', '<', to).whereNotIn('status', PLACED_EXCLUDED)
      .groupBy('payment_method').select('payment_method as method', db.raw('COUNT(*)::int as count'),
        db.raw('COALESCE(SUM(total_minor), 0)::bigint as amount_minor')),
  ]);
  const num = (rows) => rows.map((r) => ({
    ...r,
    revenue_minor: Number(r.revenue_minor),
    ...(r.commission_minor !== undefined ? { commission_minor: Number(r.commission_minor) } : {}),
  }));
  return {
    products: num(products),
    categories: num(categories),
    vendors: num(vendors),
    statuses,
    payments: payments.map((p) => ({ ...p, amount_minor: Number(p.amount_minor) })),
  };
};

// ---------------------------------------------------------------- activity

/** Merges independently-sourced events newest first. */
const mergeActivity = (groups, limit) => groups.flat()
  .filter((e) => e.at)
  .sort((a, b) => new Date(b.at) - new Date(a.at))
  .slice(0, limit);

const getActivity = async ({ limit = 20 }) => {
  const take = limit;
  const [orders, customers, vendors, products, returns, payments, tickets] = await Promise.all([
    db('orders as o').join('users as u', 'u.id', 'o.user_id').whereNotIn('o.status', ['pending_payment'])
      .orderBy('o.created_at', 'desc').limit(take)
      .select('o.id', 'o.order_number', 'o.status', 'o.total_minor', 'o.created_at', 'u.full_name'),
    db('users as u').join('user_roles as ur', 'ur.user_id', 'u.id').join('roles as r', 'r.id', 'ur.role_id')
      .where('r.name', 'customer').whereNull('u.deleted_at').orderBy('u.created_at', 'desc').limit(take)
      .select('u.id', 'u.full_name', 'u.email', 'u.created_at'),
    db('vendors').whereNull('deleted_at').orderBy('updated_at', 'desc').limit(take)
      .select('id', 'store_name', 'status', 'created_at', 'approved_at', 'updated_at'),
    db('products').whereNull('deleted_at').whereNotNull('published_at').orderBy('published_at', 'desc').limit(take)
      .select('id', 'title', 'status', 'published_at'),
    db('return_requests as r').join('orders as o', 'o.id', 'r.order_id').orderBy('r.created_at', 'desc').limit(take)
      .select('r.id', 'r.status', 'r.request_type', 'r.created_at', 'o.order_number', 'o.id as order_id'),
    db('payments as p').join('orders as o', 'o.id', 'p.order_id').where('p.status', 'captured')
      .whereNotNull('p.captured_at').orderBy('p.captured_at', 'desc').limit(take)
      .select('p.id', 'p.amount_minor', 'p.provider', 'p.captured_at', 'o.order_number', 'o.id as order_id'),
    db('support_tickets').orderBy('created_at', 'desc').limit(take)
      .select('id', 'ticket_number', 'subject', 'status', 'priority', 'created_at'),
  ]);

  return mergeActivity([
    orders.map((o) => ({
      id: `order-${o.id}`, type: 'order', title: 'New order received', entity: o.order_number,
      detail: o.full_name, amountMinor: Number(o.total_minor), status: o.status, at: o.created_at, link: `/orders/${o.id}`,
    })),
    customers.map((u) => ({
      id: `customer-${u.id}`, type: 'customer', title: 'Customer registered', entity: u.full_name || u.email,
      detail: u.email, status: 'active', at: u.created_at, link: `/customers/${u.id}`,
    })),
    vendors.map((v) => (v.status === 'approved' && v.approved_at
      ? { id: `vendor-${v.id}`, type: 'vendor', title: 'Vendor approved', entity: v.store_name, status: v.status, at: v.approved_at, link: `/vendors/${v.id}` }
      : { id: `vendor-${v.id}`, type: 'vendor', title: v.status === 'pending' ? 'Vendor applied' : 'Vendor updated', entity: v.store_name, status: v.status, at: v.status === 'pending' ? v.created_at : v.updated_at, link: `/vendors/${v.id}` })),
    products.map((p) => ({
      id: `product-${p.id}`, type: 'product', title: 'Product published', entity: p.title, status: p.status, at: p.published_at, link: `/products/${p.id}`,
    })),
    returns.map((r) => ({
      id: `return-${r.id}`, type: 'refund', title: r.request_type === 'exchange' ? 'Exchange requested' : 'Refund requested',
      entity: r.order_number, status: r.status, at: r.created_at, link: `/orders/${r.order_id}`,
    })),
    payments.map((p) => ({
      id: `payment-${p.id}`, type: 'payment', title: 'Payment received', entity: p.order_number, detail: p.provider,
      amountMinor: Number(p.amount_minor), status: 'captured', at: p.captured_at, link: `/orders/${p.order_id}`,
    })),
    tickets.map((t) => ({
      id: `ticket-${t.id}`, type: 'support', title: 'Support ticket opened', entity: t.ticket_number, detail: t.subject,
      status: t.status, at: t.created_at, link: `/support/tickets/${t.id}`,
    })),
  ], limit);
};

// ---------------------------------------------------------------- search

const getSearch = async ({ q, limit = 5 }) => {
  const term = `%${q.trim()}%`;
  const [products, orders, customers, vendors, categories] = await Promise.all([
    db('products as p').leftJoin('product_variants as v', function joinDefault() {
      this.on('v.product_id', 'p.id').andOn('v.is_default', db.raw('true'));
    }).whereNull('p.deleted_at')
      .where((qb) => qb.whereILike('p.title', term).orWhereILike('v.sku', term))
      .orderBy('p.updated_at', 'desc').limit(limit)
      .select('p.id', 'p.title', 'p.status', 'v.sku'),
    db('orders as o').join('users as u', 'u.id', 'o.user_id')
      .where((qb) => qb.whereILike('o.order_number', term).orWhereILike('u.full_name', term).orWhereILike('u.email', term))
      .orderBy('o.created_at', 'desc').limit(limit)
      .select('o.id', 'o.order_number', 'o.status', 'o.total_minor', 'u.full_name'),
    db('users').whereNull('deleted_at')
      .where((qb) => qb.whereILike('full_name', term).orWhereILike('email', term).orWhereILike('phone', term))
      .orderBy('created_at', 'desc').limit(limit)
      .select('id', 'full_name', 'email', 'status'),
    db('vendors').whereNull('deleted_at').where((qb) => qb.whereILike('store_name', term).orWhereILike('store_slug', term))
      .orderBy('created_at', 'desc').limit(limit)
      .select('id', 'store_name', 'status'),
    db('categories').whereNull('deleted_at').whereILike('name', term).orderBy('sort_order').limit(limit)
      .select('id', 'name', 'slug', 'is_active'),
  ]);
  return {
    products: products.map((p) => ({ id: p.id, title: p.title, subtitle: p.sku || 'No SKU', status: p.status, link: `/products/${p.id}` })),
    orders: orders.map((o) => ({ id: o.id, title: o.order_number, subtitle: o.full_name, status: o.status, amountMinor: Number(o.total_minor), link: `/orders/${o.id}` })),
    customers: customers.map((u) => ({ id: u.id, title: u.full_name || u.email, subtitle: u.email, status: u.status, link: `/customers/${u.id}` })),
    vendors: vendors.map((v) => ({ id: v.id, title: v.store_name, subtitle: 'Vendor', status: v.status, link: `/vendors/${v.id}` })),
    categories: categories.map((c) => ({ id: c.id, title: c.name, subtitle: `/${c.slug}`, status: c.is_active ? 'active' : 'inactive', link: `/categories?focus=${c.id}` })),
  };
};

module.exports = {
  getOverview, getBreakdown, getActivity, getSearch, getQueues,
  // pure helpers, exported for tests
  resolvePeriods, percentChange, buildDailySeries, mergeActivity,
};
