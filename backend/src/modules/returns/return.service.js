const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const walletService = require('../wallet/wallet.service');
const notificationService = require('../notifications/notification.service');

/**
 * Return/exchange lifecycle:
 *   requested -> approved -> pickup_scheduled -> picked -> received
 *     -> refund_initiated -> refunded -> closed   (returns)
 *     -> received -> exchanged -> closed          (exchanges)
 *   requested -> rejected                          (either path)
 * Reverse logistics (courier pickup) is manual/vendor-arranged in this
 * version — statuses are updated by the vendor/admin, not a courier API.
 */

const ACTIVE_STATUSES = ['requested', 'approved', 'pickup_scheduled', 'picked', 'received', 'refund_initiated'];

const getOrderItemForReturn = async (userId, orderItemId) => {
  const item = await db('order_items as oi')
    .join('orders as o', 'o.id', 'oi.order_id')
    .join('order_shipments as s', 's.id', 'oi.shipment_id')
    .where('oi.id', orderItemId)
    .where('o.user_id', userId)
    .select('oi.*', 'o.user_id', 'o.order_number', 's.status as shipment_status', 's.delivered_at')
    .first();
  if (!item) throw ApiError.notFound('Order item');
  return item;
};

const create = async (userId, { orderItemId, requestType, reason, description, mediaUrls, quantity }) => {
  const item = await getOrderItemForReturn(userId, orderItemId);

  if (item.shipment_status !== 'delivered' || !item.delivered_at) {
    throw ApiError.businessRule('Item must be delivered before a return can be requested');
  }

  const product = await db('products').where({ id: item.product_id }).first();
  if (!product?.is_returnable) throw ApiError.businessRule('This product is not eligible for return');

  const windowEnd = new Date(item.delivered_at);
  windowEnd.setDate(windowEnd.getDate() + product.return_window_days);
  if (new Date() > windowEnd) throw ApiError.businessRule('Return window has expired for this item');

  const existing = await db('return_requests')
    .where({ order_item_id: orderItemId })
    .whereIn('status', ACTIVE_STATUSES)
    .sum({ quantity: 'quantity' })
    .first();
  const alreadyRequested = Number(existing?.quantity || 0);
  if (alreadyRequested + quantity > item.quantity) {
    throw ApiError.businessRule(`Only ${item.quantity - alreadyRequested} unit(s) remain eligible for return`);
  }

  const [row] = await db('return_requests')
    .insert({
      id: uuid(),
      order_id: item.order_id,
      order_item_id: orderItemId,
      user_id: userId,
      request_type: requestType,
      reason,
      description: description || null,
      media_urls: JSON.stringify(mediaUrls || []),
      quantity,
    })
    .returning('*');
  return row;
};

const listByUser = async (userId, { page = 1, limit = 20 }) => {
  const base = db('return_requests').where({ user_id: userId });
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone().orderBy('created_at', 'desc').offset((page - 1) * limit).limit(limit);
  return { total: Number(count), rows };
};

const listForVendor = async (vendorId, { page = 1, limit = 20, status }) => {
  const base = db('return_requests as r')
    .join('order_items as oi', 'oi.id', 'r.order_item_id')
    .where('oi.vendor_id', vendorId)
    .modify((qb) => status && qb.where('r.status', status));
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone()
    .orderBy('r.created_at', 'desc')
    .offset((page - 1) * limit)
    .limit(limit)
    .select('r.*', 'oi.title', 'oi.sku', 'oi.unit_price_minor');
  return { total: Number(count), rows };
};

const listAll = async ({ page = 1, limit = 20, status, vendorId }) => {
  const base = db('return_requests as r')
    .join('order_items as oi', 'oi.id', 'r.order_item_id')
    .join('vendors as v', 'v.id', 'oi.vendor_id')
    .modify((qb) => {
      if (status) qb.where('r.status', status);
      if (vendorId) qb.where('oi.vendor_id', vendorId);
    });
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone()
    .orderBy('r.created_at', 'desc')
    .offset((page - 1) * limit)
    .limit(limit)
    .leftJoin('orders as o', 'o.id', 'r.order_id')
    .leftJoin('users as u', 'u.id', 'r.user_id')
    .select('r.*', 'oi.title', 'oi.sku', 'oi.unit_price_minor', 'oi.image_url', 'v.store_name as vendor_name',
      'o.order_number', 'u.full_name as customer_name');
  return { total: Number(count), rows: rows.map((r) => ({ ...r, unit_price_minor: Number(r.unit_price_minor) })) };
};

const getDetail = async (returnId) => {
  const row = await db('return_requests as r')
    .join('order_items as oi', 'oi.id', 'r.order_item_id')
    .where('r.id', returnId)
    .select('r.*', 'oi.title', 'oi.sku', 'oi.unit_price_minor', 'oi.quantity as ordered_quantity', 'oi.vendor_id', 'oi.variant_id', 'oi.shipment_id')
    .first();
  if (!row) throw ApiError.notFound('Return request');
  return row;
};

const assertOwnedByVendor = async (vendorId, returnId) => {
  const row = await getDetail(returnId);
  if (row.vendor_id !== vendorId) throw ApiError.notFound('Return request');
  return row;
};

const approve = async (actorId, returnId, isVendor, vendorId) => {
  const row = isVendor ? await assertOwnedByVendor(vendorId, returnId) : await getDetail(returnId);
  if (row.status !== 'requested') throw ApiError.businessRule(`Cannot approve from '${row.status}' state`);
  const [updated] = await db('return_requests').where({ id: returnId })
    .update({ status: 'approved', resolved_by: actorId })
    .returning('*');
  notificationService.notify(row.user_id, {
    title: 'Return approved',
    body: `Your ${row.request_type} request for "${row.title}" has been approved.`,
    type: 'return_approved',
    data: { returnId },
  });
  return updated;
};

const reject = async (actorId, returnId, reason, isVendor, vendorId) => {
  const row = isVendor ? await assertOwnedByVendor(vendorId, returnId) : await getDetail(returnId);
  if (row.status !== 'requested') throw ApiError.businessRule(`Cannot reject from '${row.status}' state`);
  const [updated] = await db('return_requests').where({ id: returnId })
    .update({ status: 'rejected', resolved_by: actorId, description: reason })
    .returning('*');
  notificationService.notify(row.user_id, {
    title: 'Return rejected',
    body: `Your ${row.request_type} request for "${row.title}" was rejected: ${reason}`,
    type: 'return_rejected',
    data: { returnId },
  });
  return updated;
};

const TRANSITIONS = {
  approved: 'pickup_scheduled',
  pickup_scheduled: 'picked',
  picked: 'received',
};

/** Advances a return through the manual reverse-logistics stages. */
const advance = async (actorId, returnId, isVendor, vendorId) => {
  const row = isVendor ? await assertOwnedByVendor(vendorId, returnId) : await getDetail(returnId);
  const next = TRANSITIONS[row.status];
  if (!next) throw ApiError.businessRule(`Cannot advance from '${row.status}' state`);

  if (next === 'received') return receiveAndSettle(actorId, row);

  const [updated] = await db('return_requests').where({ id: returnId }).update({ status: next }).returning('*');
  return updated;
};

/** On receipt: restock inventory and settle (refund for returns, mark exchanged for exchanges). */
const receiveAndSettle = async (actorId, row) => {
  return db.transaction(async (trx) => {
    await trx('return_requests').where({ id: row.id }).update({ status: 'received' });

    // Restock to the fulfilling warehouse.
    const shipment = await trx('order_shipments').where({ id: row.shipment_id }).first();
    if (shipment?.warehouse_id) {
      await trx('inventory_stocks')
        .insert({ variant_id: row.variant_id, warehouse_id: shipment.warehouse_id, quantity: row.quantity })
        .onConflict(['variant_id', 'warehouse_id'])
        .merge({ quantity: trx.raw('inventory_stocks.quantity + ?', [row.quantity]) });
      await trx('inventory_movements').insert({
        id: uuid(),
        variant_id: row.variant_id,
        warehouse_id: shipment.warehouse_id,
        movement_type: 'return',
        quantity_delta: row.quantity,
        reference_type: 'return_request',
        reference_id: row.id,
        actor_id: actorId,
      });
    }

    if (row.request_type === 'exchange') {
      const [updated] = await trx('return_requests').where({ id: row.id }).update({ status: 'exchanged' }).returning('*');
      return updated;
    }

    // Return: refund the prorated line amount to the customer's wallet.
    const refundAmount = row.unit_price_minor * row.quantity;
    const payment = await trx('payments')
      .where({ order_id: row.order_id, status: 'captured' })
      .whereNot({ provider: 'cod' })
      .first();

    await trx('return_requests').where({ id: row.id }).update({ status: 'refund_initiated', refund_amount_minor: refundAmount });

    await walletService.credit(trx, row.user_id, {
      amountMinor: refundAmount,
      source: 'refund',
      referenceType: 'return_request',
      referenceId: row.id,
      description: `Refund for returned item — order ${row.order_id}`,
    });

    if (payment) {
      await trx('refunds').insert({
        id: uuid(),
        payment_id: payment.id,
        return_request_id: row.id,
        amount_minor: refundAmount,
        destination: 'wallet',
        status: 'completed',
        initiated_by: actorId,
        completed_at: trx.fn.now(),
      });
    }

    const [updated] = await trx('return_requests').where({ id: row.id }).update({ status: 'refunded' }).returning('*');
    await maybeMarkOrderRefunded(trx, row.order_id);

    notificationService.notify(row.user_id, {
      title: 'Refund completed',
      body: `₹${(refundAmount / 100).toFixed(2)} has been credited to your wallet for "${row.title}".`,
      type: 'return_refunded',
      data: { returnId: row.id, amountMinor: refundAmount },
    });

    return updated;
  });
};

/** If every unit across all order items has been refunded, mark the whole order refunded. */
const maybeMarkOrderRefunded = async (trx, orderId) => {
  const [{ total: orderedTotal }] = await trx('order_items').where({ order_id: orderId }).sum({ total: 'quantity' });
  const [{ total: refundedTotal }] = await trx('return_requests')
    .where({ order_id: orderId, status: 'refunded' })
    .sum({ total: 'quantity' });

  if (Number(refundedTotal || 0) >= Number(orderedTotal || 0)) {
    const order = await trx('orders').where({ id: orderId }).first();
    if (order.status !== 'refunded') {
      await trx('orders').where({ id: orderId }).update({ status: 'refunded' });
      await trx('order_status_history').insert({
        id: uuid(), order_id: orderId, from_status: order.status, to_status: 'refunded', note: 'All items refunded',
      });
    }
  }
};

const close = async (actorId, returnId, isVendor, vendorId) => {
  const row = isVendor ? await assertOwnedByVendor(vendorId, returnId) : await getDetail(returnId);
  if (!['refunded', 'exchanged', 'rejected'].includes(row.status)) {
    throw ApiError.businessRule(`Cannot close a return in '${row.status}' state`);
  }
  const [updated] = await db('return_requests').where({ id: returnId }).update({ status: 'closed' }).returning('*');
  return updated;
};

module.exports = { create, listByUser, listForVendor, listAll, getDetail, approve, reject, advance, close };
