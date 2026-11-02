const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');
const stripe = require('./providers/stripe.provider');
const razorpay = require('./providers/razorpay.provider');
const { commitReservations, releaseReservations, notifyVendorsOfNewOrder } = require('../orders/checkout.service');
const notificationService = require('../notifications/notification.service');

const PROVIDERS = { stripe, razorpay };

/** Creates a provider intent for a pending_payment order. */
const createIntent = async (userId, orderId) => {
  const order = await db('orders').where({ id: orderId, user_id: userId }).first();
  if (!order) throw ApiError.notFound('Order');
  if (order.status !== 'pending_payment') {
    throw ApiError.businessRule(`Order is not awaiting payment (status: ${order.status})`);
  }

  const provider = PROVIDERS[order.payment_method];
  if (!provider) throw ApiError.businessRule('Order does not use an online payment method');

  const payableMinor = Number(order.total_minor) - Number(order.wallet_used_minor);
  const intent = await provider.createIntent({
    amountMinor: payableMinor,
    currency: order.currency,
    orderId: order.id,
    orderNumber: order.order_number,
  });

  const [payment] = await db('payments')
    .insert({
      id: uuid(),
      order_id: order.id,
      provider: order.payment_method,
      provider_intent_id: intent.intentId,
      amount_minor: payableMinor,
      currency: order.currency,
      status: 'created',
    })
    .returning('*');

  return {
    paymentId: payment.id,
    provider: order.payment_method,
    amountMinor: payableMinor,
    currency: order.currency,
    ...intent,
  };
};

/** Idempotent transition to CONFIRMED once the provider reports capture. */
const markPaymentCaptured = async ({ provider, intentId, providerPaymentId, methodDetail }) => {
  await db.transaction(async (trx) => {
    const payment = await trx('payments')
      .where({ provider, provider_intent_id: intentId })
      .forUpdate()
      .first();
    if (!payment) {
      logger.warn({ provider, intentId }, 'Webhook for unknown payment intent');
      return;
    }
    if (payment.status === 'captured') return; // idempotent replay

    await trx('payments').where({ id: payment.id }).update({
      status: 'captured',
      provider_payment_id: providerPaymentId || null,
      method_detail: methodDetail ? JSON.stringify(methodDetail) : null,
      captured_at: trx.fn.now(),
    });

    const order = await trx('orders').where({ id: payment.order_id }).forUpdate().first();
    if (order.status === 'pending_payment') {
      await trx('orders').where({ id: order.id }).update({ status: 'confirmed' });
      await trx('order_status_history').insert({
        id: uuid(), order_id: order.id, from_status: 'pending_payment', to_status: 'confirmed', note: `${provider} payment captured`,
      });
      await commitReservations(trx, order.id);
      notificationService.notify(order.user_id, {
        title: 'Payment received',
        body: `Payment for order ${order.order_number} was successful. Your order is confirmed.`,
        type: 'order_confirmed',
        data: { orderId: order.id },
      });
      notifyVendorsOfNewOrder(order.id);
    }
  });
};

const markPaymentFailed = async ({ provider, intentId, reason }) => {
  await db.transaction(async (trx) => {
    const payment = await trx('payments')
      .where({ provider, provider_intent_id: intentId })
      .forUpdate()
      .first();
    if (!payment || ['captured', 'failed'].includes(payment.status)) return;

    await trx('payments').where({ id: payment.id }).update({ status: 'failed', failure_reason: reason || null });

    const order = await trx('orders').where({ id: payment.order_id }).forUpdate().first();
    if (order.status === 'pending_payment') {
      await trx('orders').where({ id: order.id }).update({ status: 'payment_failed' });
      await trx('order_status_history').insert({
        id: uuid(), order_id: order.id, from_status: 'pending_payment', to_status: 'payment_failed', note: reason,
      });
      await releaseReservations(trx, order.id);
      // Wallet portion (if any) back to the customer
      if (Number(order.wallet_used_minor) > 0) {
        const walletService = require('../wallet/wallet.service');
        await walletService.credit(trx, order.user_id, {
          amountMinor: Number(order.wallet_used_minor),
          source: 'refund',
          referenceType: 'order',
          referenceId: order.id,
          description: `Wallet refund — payment failed for ${order.order_number}`,
        });
      }
    }
  });
};

/** Persist + dispatch a webhook event exactly once. */
const processWebhookEvent = async (provider, eventId, eventType, payload, handler) => {
  const inserted = await db('payment_webhook_events')
    .insert({ id: uuid(), provider, event_id: eventId, event_type: eventType, payload: JSON.stringify(payload) })
    .onConflict(['provider', 'event_id'])
    .ignore()
    .returning('id');
  if (!inserted.length) {
    logger.info({ provider, eventId }, 'Duplicate webhook ignored');
    return;
  }

  try {
    await handler();
    await db('payment_webhook_events')
      .where({ provider, event_id: eventId })
      .update({ processed_at: db.fn.now() });
  } catch (err) {
    await db('payment_webhook_events')
      .where({ provider, event_id: eventId })
      .update({ error: err.message });
    throw err;
  }
};

const handleStripeWebhook = async (event) => {
  const object = event.data?.object || {};
  switch (event.type) {
    case 'payment_intent.succeeded':
      await processWebhookEvent('stripe', event.id, event.type, event, () =>
        markPaymentCaptured({
          provider: 'stripe',
          intentId: object.id,
          providerPaymentId: object.latest_charge,
          methodDetail: { types: object.payment_method_types },
        }));
      break;
    case 'payment_intent.payment_failed':
      await processWebhookEvent('stripe', event.id, event.type, event, () =>
        markPaymentFailed({
          provider: 'stripe',
          intentId: object.id,
          reason: object.last_payment_error?.message,
        }));
      break;
    default:
      logger.debug({ type: event.type }, 'Unhandled Stripe event');
  }
};

const handleRazorpayWebhook = async (event) => {
  const payment = event.payload?.payment?.entity || {};
  const eventId = event.event_id || `${event.event}:${payment.id}`;
  switch (event.event) {
    case 'payment.captured':
      await processWebhookEvent('razorpay', eventId, event.event, event, () =>
        markPaymentCaptured({
          provider: 'razorpay',
          intentId: payment.order_id,
          providerPaymentId: payment.id,
          methodDetail: { method: payment.method, vpa: payment.vpa, last4: payment.card?.last4 },
        }));
      break;
    case 'payment.failed':
      await processWebhookEvent('razorpay', eventId, event.event, event, () =>
        markPaymentFailed({
          provider: 'razorpay',
          intentId: payment.order_id,
          reason: payment.error_description,
        }));
      break;
    default:
      logger.debug({ type: event.event }, 'Unhandled Razorpay event');
  }
};

/** Client-side Razorpay success callback (server re-verifies signature). */
const confirmRazorpayCheckout = async (userId, { rpOrderId, rpPaymentId, signature }) => {
  if (!razorpay.verifyCheckoutSignature({ rpOrderId, rpPaymentId, signature })) {
    throw ApiError.unauthorized('Invalid payment signature');
  }
  await markPaymentCaptured({ provider: 'razorpay', intentId: rpOrderId, providerPaymentId: rpPaymentId });
  const payment = await db('payments').where({ provider: 'razorpay', provider_intent_id: rpOrderId }).first();
  return db('orders').where({ id: payment.order_id, user_id: userId }).first();
};

module.exports = {
  createIntent,
  markPaymentCaptured,
  markPaymentFailed,
  handleStripeWebhook,
  handleRazorpayWebhook,
  confirmRazorpayCheckout,
};
