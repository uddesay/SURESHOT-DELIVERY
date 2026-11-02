const ApiError = require('../../../utils/ApiError');

const API = 'https://apigateway.bluedart.com/in/transportation/waybill/v1';

const request = async (path, body, jwtToken) => {
  const apiKey = process.env.BLUEDART_API_KEY;
  const licenseKey = process.env.BLUEDART_LICENSE_KEY;
  if (!apiKey || !licenseKey) throw ApiError.businessRule('BlueDart is not configured');

  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'JWTToken': jwtToken || apiKey,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(502, data.Status?.[0]?.StatusInformation || 'BlueDart request failed', 'SHIPPING_PROVIDER_ERROR');
  }
  return data;
};

/** Generates a BlueDart waybill (GenerateWayBill API). */
// BlueDart's GenerateWayBill payload is header-level only — unlike Shiprocket
// and Delhivery it carries no per-line-item breakdown, so `items` is not
// destructured here even though callers pass it for provider parity.
const createShipment = async ({ shipment, order }) => {
  const body = await request('/GenerateWayBill', {
    Request: {
      Consignee: {
        ConsigneeName: order.shipping_address.recipientName,
        ConsigneeAddress1: order.shipping_address.line1,
        ConsigneeCity: order.shipping_address.city,
        ConsigneePincode: order.shipping_address.postalCode,
        ConsigneeMobile: order.shipping_address.recipientPhone,
      },
      Services: {
        ProductCode: order.payment_method === 'cod' ? 'C' : 'A',
        SubProductCode: 'P',
        PieceCount: '1',
        ActualWeight: '0.5',
        DeclaredValue: String(order.total_minor / 100),
        CollectableAmount: order.payment_method === 'cod' ? String(order.total_minor / 100) : '0',
        CreditReferenceNo: `${order.order_number}-${shipment.id.slice(0, 8)}`,
      },
    },
  });

  const awb = body.GenerateWayBillResult?.AWBNo;
  return {
    courier: 'bluedart',
    awbNumber: awb || null,
    trackingUrl: awb ? `https://www.bluedart.com/tracking/${awb}` : null,
    providerShipmentId: awb,
  };
};

const trackShipment = async (awbNumber) => {
  const body = await request('/Tracking', { Request: { AWBNo: [awbNumber] } });
  const scans = body.Shipment?.[0]?.Scans || [];
  return scans.map((s) => ({ status: s.Scan, location: s.ScannedLocation, occurredAt: s.ScanDate }));
};

const cancelShipment = async (awbNumber) => {
  await request('/CancelWayBill', { Request: { AWBNo: awbNumber } });
};

module.exports = { createShipment, trackShipment, cancelShipment };
