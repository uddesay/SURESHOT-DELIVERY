const crypto = require('crypto');
const ApiError = require('../../../utils/ApiError');

const API = 'https://api.razorpay.com/v1';

const request = async (path, data) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw ApiError.businessRule('Razorpay is not configured');

  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new ApiError(502, body.error?.description || 'Razorpay request failed', 'PAYMENT_PROVIDER_ERROR');
  }
  return body;
};

/** Creates a Razorpay Order; client opens checkout with key_id + rp order id. */
const createIntent = async ({ amountMinor, currency, orderId, orderNumber }) => {
  const rpOrder = await request('/orders', {
    amount: amountMinor,
    currency,
    receipt: orderNumber,
    notes: { order_id: orderId },
  });
  return { intentId: rpOrder.id, keyId: process.env.RAZORPAY_KEY_ID };
};

/** HMAC-SHA256 of raw body with webhook secret. */
const verifyWebhook = (rawBody, signatureHeader) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return null;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const valid = signatureHeader.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  if (!valid) return null;

  return JSON.parse(rawBody.toString());
};

/** Signature check for client-side checkout callback (order_id|payment_id). */
const verifyCheckoutSignature = ({ rpOrderId, rpPaymentId, signature }) => {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
    .update(`${rpOrderId}|${rpPaymentId}`)
    .digest('hex');
  return signature.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
};

module.exports = { createIntent, verifyWebhook, verifyCheckoutSignature };
