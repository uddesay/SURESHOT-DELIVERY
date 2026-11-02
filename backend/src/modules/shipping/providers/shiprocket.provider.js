const ApiError = require('../../../utils/ApiError');

const API = 'https://apiv2.shiprocket.in/v1/external';

let cachedToken = null;
let cachedTokenExpiry = 0;

/** Shiprocket tokens are valid ~10 days; cache in-process with an 8h safety margin. */
const getToken = async () => {
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;

  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;
  if (!email || !password) throw ApiError.businessRule('Shiprocket is not configured');

  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok || !body.token) {
    throw new ApiError(502, body.message || 'Shiprocket authentication failed', 'SHIPPING_PROVIDER_ERROR');
  }
  cachedToken = body.token;
  cachedTokenExpiry = Date.now() + 8 * 60 * 60 * 1000;
  return cachedToken;
};

const request = async (path, method, data) => {
  const token = await getToken();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new ApiError(502, body.message || 'Shiprocket request failed', 'SHIPPING_PROVIDER_ERROR');
  }
  return body;
};

/**
 * Creates an adhoc order + generates AWB in one flow (simplified for a
 * single default courier; production would call courier/serviceability
 * first and let the vendor pick from returned options).
 */
const createShipment = async ({ shipment, order, items, pickupAddress }) => {
  const created = await request('/orders/create/adhoc', 'POST', {
    order_id: `${order.order_number}-${shipment.id.slice(0, 8)}`,
    order_date: new Date(order.created_at).toISOString().slice(0, 19).replace('T', ' '),
    pickup_location: pickupAddress?.label || 'Primary',
    billing_customer_name: order.shipping_address.recipientName,
    billing_address: order.shipping_address.line1,
    billing_city: order.shipping_address.city,
    billing_state: order.shipping_address.state,
    billing_pincode: order.shipping_address.postalCode,
    billing_country: order.shipping_address.country || 'India',
    billing_phone: order.shipping_address.recipientPhone,
    shipping_is_billing: true,
    order_items: items.map((i) => ({
      name: i.title,
      sku: i.sku,
      units: i.quantity,
      selling_price: i.unit_price_minor / 100,
    })),
    payment_method: order.payment_method === 'cod' ? 'COD' : 'Prepaid',
    sub_total: order.total_minor / 100,
    length: 10, breadth: 10, height: 10, weight: 0.5,
  });

  const awb = await request('/courier/assign/awb', 'POST', { shipment_id: created.shipment_id });

  return {
    courier: 'shiprocket',
    awbNumber: awb.response?.data?.awb_code || null,
    trackingUrl: awb.response?.data?.awb_code
      ? `https://shiprocket.co/tracking/${awb.response.data.awb_code}`
      : null,
    providerShipmentId: String(created.shipment_id),
  };
};

const trackShipment = async (awbNumber) => {
  const body = await request(`/courier/track/awb/${awbNumber}`, 'GET');
  const events = body.tracking_data?.shipment_track_activities || [];
  return events.map((e) => ({
    status: e.status,
    location: e.location,
    occurredAt: e.date,
  }));
};

const cancelShipment = async (providerShipmentId) => {
  await request('/orders/cancel', 'POST', { ids: [providerShipmentId] });
};

module.exports = { createShipment, trackShipment, cancelShipment };
