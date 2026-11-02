const db = require('../../config/database');

/** High-level KPIs for the vendor dashboard landing page. */
const getSummary = async (vendorId) => {
  const [
    vendor, orderStats, productStats, pendingPayout, paidOut,
  ] = await Promise.all([
    db('vendors').where({ id: vendorId }).select('rating_avg', 'rating_count').first(),

    db('order_items as oi')
      .join('order_shipments as s', 's.id', 'oi.shipment_id')
      .where('oi.vendor_id', vendorId)
      .where('s.status', 'delivered')
      .select(
        db.raw('COUNT(DISTINCT oi.order_id)::int as total_orders'),
        db.raw('COALESCE(SUM(oi.quantity), 0)::int as total_units'),
        db.raw('COALESCE(SUM(oi.line_total_minor), 0)::bigint as total_revenue_minor'),
      )
      .first(),

    db('products').where({ vendor_id: vendorId }).whereNull('deleted_at')
      .select('status').count('* as count').groupBy('status'),

    // Delivered, past hold window implicitly enforced by payout generation — here we
    // just show "not yet paid out" regardless of hold eligibility as a forward-looking figure.
    db('order_items as oi')
      .join('order_shipments as s', 's.id', 'oi.shipment_id')
      .where('oi.vendor_id', vendorId)
      .where('s.status', 'delivered')
      .whereNotExists(
        db('payout_transactions').whereRaw('payout_transactions.order_item_id = oi.id').andWhere('txn_type', 'sale'),
      )
      .whereNotExists(
        db('return_requests').whereRaw('return_requests.order_item_id = oi.id').whereNotIn('status', ['rejected']),
      )
      .select(db.raw('COALESCE(SUM(oi.line_total_minor - oi.commission_minor), 0)::bigint as amount'))
      .first(),

    db('vendor_payouts').where({ vendor_id: vendorId, status: 'paid' })
      .select(db.raw('COALESCE(SUM(net_minor), 0)::bigint as amount')).first(),
  ]);

  const productCounts = Object.fromEntries(productStats.map((p) => [p.status, Number(p.count)]));

  return {
    ratingAvg: Number(vendor?.rating_avg || 0),
    ratingCount: vendor?.rating_count || 0,
    totalOrders: orderStats.total_orders,
    totalUnitsSold: orderStats.total_units,
    totalRevenueMinor: Number(orderStats.total_revenue_minor),
    pendingPayoutMinor: Number(pendingPayout.amount),
    totalPaidOutMinor: Number(paidOut.amount),
    products: {
      active: productCounts.active || 0,
      pendingApproval: productCounts.pending_approval || 0,
      draft: productCounts.draft || 0,
      rejected: productCounts.rejected || 0,
      inactive: productCounts.inactive || 0,
    },
  };
};

/** Revenue & order-count time series, bucketed by day or month. */
const getSalesTrend = async (vendorId, { interval = 'day', from, to }) => {
  const rows = await db('order_items as oi')
    .join('order_shipments as s', 's.id', 'oi.shipment_id')
    .where('oi.vendor_id', vendorId)
    .where('s.status', 'delivered')
    .whereNotNull('s.delivered_at')
    .modify((qb) => {
      if (from) qb.where('s.delivered_at', '>=', from);
      if (to) qb.where('s.delivered_at', '<', to);
    })
    .select(
      db.raw(`date_trunc('${interval === 'month' ? 'month' : 'day'}', s.delivered_at) as bucket`),
      db.raw('COUNT(DISTINCT oi.order_id)::int as orders'),
      db.raw('COALESCE(SUM(oi.quantity), 0)::int as units'),
      db.raw('COALESCE(SUM(oi.line_total_minor), 0)::bigint as revenue_minor'),
    )
    .groupBy('bucket')
    .orderBy('bucket');

  return rows.map((r) => ({
    date: r.bucket,
    orders: r.orders,
    units: r.units,
    revenueMinor: Number(r.revenue_minor),
  }));
};

const getTopProducts = async (vendorId, { limit = 10, by = 'revenue' }) => {
  const sortCol = by === 'units' ? 'units' : 'revenue_minor';
  const rows = await db('order_items as oi')
    .join('order_shipments as s', 's.id', 'oi.shipment_id')
    .join('products as p', 'p.id', 'oi.product_id')
    .where('oi.vendor_id', vendorId)
    .where('s.status', 'delivered')
    .groupBy('oi.product_id', 'p.title', 'p.slug')
    .select(
      'oi.product_id', 'p.title', 'p.slug',
      db.raw('COALESCE(SUM(oi.quantity), 0)::int as units'),
      db.raw('COALESCE(SUM(oi.line_total_minor), 0)::bigint as revenue_minor'),
    )
    .orderBy(sortCol, 'desc')
    .limit(limit);

  return rows.map((r) => ({ ...r, revenue_minor: Number(r.revenue_minor) }));
};

module.exports = { getSummary, getSalesTrend, getTopProducts };
