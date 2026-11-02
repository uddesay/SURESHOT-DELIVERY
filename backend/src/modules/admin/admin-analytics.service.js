const db = require('../../config/database');

const PAID_ORDER_STATUSES = [
  'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered',
];

const getSummary = async () => {
  const [
    revenue, userCount, vendorCounts, pendingProducts, pendingPayouts, orderCount,
  ] = await Promise.all([
    db('orders').whereIn('status', PAID_ORDER_STATUSES)
      .select(db.raw('COALESCE(SUM(total_minor), 0)::bigint as total')).first(),
    db('users').whereNull('deleted_at').count('* as count').first(),
    db('vendors').whereNull('deleted_at').select('status').count('* as count').groupBy('status'),
    db('products').where({ status: 'pending_approval' }).whereNull('deleted_at').count('* as count').first(),
    db('vendor_payouts').where({ status: 'pending' }).count('* as count').first(),
    db('orders').whereIn('status', PAID_ORDER_STATUSES).count('* as count').first(),
  ]);

  const vendorsByStatus = Object.fromEntries(vendorCounts.map((v) => [v.status, Number(v.count)]));

  return {
    totalRevenueMinor: Number(revenue.total),
    totalOrders: Number(orderCount.count),
    totalUsers: Number(userCount.count),
    vendors: {
      approved: vendorsByStatus.approved || 0,
      pending: vendorsByStatus.pending || 0,
      underReview: vendorsByStatus.under_review || 0,
      suspended: vendorsByStatus.suspended || 0,
    },
    pendingProductApprovals: Number(pendingProducts.count),
    pendingPayouts: Number(pendingPayouts.count),
  };
};

const getSalesTrend = async ({ interval = 'day', from, to }) => {
  const rows = await db('orders')
    .whereIn('status', PAID_ORDER_STATUSES)
    .modify((qb) => {
      if (from) qb.where('created_at', '>=', from);
      if (to) qb.where('created_at', '<', to);
    })
    .select(
      db.raw(`date_trunc('${interval === 'month' ? 'month' : 'day'}', created_at) as bucket`),
      db.raw('COUNT(*)::int as orders'),
      db.raw('COALESCE(SUM(total_minor), 0)::bigint as revenue_minor'),
    )
    .groupBy('bucket')
    .orderBy('bucket');

  return rows.map((r) => ({ date: r.bucket, orders: r.orders, revenueMinor: Number(r.revenue_minor) }));
};

const getUserGrowth = async ({ interval = 'day', from, to }) => {
  const rows = await db('users')
    .whereNull('deleted_at')
    .modify((qb) => {
      if (from) qb.where('created_at', '>=', from);
      if (to) qb.where('created_at', '<', to);
    })
    .select(
      db.raw(`date_trunc('${interval === 'month' ? 'month' : 'day'}', created_at) as bucket`),
      db.raw('COUNT(*)::int as new_users'),
    )
    .groupBy('bucket')
    .orderBy('bucket');

  return rows.map((r) => ({ date: r.bucket, newUsers: r.new_users }));
};

const getTopVendors = async ({ limit = 10 }) => {
  const rows = await db('order_items as oi')
    .join('order_shipments as s', 's.id', 'oi.shipment_id')
    .join('vendors as v', 'v.id', 'oi.vendor_id')
    .where('s.status', 'delivered')
    .groupBy('v.id', 'v.store_name')
    .select(
      'v.id', 'v.store_name',
      db.raw('COALESCE(SUM(oi.line_total_minor), 0)::bigint as revenue_minor'),
      db.raw('COALESCE(SUM(oi.quantity), 0)::int as units'),
    )
    .orderBy('revenue_minor', 'desc')
    .limit(limit);
  return rows.map((r) => ({ ...r, revenue_minor: Number(r.revenue_minor) }));
};

const getTopProducts = async ({ limit = 10 }) => {
  const rows = await db('order_items as oi')
    .join('order_shipments as s', 's.id', 'oi.shipment_id')
    .join('products as p', 'p.id', 'oi.product_id')
    .where('s.status', 'delivered')
    .groupBy('p.id', 'p.title')
    .select(
      'p.id', 'p.title',
      db.raw('COALESCE(SUM(oi.line_total_minor), 0)::bigint as revenue_minor'),
      db.raw('COALESCE(SUM(oi.quantity), 0)::int as units'),
    )
    .orderBy('revenue_minor', 'desc')
    .limit(limit);
  return rows.map((r) => ({ ...r, revenue_minor: Number(r.revenue_minor) }));
};

module.exports = { getSummary, getSalesTrend, getUserGrowth, getTopVendors, getTopProducts };
