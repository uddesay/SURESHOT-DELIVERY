const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');
const { releaseReservationForVariant } = require('../orders/checkout.service');
const shiprocket = require('./providers/shiprocket.provider');
const delhivery = require('./providers/delhivery.provider');
const bluedart = require('./providers/bluedart.provider');
const notificationService = require('../notifications/notification.service');

const PROVIDERS = { shiprocket, delhivery, bluedart };

const CUSTOMER_NOTIFICATIONS = {
  shipped: (orderNumber) => `Your order ${orderNumber} has been shipped!`,
  out_for_delivery: (orderNumber) => `Your order ${orderNumber} is out for delivery.`,
  delivered: (orderNumber) => `Your order ${orderNumber} has been delivered. Enjoy!`,
};

/** Overall order status is the weakest link across its non-cancelled shipments. */
const STAGE_ORDER = ['pending', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
const STAGE_TO_ORDER_STATUS = {
  pending: 'confirmed',
  processing: 'processing',
  packed: 'packed',
  shipped: 'shipped',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
};

const recomputeOrderStatus = async (trx, orderId, actorId = null, note = 'Fulfillment update') => {
  const order = await trx('orders').where({ id: orderId }).first();
  if (!order || ['cancelled', 'payment_failed', 'pending_payment', 'refunded'].includes(order.status)) return;

  const shipments = await trx('order_shipments').where({ order_id: orderId });
  const active = shipments.filter((s) => s.status !== 'cancelled');

  let nextStatus;
  if (!active.length) {
    nextStatus = 'cancelled';
  } else {
    const minStageIdx = Math.min(...active.map((s) => STAGE_ORDER.indexOf(s.status)));
    nextStatus = STAGE_TO_ORDER_STATUS[STAGE_ORDER[minStageIdx]];
  }

  if (nextStatus && nextStatus !== order.status) {
    await trx('orders').where({ id: orderId }).update({ status: nextStatus });
    await trx('order_status_history').insert({
      id: uuid(), order_id: orderId, from_status: order.status, to_status: nextStatus, actor_id: actorId, note,
    });

    // Cash on delivery is collected at the door, so delivery settles the pending COD payment.
    if (nextStatus === 'delivered') {
      await trx('payments')
        .where({ order_id: orderId, provider: 'cod', status: 'pending' })
        .update({ status: 'captured', captured_at: trx.fn.now() });
    }

    const messageFor = CUSTOMER_NOTIFICATIONS[nextStatus];
    if (messageFor) {
      notificationService.notify(order.user_id, {
        title: 'Order update',
        body: messageFor(order.order_number),
        type: `order_${nextStatus}`,
        data: { orderId: order.id },
      });
    }
  }
};

const getOwnedShipment = async (vendorId, shipmentId, trx = db) => {
  const shipment = await trx('order_shipments').where({ id: shipmentId, vendor_id: vendorId }).first();
  if (!shipment) throw ApiError.notFound('Shipment');
  return shipment;
};

const listVendorShipments = async (vendorId, { page = 1, limit = 20, status }) => {
  const base = db('order_shipments as s')
    .join('orders as o', 'o.id', 's.order_id')
    .where('s.vendor_id', vendorId)
    .modify((qb) => status && qb.where('s.status', status));
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone()
    .orderBy('s.created_at', 'desc')
    .offset((page - 1) * limit)
    .limit(limit)
    .leftJoin('delivery_partners as dp', 'dp.id', 's.delivery_partner_id')
    .select('s.*', 'o.order_number', 'o.payment_method', 'o.shipping_address', 'o.placed_at', 'o.total_minor',
      'dp.full_name as partner_name', 'dp.phone as partner_phone',
      db.raw('(SELECT COUNT(*)::int FROM order_items i WHERE i.shipment_id = s.id) AS item_count'),
      db.raw('(SELECT COALESCE(SUM(i.line_total_minor), 0)::bigint FROM order_items i WHERE i.shipment_id = s.id) AS shipment_value_minor'));
  return { total: Number(count), rows };
};

const getShipmentDetail = async (vendorId, shipmentId) => {
  const shipment = await getOwnedShipment(vendorId, shipmentId);
  const [order, items, events] = await Promise.all([
    db('orders').where({ id: shipment.order_id }).first(),
    db('order_items').where({ shipment_id: shipmentId }),
    db('shipment_tracking_events').where({ shipment_id: shipmentId }).orderBy('occurred_at', 'desc'),
  ]);
  return { ...shipment, order, items, trackingEvents: events };
};

/** Vendor marks a shipment as packed and ready for courier pickup. */
const markPacked = async (vendorId, shipmentId) => {
  return db.transaction(async (trx) => {
    const shipment = await getOwnedShipment(vendorId, shipmentId, trx);
    if (!['pending', 'processing'].includes(shipment.status)) {
      throw ApiError.businessRule(`Shipment cannot be packed from '${shipment.status}' state`);
    }
    await trx('order_shipments').where({ id: shipmentId }).update({ status: 'packed' });
    await recomputeOrderStatus(trx, shipment.order_id);
    return getShipmentDetail(vendorId, shipmentId);
  });
};

/** Vendor hands off to a courier: creates the shipment with the provider and stores the AWB. */
const ship = async (vendorId, shipmentId, { courier }) => {
  const provider = PROVIDERS[courier];
  if (!provider) throw ApiError.badRequest(`Unsupported courier: ${courier}`);

  const shipment = await getOwnedShipment(vendorId, shipmentId);
  if (shipment.status !== 'packed') throw ApiError.businessRule('Shipment must be packed before it can be shipped');

  const [order, items, warehouse] = await Promise.all([
    db('orders').where({ id: shipment.order_id }).first(),
    db('order_items').where({ shipment_id: shipmentId }),
    shipment.warehouse_id ? db('warehouses').where({ id: shipment.warehouse_id }).first() : null,
  ]);

  const result = await provider.createShipment({
    shipment,
    order: { ...order, shipping_address: order.shipping_address },
    items,
    pickupAddress: warehouse ? { label: warehouse.name } : null,
  });

  return db.transaction(async (trx) => {
    await trx('order_shipments').where({ id: shipmentId }).update({
      status: 'shipped',
      courier: result.courier,
      awb_number: result.awbNumber,
      tracking_url: result.trackingUrl,
      shipped_at: trx.fn.now(),
    });
    await trx('shipment_tracking_events').insert({
      id: uuid(), shipment_id: shipmentId, status: 'shipped', description: `Handed off to ${result.courier}`, occurred_at: trx.fn.now(),
    });
    await recomputeOrderStatus(trx, shipment.order_id);
    return getShipmentDetail(vendorId, shipmentId);
  });
};

/** Manual fallback for vendors without live courier tracking / COD handoffs. */
const updateManualStatus = async (vendorId, shipmentId, status) => {
  const allowed = ['out_for_delivery', 'delivered'];
  if (!allowed.includes(status)) throw ApiError.badRequest(`Status must be one of: ${allowed.join(', ')}`);

  return db.transaction(async (trx) => {
    const shipment = await getOwnedShipment(vendorId, shipmentId, trx);
    if (shipment.status === 'cancelled') throw ApiError.businessRule('Shipment is cancelled');
    const shipmentStageIdx = STAGE_ORDER.indexOf(shipment.status);
    if (STAGE_ORDER.indexOf(status) <= shipmentStageIdx) {
      throw ApiError.businessRule(`Shipment is already at or past '${status}'`);
    }

    await trx('order_shipments').where({ id: shipmentId }).update({
      status,
      ...(status === 'delivered' ? { delivered_at: trx.fn.now() } : {}),
    });
    await trx('shipment_tracking_events').insert({
      id: uuid(), shipment_id: shipmentId, status, occurred_at: trx.fn.now(),
    });
    await recomputeOrderStatus(trx, shipment.order_id);
    return getShipmentDetail(vendorId, shipmentId);
  });
};

/** Cancels a single vendor's shipment before it ships; releases only that vendor's reserved stock. */
const cancelShipment = async (vendorId, shipmentId, reason) => {
  return db.transaction(async (trx) => {
    const shipment = await getOwnedShipment(vendorId, shipmentId, trx);
    if (!['pending', 'processing', 'packed'].includes(shipment.status)) {
      throw ApiError.businessRule('Shipment can only be cancelled before it ships');
    }

    await trx('order_shipments').where({ id: shipmentId }).update({ status: 'cancelled' });
    await trx('shipment_tracking_events').insert({
      id: uuid(), shipment_id: shipmentId, status: 'cancelled', description: reason, occurred_at: trx.fn.now(),
    });

    const items = await trx('order_items').where({ shipment_id: shipmentId });
    for (const item of items) {
      await releaseReservationForVariant(trx, shipment.order_id, item.variant_id);
    }

    await recomputeOrderStatus(trx, shipment.order_id);
    return getShipmentDetail(vendorId, shipmentId);
  });
};

/**
 * Admin fulfillment actions applied to every eligible shipment of an order.
 * `ship` records a manual courier handoff (no provider API call), matching the
 * vendor manual-status fallback; live courier booking stays with the vendor.
 */
const ADMIN_FULFILLMENT = {
  process: { from: ['pending'], to: 'processing' },
  pack: { from: ['pending', 'processing'], to: 'packed' },
  ship: { from: ['packed'], to: 'shipped' },
  out_for_delivery: { from: ['shipped'], to: 'out_for_delivery' },
  deliver: { from: ['shipped', 'out_for_delivery'], to: 'delivered' },
};

const eligibleShipments = (shipments, action) => {
  const rule = ADMIN_FULFILLMENT[action];
  if (!rule) throw ApiError.badRequest(`Unsupported fulfillment action: ${action}`);
  return shipments.filter((s) => rule.from.includes(s.status));
};

const adminAdvanceOrder = async (adminId, orderId, { action, courier, awbNumber, trackingUrl }) => {
  return db.transaction(async (trx) => {
    const order = await trx('orders').where({ id: orderId }).forUpdate().first();
    if (!order) throw ApiError.notFound('Order');
    if (['cancelled', 'refunded', 'returned', 'payment_failed', 'pending_payment'].includes(order.status)) {
      throw ApiError.businessRule(`Order cannot be fulfilled in '${order.status}' state`);
    }
    const shipments = await trx('order_shipments').where({ order_id: orderId }).forUpdate();
    const targets = eligibleShipments(shipments, action);
    if (!targets.length) throw ApiError.businessRule(`No shipment on this order can move to '${ADMIN_FULFILLMENT[action].to}'`);

    const next = ADMIN_FULFILLMENT[action].to;
    for (const shipment of targets) {
      await trx('order_shipments').where({ id: shipment.id }).update({
        status: next,
        ...(next === 'shipped' ? {
          courier: courier || shipment.courier || 'manual',
          awb_number: awbNumber || shipment.awb_number || null,
          tracking_url: trackingUrl || shipment.tracking_url || null,
          shipped_at: trx.fn.now(),
        } : {}),
        ...(next === 'delivered' ? { delivered_at: trx.fn.now() } : {}),
      });
      await trx('shipment_tracking_events').insert({
        id: uuid(), shipment_id: shipment.id, status: next, description: 'Updated by platform admin', occurred_at: trx.fn.now(),
      });
    }
    await recomputeOrderStatus(trx, orderId, adminId, `Admin fulfillment: ${action.replace(/_/g, ' ')}`);
    return { updatedShipments: targets.length, status: next };
  });
};

/** Ingests a courier tracking event (webhook or reconciliation poll). Idempotent on (shipment, status, occurredAt). */
const ingestTrackingEvent = async (courier, awbNumber, event) => {
  const shipment = await db('order_shipments').where({ courier, awb_number: awbNumber }).first();
  if (!shipment) {
    logger.warn({ courier, awbNumber }, 'Tracking event for unknown shipment');
    return;
  }

  const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date();
  const dup = await db('shipment_tracking_events')
    .where({ shipment_id: shipment.id, status: event.status, occurred_at: occurredAt })
    .first();
  if (dup) return;

  await db.transaction(async (trx) => {
    await trx('shipment_tracking_events').insert({
      id: uuid(), shipment_id: shipment.id, status: event.status, location: event.location || null, occurred_at: occurredAt,
    });

    const normalized = normalizeCourierStatus(event.status);
    if (normalized && STAGE_ORDER.indexOf(normalized) > STAGE_ORDER.indexOf(shipment.status)) {
      await trx('order_shipments').where({ id: shipment.id }).update({
        status: normalized,
        ...(normalized === 'delivered' ? { delivered_at: occurredAt } : {}),
      });
      await recomputeOrderStatus(trx, shipment.order_id);
    }
  });
};

/** Maps free-text courier statuses to our shipment stage enum. */
const normalizeCourierStatus = (raw) => {
  const s = (raw || '').toLowerCase();
  if (s.includes('deliver') && !s.includes('out for')) return 'delivered';
  if (s.includes('out for delivery')) return 'out_for_delivery';
  if (s.includes('transit') || s.includes('shipped') || s.includes('dispatch')) return 'shipped';
  return null;
};

module.exports = {
  listVendorShipments,
  getShipmentDetail,
  markPacked,
  ship,
  updateManualStatus,
  cancelShipment,
  ingestTrackingEvent,
  recomputeOrderStatus,
  adminAdvanceOrder,
  eligibleShipments,
  ADMIN_FULFILLMENT,
  normalizeCourierStatus,
  STAGE_ORDER,
};
