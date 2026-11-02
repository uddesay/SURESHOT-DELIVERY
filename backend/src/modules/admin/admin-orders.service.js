const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { releaseReservations } = require('../orders/checkout.service');
const walletService = require('../wallet/wallet.service');

const SORTS = {
  newest: ['o.created_at', 'desc'],
  oldest: ['o.created_at', 'asc'],
  total_desc: ['o.total_minor', 'desc'],
  total_asc: ['o.total_minor', 'asc'],
};

const list = async ({
  page = 1, limit = 20, status, q, paymentMethod, vendorId, userId, from, to, sort = 'newest',
}) => {
  const base = db('orders as o')
    .join('users as u', 'u.id', 'o.user_id')
    .modify((qb) => {
      if (status) qb.whereIn('o.status', String(status).split(','));
      if (paymentMethod) qb.where('o.payment_method', paymentMethod);
      if (userId) qb.where('o.user_id', userId);
      if (from) qb.where('o.created_at', '>=', from);
      if (to) qb.where('o.created_at', '<', to);
      if (vendorId) qb.whereExists(db('order_items as vi').whereRaw('vi.order_id = o.id').where('vi.vendor_id', vendorId));
      if (q) {
        qb.where((qb2) => qb2.whereILike('o.order_number', `%${q}%`)
          .orWhereILike('u.full_name', `%${q}%`)
          .orWhereILike('u.email', `%${q}%`));
      }
    });
  const [{ count }] = await base.clone().count('* as count');
  const order = SORTS[sort] || SORTS.newest;
  const rows = await base.clone()
    .orderBy(order[0], order[1])
    .offset((page - 1) * limit)
    .limit(limit)
    .select('o.id', 'o.order_number', 'o.status', 'o.total_minor', 'o.payment_method', 'o.created_at', 'o.user_id',
      'u.full_name as customer_name', 'u.email as customer_email', 'u.phone as customer_phone',
      db.raw('(SELECT COALESCE(SUM(quantity), 0)::int FROM order_items WHERE order_id = o.id) as item_count'),
      db.raw(`(SELECT string_agg(DISTINCT v.store_name, ', ') FROM order_items oi
        JOIN vendors v ON v.id = oi.vendor_id WHERE oi.order_id = o.id) as vendor_names`),
      db.raw(`(SELECT p.status FROM payments p WHERE p.order_id = o.id ORDER BY p.created_at DESC LIMIT 1) as payment_status`));
  return { total: Number(count), rows: rows.map((r) => ({ ...r, total_minor: Number(r.total_minor) })) };
};

const getDetail = async (orderId) => {
  const order = await db('orders').where({ id: orderId }).first();
  if (!order) throw ApiError.notFound('Order');

  const [customer, items, shipments, history, payments, returns, refunds, events] = await Promise.all([
    db('users').where({ id: order.user_id }).select('id', 'full_name', 'email', 'phone').first(),
    db('order_items as i').leftJoin('vendors as v', 'v.id', 'i.vendor_id')
      .where('i.order_id', orderId).select('i.*', 'v.store_name as vendor_name'),
    db('order_shipments as s').leftJoin('vendors as v', 'v.id', 's.vendor_id')
      .where('s.order_id', orderId).select('s.*', 'v.store_name as vendor_name'),
    db('order_status_history as h').leftJoin('users as a', 'a.id', 'h.actor_id')
      .where('h.order_id', orderId).orderBy('h.created_at').select('h.*', 'a.full_name as actor_name'),
    db('payments').where({ order_id: orderId }).orderBy('created_at'),
    db('return_requests').where({ order_id: orderId }).orderBy('created_at', 'desc'),
    db('refunds as r').join('payments as p', 'p.id', 'r.payment_id').where('p.order_id', orderId)
      .select('r.*').orderBy('r.created_at', 'desc'),
    db('shipment_tracking_events as e').join('order_shipments as s', 's.id', 'e.shipment_id')
      .where('s.order_id', orderId).select('e.*').orderBy('e.occurred_at'),
  ]);

  return {
    ...order,
    subtotal_minor: Number(order.subtotal_minor),
    discount_minor: Number(order.discount_minor),
    shipping_minor: Number(order.shipping_minor),
    tax_minor: Number(order.tax_minor),
    total_minor: Number(order.total_minor),
    customer,
    items: items.map((i) => ({ ...i, unit_price_minor: Number(i.unit_price_minor), line_total_minor: Number(i.line_total_minor) })),
    shipments,
    statusHistory: history,
    payments: payments.map((p) => ({ ...p, amount_minor: Number(p.amount_minor) })),
    returns: returns.map((r) => ({ ...r, refund_amount_minor: r.refund_amount_minor == null ? null : Number(r.refund_amount_minor) })),
    refunds: refunds.map((r) => ({ ...r, amount_minor: Number(r.amount_minor) })),
    trackingEvents: events,
  };
};

const CANCELLABLE = ['pending_payment', 'confirmed', 'processing', 'packed'];

/** Admin override cancellation — same effect as the customer's own cancel, usable for disputes/fraud. */
const cancel = async (adminId, orderId, reason) => {
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId }).forUpdate().first();
    if (!order) throw ApiError.notFound('Order');
    if (!CANCELLABLE.includes(order.status)) {
      throw ApiError.businessRule(`Order cannot be cancelled in '${order.status}' state`);
    }

    await trx('orders').where({ id: orderId }).update({
      status: 'cancelled', cancelled_reason: reason, cancelled_by: adminId,
    });
    await trx('order_shipments').where({ order_id: orderId })
      .whereNotIn('status', ['delivered', 'cancelled'])
      .update({ status: 'cancelled' });
    await trx('order_status_history').insert({
      id: uuid(), order_id: orderId, from_status: order.status, to_status: 'cancelled',
      actor_id: adminId, note: `Admin override: ${reason}`,
    });

    await releaseReservations(trx, orderId);

    const captured = await trx('payments').where({ order_id: orderId, status: 'captured' }).whereNot({ provider: 'cod' });
    const refundable = captured.reduce((sum, p) => sum + Number(p.amount_minor), 0);
    if (refundable > 0) {
      await walletService.credit(trx, order.user_id, {
        amountMinor: refundable, source: 'refund', referenceType: 'order', referenceId: orderId,
        description: `Refund for admin-cancelled order ${order.order_number}`,
      });
      for (const p of captured) {
        await trx('refunds').insert({
          id: uuid(), payment_id: p.id, amount_minor: p.amount_minor,
          destination: 'wallet', status: 'completed', initiated_by: adminId, completed_at: trx.fn.now(),
        });
      }
    }

    return getDetail(orderId);
  });
};

module.exports = { list, getDetail, cancel };
