const crypto = require('crypto');

describe('razorpay provider signature verification', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, RAZORPAY_KEY_SECRET: 'test_key_secret', RAZORPAY_WEBHOOK_SECRET: 'test_webhook_secret' };
  });
  afterAll(() => { process.env = OLD_ENV; });

  test('verifyCheckoutSignature accepts a correctly signed payload', () => {
    const razorpay = require('../../src/modules/payments/providers/razorpay.provider');
    const rpOrderId = 'order_ABC123';
    const rpPaymentId = 'pay_XYZ789';
    const signature = crypto
      .createHmac('sha256', 'test_key_secret')
      .update(`${rpOrderId}|${rpPaymentId}`)
      .digest('hex');

    expect(razorpay.verifyCheckoutSignature({ rpOrderId, rpPaymentId, signature })).toBe(true);
  });

  test('verifyCheckoutSignature rejects a tampered signature', () => {
    const razorpay = require('../../src/modules/payments/providers/razorpay.provider');
    expect(razorpay.verifyCheckoutSignature({
      rpOrderId: 'order_ABC123',
      rpPaymentId: 'pay_XYZ789',
      signature: 'deadbeef'.repeat(8),
    })).toBe(false);
  });

  test('verifyWebhook accepts a correctly signed raw body', () => {
    const razorpay = require('../../src/modules/payments/providers/razorpay.provider');
    const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
    const signature = crypto.createHmac('sha256', 'test_webhook_secret').update(rawBody).digest('hex');

    const event = razorpay.verifyWebhook(rawBody, signature);
    expect(event).toEqual({ event: 'payment.captured' });
  });

  test('verifyWebhook rejects an invalid signature', () => {
    const razorpay = require('../../src/modules/payments/providers/razorpay.provider');
    const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
    expect(razorpay.verifyWebhook(rawBody, 'wrong-signature-wrong-signature-000000')).toBeNull();
  });

  test('verifyWebhook returns null when secret is missing', () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = '';
    jest.resetModules();
    const razorpay = require('../../src/modules/payments/providers/razorpay.provider');
    expect(razorpay.verifyWebhook(Buffer.from('{}'), 'anything')).toBeNull();
  });
});

describe('stripe provider signature verification', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, STRIPE_WEBHOOK_SECRET: 'whsec_test' };
  });
  afterAll(() => { process.env = OLD_ENV; });

  const sign = (rawBody, secret, timestamp) => {
    const payload = `${timestamp}.${rawBody}`;
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  };

  test('accepts a freshly signed event', () => {
    const stripe = require('../../src/modules/payments/providers/stripe.provider');
    const rawBody = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = sign(rawBody, 'whsec_test', timestamp);
    const header = `t=${timestamp},v1=${sig}`;

    const event = stripe.verifyWebhook(Buffer.from(rawBody), header);
    expect(event).toEqual({ id: 'evt_1', type: 'payment_intent.succeeded' });
  });

  test('rejects a stale timestamp (replay protection)', () => {
    const stripe = require('../../src/modules/payments/providers/stripe.provider');
    const rawBody = JSON.stringify({ id: 'evt_1' });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const sig = sign(rawBody, 'whsec_test', staleTimestamp);
    const header = `t=${staleTimestamp},v1=${sig}`;

    expect(stripe.verifyWebhook(Buffer.from(rawBody), header)).toBeNull();
  });

  test('rejects a tampered signature', () => {
    const stripe = require('../../src/modules/payments/providers/stripe.provider');
    const rawBody = JSON.stringify({ id: 'evt_1' });
    const timestamp = Math.floor(Date.now() / 1000);
    const header = `t=${timestamp},v1=${'0'.repeat(64)}`;

    expect(stripe.verifyWebhook(Buffer.from(rawBody), header)).toBeNull();
  });

  test('returns null for a malformed header', () => {
    const stripe = require('../../src/modules/payments/providers/stripe.provider');
    expect(stripe.verifyWebhook(Buffer.from('{}'), 'not-a-valid-header')).toBeNull();
  });
});
