const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const catalogCache = require('../catalog/catalog.cache');
const ApiError = require('../../utils/ApiError');
const { releaseReservations } = require('./checkout.service');
const walletService = require('../wallet/wallet.service');

/** States from which a customer can still cancel. */
const CANCELLABLE = ['pending_payment', 'confirmed', 'processing', 'packed'];

const listByUser = async (userId, { page = 1, limit = 10, status }) => {
  const base = db('orders')
    .where({ user_id: userId })
    .modify((qb) => status && qb.where({ status }));
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone().orderBy('created_at', 'desc').offset((page - 1) * limit).limit(limit);

  const orderIds = rows.map((r) => r.id);
  const items = orderIds.length
    ? await db('order_items').whereIn('order_id', orderIds)
      .select('order_id', 'title', 'image_url', 'quantity')
    : [];
  const itemsByOrder = new Map();
  for (const i of items) {
    itemsByOrder.set(i.order_id, [...(itemsByOrder.get(i.order_id) || []), i]);
  }

  return {
    total: Number(count),
    rows: rows.map((r) => ({
      id: r.id,
      orderNumber: r.order_number,
      status: r.status,
      totalMinor: Number(r.total_minor),
      paymentMethod: r.payment_method,
      placedAt: r.placed_at,
      items: (itemsByOrder.get(r.id) || []).map((i) => ({
        title: i.title, image: i.image_url, quantity: i.quantity,
      })),
    })),
  };
};

const getDetail = async (userId, orderId, connection = db) => {
  const order = await connection('orders').where({ id: orderId, user_id: userId }).first();
  if (!order) throw ApiError.notFound('Order');

  const [items, shipments, history, payments] = await Promise.all([
    connection('order_items').where({ order_id: orderId }),
    connection('order_shipments as s')
      .leftJoin('vendors as v', 'v.id', 's.vendor_id')
      .where('s.order_id', orderId)
      .select('s.*', 'v.store_name as vendor_name'),
    connection('order_status_history').where({ order_id: orderId }).orderBy('created_at'),
    connection('payments').where({ order_id: orderId }).orderBy('created_at'),
  ]);

  return {
    ...order,
    subtotal_minor: Number(order.subtotal_minor),
    discount_minor: Number(order.discount_minor),
    shipping_minor: Number(order.shipping_minor),
    tax_minor: Number(order.tax_minor),
    wallet_used_minor: Number(order.wallet_used_minor),
    total_minor: Number(order.total_minor),
    items: items.map((i) => ({ ...i, unit_price_minor: Number(i.unit_price_minor), line_total_minor: Number(i.line_total_minor) })),
    shipments,
    statusHistory: history,
    payments: payments.map((p) => ({
      id: p.id, provider: p.provider, status: p.status, amountMinor: Number(p.amount_minor), capturedAt: p.captured_at,
    })),
  };
};

const cancel = async (userId, orderId, reason) => {
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId, user_id: userId }).forUpdate().first();
    if (!order) throw ApiError.notFound('Order');
    if (!CANCELLABLE.includes(order.status)) {
      throw ApiError.businessRule(`Order cannot be cancelled in '${order.status}' state`);
    }

    await trx('orders').where({ id: orderId }).update({
      status: 'cancelled',
      cancelled_reason: reason,
      cancelled_by: userId,
    });
    await trx('order_shipments').where({ order_id: orderId })
      .whereNotIn('status', ['delivered', 'cancelled'])
      .update({ status: 'cancelled' });
    await trx('order_status_history').insert({
      id: uuid(), order_id: orderId, from_status: order.status, to_status: 'cancelled', actor_id: userId, note: reason,
    });

    await releaseReservations(trx, orderId);

    // Refund captured amounts to wallet (instant), incl. wallet portion.
    const captured = await trx('payments')
      .where({ order_id: orderId, status: 'captured' })
      .whereNot({ provider: 'cod' });
    const refundable = captured.reduce((sum, p) => sum + Number(p.amount_minor), 0);
    if (refundable > 0) {
      await walletService.credit(trx, userId, {
        amountMinor: refundable,
        source: 'refund',
        referenceType: 'order',
        referenceId: orderId,
        description: `Refund for cancelled order ${order.order_number}`,
      });
      for (const p of captured) {
        await trx('refunds').insert({
          id: uuid(),
          payment_id: p.id,
          amount_minor: p.amount_minor,
          destination: 'wallet',
          status: 'completed',
          initiated_by: userId,
          completed_at: trx.fn.now(),
        });
      }
    }

    return getDetail(userId, orderId, trx);
  }).then(async (detail) => { await catalogCache.evictOrder(orderId); return detail; });
};

module.exports = { listByUser, getDetail, cancel, CANCELLABLE };
