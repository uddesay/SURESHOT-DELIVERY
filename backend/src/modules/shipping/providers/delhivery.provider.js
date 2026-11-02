const ApiError = require('../../../utils/ApiError');

const API = 'https://track.delhivery.com';

const request = async (path, method, body, isForm = false) => {
  const apiKey = process.env.DELHIVERY_API_KEY;
  if (!apiKey) throw ApiError.businessRule('Delhivery is not configured');

  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': isForm ? 'application/x-www-form-urlencoded' : 'application/json',
    },
    ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiError(502, data.rmk || 'Delhivery request failed', 'SHIPPING_PROVIDER_ERROR');
  }
  return data;
};

/** Generates a waybill and registers the shipment manifest. */
const createShipment = async ({ shipment, order, items, pickupAddress }) => {
  const waybillRes = await request(`/waybill/api/bulk/json/?count=1`, 'GET');
  const waybill = Array.isArray(waybillRes) ? waybillRes[0] : waybillRes;

  const payload = {
    shipments: [{
      waybill,
      order: `${order.order_number}-${shipment.id.slice(0, 8)}`,
      order_date: order.created_at,
      name: order.shipping_address.recipientName,
      add: order.shipping_address.line1,
      city: order.shipping_address.city,
      state: order.shipping_address.state,
      pin: order.shipping_address.postalCode,
      country: order.shipping_address.country || 'India',
      phone: order.shipping_address.recipientPhone,
      payment_mode: order.payment_method === 'cod' ? 'COD' : 'Prepaid',
      cod_amount: order.payment_method === 'cod' ? order.total_minor / 100 : 0,
      total_amount: order.total_minor / 100,
      products_desc: items.map((i) => i.title).join(', '),
      quantity: items.reduce((sum, i) => sum + i.quantity, 0),
    }],
    pickup_location: { name: pickupAddress?.label || 'Primary' },
  };

  await request('/api/cmu/create.json', 'POST', `format=json&data=${encodeURIComponent(JSON.stringify(payload))}`, true);

  return {
    courier: 'delhivery',
    awbNumber: waybill,
    trackingUrl: `https://www.delhivery.com/track/package/${waybill}`,
    providerShipmentId: waybill,
  };
};

const trackShipment = async (awbNumber) => {
  const body = await request(`/api/v1/packages/json/?waybill=${awbNumber}`, 'GET');
  const scans = body.ShipmentData?.[0]?.Shipment?.Scans || [];
  return scans.map((s) => ({
    status: s.ScanDetail?.Scan,
    location: s.ScanDetail?.ScannedLocation,
    occurredAt: s.ScanDetail?.ScanDateTime,
  }));
};

const cancelShipment = async (awbNumber) => {
  await request('/api/p/edit', 'POST', `waybill=${awbNumber}&cancellation=true`, true);
};

module.exports = { createShipment, trackShipment, cancelShipment };
