const crypto = require('crypto');
const ApiError = require('../../../utils/ApiError');

const API = 'https://api.stripe.com/v1';

const form = (data) => new URLSearchParams(data).toString();

const request = async (path, data) => {
  if (!process.env.STRIPE_SECRET_KEY) throw ApiError.businessRule('Stripe is not configured');
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form(data),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new ApiError(502, body.error?.message || 'Stripe request failed', 'PAYMENT_PROVIDER_ERROR');
  }
  return body;
};

/** Creates a PaymentIntent; client confirms with the publishable key + client_secret. */
const createIntent = async ({ amountMinor, currency, orderId, orderNumber }) => {
  const intent = await request('/payment_intents', {
    amount: amountMinor,
    currency: currency.toLowerCase(),
    'metadata[order_id]': orderId,
    'metadata[order_number]': orderNumber,
    'automatic_payment_methods[enabled]': 'true',
  });
  return { intentId: intent.id, clientSecret: intent.client_secret };
};

/**
 * Verifies Stripe webhook signature (v1 scheme) against the raw body.
 * https://docs.stripe.com/webhooks/signatures
 */
const verifyWebhook = (rawBody, signatureHeader) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return null;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((kv) => kv.split('=')),
  );
  const { t: timestamp, v1: signature } = parts;
  if (!timestamp || !signature) return null;

  // Reject stale events (>5 min) to limit replay window
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return null;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const valid = signature.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) return null;

  return JSON.parse(rawBody.toString());
};

module.exports = { createIntent, verifyWebhook };
