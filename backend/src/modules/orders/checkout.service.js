const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const cartService = require('../cart/cart.service');
const couponService = require('../coupons/coupon.service');
const walletService = require('../wallet/wallet.service');
const logger = require('../../utils/logger');
const catalogCache = require('../catalog/catalog.cache');
const notificationService = require('../notifications/notification.service');
const { emitToVendor } = require('../../sockets');

const COD_LIMIT_KEY = 'checkout.cod_limit_minor';

/**
 * Checkout pipeline (single transaction):
 *  1. Load + validate cart, address, coupon.
 *  2. Lock inventory rows (FOR UPDATE), reserve stock, write movement ledger.
 *  3. Snapshot items (price, tax, commission) into order_items.
 *  4. Split per-vendor order_shipments.
 *  5. Apply wallet, record coupon redemption, write status history.
 * COD/full-wallet orders confirm immediately; gateway orders await payment.
 *
 * `buyNow: { variantId, quantity }` checks out exactly that one item instead
 * of the persisted cart — it never reads or clears `cart_items`, so a
 * customer's unrelated cart contents are left untouched.
 */
const createOrderWithinTransaction = async (userId, {
  addressId, paymentMethod, useWalletMinor = 0, customerNote, idempotencyKey, buyNow,
}, db) => {
  // Idempotent replay returns the original order.
  if (idempotencyKey) {
    const existing = await db('orders').where({ idempotency_key: idempotencyKey, user_id: userId }).first();
    if (existing) return { order: existing, replayed: true };
  }

  const address = await db('addresses')
    .where({ id: addressId, user_id: userId })
    .whereNull('deleted_at')
    .first();
  if (!address) throw ApiError.businessRule('Delivery address not found');

  let cart;
  let allItems;
  let items;
  if (buyNow) {
    const singleItem = await cartService.loadSingleItem(buyNow.variantId, buyNow.quantity, db);
    cart = { coupon_id: null };
    allItems = [singleItem];
    items = [singleItem];
  } else {
    cart = await cartService.getOrCreateCart(userId, db);
    allItems = await cartService.loadItems(cart.id, db);
    items = allItems.filter((i) => !i.isSavedForLater);
  }
  if (!items.length) throw ApiError.businessRule(buyNow ? 'This item is no longer available' : 'Your cart is empty');

  const unavailable = items.filter((i) => !i.purchasable || i.availableStock < i.quantity);
  if (unavailable.length) {
    throw ApiError.businessRule(
      `Some items are unavailable: ${unavailable.map((i) => i.title).join(', ')}. Remove them to continue.`,
    );
  }

  if (paymentMethod === 'cod' && items.some((i) => !i.isCodAvailable)) {
    throw ApiError.businessRule('Some items in your cart are not eligible for Cash on Delivery');
  }

  if (cart.coupon_id) await db('coupons').where({ id: cart.coupon_id }).forUpdate().first();
  const totals = await cartService.computeTotals(cart, allItems, userId, db);
  if (totals.couponError) throw ApiError.businessRule(`Coupon issue: ${totals.couponError}`);

  if (paymentMethod === 'cod') {
    const codLimit = await db('settings').where({ key: COD_LIMIT_KEY }).first();
    if (codLimit && totals.totalMinor > Number(codLimit.value)) {
      throw ApiError.businessRule('Order value exceeds the Cash on Delivery limit');
    }
  }

  const walletToUse = Math.min(useWalletMinor, totals.totalMinor);
  const payableMinor = totals.totalMinor - walletToUse;
  const fullyPaidByWallet = payableMinor === 0 && walletToUse > 0;

  const orderId = uuid();
  const order = await db.transaction(async (trx) => {
    // ---- 2. reserve inventory (deterministic lock order avoids deadlocks)
    for (const item of [...items].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
      const stockRows = await trx('inventory_stocks')
        .where({ variant_id: item.variantId })
        .orderBy('warehouse_id')
        .forUpdate();

      let remaining = item.quantity;
      for (const row of stockRows) {
        if (remaining <= 0) break;
        const free = row.quantity - row.reserved;
        if (free <= 0) continue;
        const take = Math.min(free, remaining);
        await trx('inventory_stocks')
          .where({ variant_id: row.variant_id, warehouse_id: row.warehouse_id })
          .increment('reserved', take);
        await trx('inventory_movements').insert({
          id: uuid(),
          variant_id: row.variant_id,
          warehouse_id: row.warehouse_id,
          movement_type: 'reserve',
          quantity_delta: -take,
          reference_type: 'order',
          reference_id: orderId,
          actor_id: userId,
        });
        remaining -= take;
      }
      if (remaining > 0) throw ApiError.businessRule(`'${item.title}' just went out of stock`);
    }

    // ---- commission rates (vendor override > category default)
    const vendorIds = [...new Set(items.map((i) => i.vendorId))];
    const categoryIds = [...new Set(items.map((i) => i.categoryId))];
    const [vendors, categories] = await Promise.all([
      trx('vendors').whereIn('id', vendorIds).select('id', 'commission_rate_bp'),
      trx('categories').whereIn('id', categoryIds).select('id', 'commission_rate_bp'),
    ]);
    const vendorRate = new Map(vendors.map((v) => [v.id, v.commission_rate_bp]));
    const categoryRate = new Map(categories.map((c) => [c.id, c.commission_rate_bp]));

    // ---- 3. order header
    const status = paymentMethod === 'cod' || fullyPaidByWallet ? 'confirmed' : 'pending_payment';
    const [{ nextval: orderSeq }] = (await trx.raw("SELECT nextval('order_number_seq')")).rows.map((r) => r);
    const orderNumber = `SS${orderSeq}`;

    const [orderRow] = await trx('orders').insert({
      id: orderId,
      order_number: orderNumber,
      user_id: userId,
      status,
      subtotal_minor: totals.subtotalMinor,
      discount_minor: totals.discountMinor,
      coupon_id: cart.coupon_id || null,
      coupon_code: totals.coupon?.code || null,
      shipping_minor: totals.shippingMinor,
      tax_minor: totals.taxIncludedMinor,
      wallet_used_minor: walletToUse,
      total_minor: totals.totalMinor,
      payment_method: paymentMethod,
      shipping_address: JSON.stringify({
        recipientName: address.recipient_name,
        recipientPhone: address.recipient_phone,
        line1: address.line1,
        line2: address.line2,
        landmark: address.landmark,
        city: address.city,
        state: address.state,
        postalCode: address.postal_code,
        country: address.country,
        latitude: address.latitude,
        longitude: address.longitude,
      }),
      customer_note: customerNote || null,
      idempotency_key: idempotencyKey || null,
    }).returning('*');

    // ---- 4. per-vendor shipments + item snapshots
    // Fulfillment warehouse is the vendor's first active warehouse — a
    // simplification vs. tracking exactly which warehouse(s) served each
    // reservation; sufficient for routing pickup and return restock.
    const vendorWarehouses = await trx('warehouses')
      .whereIn('vendor_id', vendorIds)
      .where({ is_active: true })
      .orderBy('created_at')
      .select('id', 'vendor_id');
    const warehouseByVendor = new Map();
    for (const w of vendorWarehouses) if (!warehouseByVendor.has(w.vendor_id)) warehouseByVendor.set(w.vendor_id, w.id);

    const shipmentByVendor = new Map();
    for (const vendorId of vendorIds) {
      const [shipment] = await trx('order_shipments')
        .insert({ id: uuid(), order_id: orderId, vendor_id: vendorId, warehouse_id: warehouseByVendor.get(vendorId) || null })
        .returning('*');
      shipmentByVendor.set(vendorId, shipment.id);
    }

    await trx('order_items').insert(items.map((i) => {
      const rateBp = vendorRate.get(i.vendorId) ?? categoryRate.get(i.categoryId) ?? 1000;
      const lineTotal = i.unitPriceMinor * i.quantity;
      return {
        id: uuid(),
        order_id: orderId,
        shipment_id: shipmentByVendor.get(i.vendorId),
        product_id: i.productId,
        variant_id: i.variantId,
        vendor_id: i.vendorId,
        title: i.title,
        variant_label: i.options.map((o) => `${o.name}: ${o.value}`).join(', ') || null,
        sku: i.sku,
        image_url: i.image,
        unit_price_minor: i.unitPriceMinor,
        mrp_minor: i.mrpMinor,
        quantity: i.quantity,
        tax_rate_bp: i.taxRateBp,
        tax_minor: Math.round((lineTotal * i.taxRateBp) / (10000 + i.taxRateBp)),
        commission_rate_bp: rateBp,
        commission_minor: Math.floor((lineTotal * rateBp) / 10000),
        line_total_minor: lineTotal,
      };
    }));

    // ---- 5. wallet, coupon, history, payment row
    if (walletToUse > 0) {
      await walletService.debit(trx, userId, {
        amountMinor: walletToUse,
        source: 'order_payment',
        referenceType: 'order',
        referenceId: orderId,
        description: `Payment for order ${orderNumber}`,
      });
    }

    if (cart.coupon_id && totals.discountMinor > 0) {
      await couponService.recordRedemption(trx, {
        couponId: cart.coupon_id, userId, orderId, discountMinor: totals.discountMinor,
      });
    }

    await trx('order_status_history').insert({
      id: uuid(), order_id: orderId, from_status: null, to_status: status, actor_id: userId,
    });

    if (paymentMethod === 'cod' || fullyPaidByWallet) {
      await trx('payments').insert({
        id: uuid(),
        order_id: orderId,
        provider: fullyPaidByWallet ? 'wallet' : 'cod',
        amount_minor: fullyPaidByWallet ? walletToUse : payableMinor,
        status: fullyPaidByWallet ? 'captured' : 'pending',
        ...(fullyPaidByWallet ? { captured_at: trx.fn.now() } : {}),
      });
      await commitReservations(trx, orderId);
    }

    if (!buyNow) await cartService.clear(userId, trx);
    return orderRow;
  });

  return { order, payableMinor, replayed: false };
};

const createOrder = async (userId, input) => {
  // Serialize checkouts for one customer before reading the cart or replay key.
  // Concurrent retries see the committed original order, not an empty cart or
  // a unique-key failure. Other customers still check out independently.
  const result = await db.transaction(async (connection) => {
    await connection('users').where({ id: userId }).forUpdate().first();
    return createOrderWithinTransaction(userId, input, connection);
  });
  if (result.replayed) return result;
  const { order } = result;
  logger.info({ orderId: order.id, orderNumber: order.order_number, status: order.status }, 'Order created');
  await catalogCache.evictOrder(order.id); // product pages show fresh stock straight away

  if (order.status === 'confirmed') {
    notificationService.notify(userId, {
      title: 'Order confirmed',
      body: `Your order ${order.order_number} has been placed successfully.`,
      type: 'order_confirmed',
      data: { orderId: order.id },
    });
    notifyVendorsOfNewOrder(order.id);
  }

  return result;
};

/** Alerts each fulfilling vendor's dashboard (socket) and owner (push/in-app) of a newly confirmed order. */
const notifyVendorsOfNewOrder = async (orderId) => {
  const shipments = await db('order_shipments as os')
    .join('vendors as v', 'v.id', 'os.vendor_id')
    .where('os.order_id', orderId)
    .select('os.vendor_id', 'v.owner_user_id', 'v.store_name');

  shipments.forEach(({ vendor_id: vendorId, owner_user_id: ownerId, store_name: storeName }) => {
    emitToVendor(vendorId, 'vendor:new_order', { orderId });
    notificationService.notify(ownerId, {
      title: 'New order received',
      body: `You have a new order for "${storeName}". Check your dashboard for details.`,
      type: 'vendor_new_order',
      data: { orderId, vendorId },
    });
  });
};

/** Convert reservations to committed stock (on confirmation). */
const commitReservations = async (trx, orderId) => {
  const movements = await trx('inventory_movements')
    .where({ reference_type: 'order', reference_id: orderId, movement_type: 'reserve' });
  for (const m of movements) {
    const qty = -m.quantity_delta; // reserve rows are negative
    await trx('inventory_stocks')
      .where({ variant_id: m.variant_id, warehouse_id: m.warehouse_id })
      .decrement('quantity', qty)
      .decrement('reserved', qty);
    await trx('inventory_movements').insert({
      id: uuid(),
      variant_id: m.variant_id,
      warehouse_id: m.warehouse_id,
      movement_type: 'sale',
      quantity_delta: -qty,
      reference_type: 'order',
      reference_id: orderId,
    });
  }
  await trx('products')
    .whereIn('id', trx('order_items').where({ order_id: orderId }).select('product_id'))
    .increment('sold_count', 1);
};

/** Release reservations (payment failure / cancellation before shipping). */
const restoreStock = async (trx, orderId, variantId) => {
  // Serialize cancellation and per-shipment restocking for the same order.
  await trx('orders').where({ id: orderId }).forUpdate().first();
  // Restore the exact warehouse allocation. Committed stock must not decrement
  // reserved again: confirmation already converted that reservation to a sale.
  const movements = await trx('inventory_movements')
    .where({ reference_id: orderId })
    .whereIn('reference_type', ['order', 'order_cancel'])
    .modify(qb => { if (variantId) qb.where({ variant_id: variantId }); });
  const reserves = movements.filter(m => m.movement_type === 'reserve')
    .sort((a, b) => (a.variant_id + a.warehouse_id).localeCompare(b.variant_id + b.warehouse_id));
  for (const movement of reserves) {
    const sameStock = m => m.variant_id === movement.variant_id && m.warehouse_id === movement.warehouse_id;
    if (movements.some(m => sameStock(m) && (m.movement_type === 'release' || (m.movement_type === 'return' && m.reference_type === 'order_cancel')))) continue;
    const committed = movements.some(m => sameStock(m) && m.movement_type === 'sale');
    const quantity = -movement.quantity_delta;
    const where = { variant_id: movement.variant_id, warehouse_id: movement.warehouse_id };
    await trx('inventory_stocks').where(where).forUpdate().first();
    if (committed) await trx('inventory_stocks').where(where).increment('quantity', quantity);
    else await trx('inventory_stocks').where(where).decrement('reserved', quantity);
    await trx('inventory_movements').insert({
      id: uuid(), ...where, movement_type: committed ? 'return' : 'release',
      quantity_delta: quantity, reference_type: committed ? 'order_cancel' : 'order', reference_id: orderId,
    });
  }
};

const releaseReservations = (trx, orderId) => restoreStock(trx, orderId);
const releaseReservationForVariant = (trx, orderId, variantId) => restoreStock(trx, orderId, variantId);

module.exports = {
  createOrder, commitReservations, releaseReservations, releaseReservationForVariant, notifyVendorsOfNewOrder,
};
