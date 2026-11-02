import { apiGet, apiGetPage, apiPost } from '../lib/apiClient';

export interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  total_minor: number;
  payment_method: string;
  payment_status: string | null;
  created_at: string;
  user_id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  item_count: number;
  vendor_names: string | null;
}

export interface Address {
  recipientName?: string; recipient_name?: string; recipientPhone?: string; recipient_phone?: string;
  line1?: string; line2?: string | null; landmark?: string | null; city?: string; state?: string;
  postalCode?: string; postal_code?: string; country?: string;
}

export interface OrderItem {
  id: string; title: string; variant_label: string | null; sku: string; image_url: string | null; vendor_id: string; vendor_name: string | null;
  unit_price_minor: number; mrp_minor: number; quantity: number; tax_minor: number; commission_minor: number; line_total_minor: number; shipment_id: string | null;
}

export interface Shipment {
  id: string; vendor_id: string; vendor_name: string | null; status: string; courier: string | null; awb_number: string | null;
  tracking_url: string | null; shipped_at: string | null; delivered_at: string | null; created_at: string;
}

export interface OrderDetail {
  id: string; order_number: string; status: string; user_id: string; payment_method: string; currency: string;
  subtotal_minor: number; discount_minor: number; shipping_minor: number; tax_minor: number; total_minor: number; wallet_used_minor: number | string;
  coupon_code: string | null; customer_note: string | null; cancelled_reason: string | null;
  shipping_address: Address; billing_address: Address | null; placed_at: string; created_at: string; updated_at: string;
  customer: { id: string; full_name: string | null; email: string | null; phone: string | null } | null;
  items: OrderItem[];
  shipments: Shipment[];
  statusHistory: { id: string; from_status: string | null; to_status: string; note: string | null; actor_name: string | null; created_at: string }[];
  payments: { id: string; provider: string; status: string; amount_minor: number; provider_payment_id: string | null; failure_reason: string | null; captured_at: string | null; created_at: string }[];
  returns: { id: string; request_type: string; reason: string; status: string; quantity: number; refund_amount_minor: number | null; created_at: string; order_item_id: string }[];
  refunds: { id: string; amount_minor: number; destination: string; status: string; created_at: string; completed_at: string | null }[];
  trackingEvents: { id: string; shipment_id: string; status: string; description: string | null; location: string | null; occurred_at: string }[];
}

export type FulfillmentAction = 'process' | 'pack' | 'ship' | 'out_for_delivery' | 'deliver';

export const ordersApi = {
  list: (params: Record<string, unknown>) => apiGetPage<OrderRow>('/admin/orders', params),
  get: (id: string) => apiGet<OrderDetail>(`/admin/orders/${id}`),
  cancel: (id: string, reason: string) => apiPost<OrderDetail>(`/admin/orders/${id}/cancel`, { reason }),
  fulfill: (id: string, body: { action: FulfillmentAction; courier?: string; awbNumber?: string; trackingUrl?: string }) =>
    apiPost<OrderDetail>(`/admin/orders/${id}/fulfillment`, body),
};

export const ORDER_STATUSES = [
  'pending_payment', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered',
  'cancelled', 'return_requested', 'returned', 'refunded', 'payment_failed',
] as const;

/** Which fulfillment actions make sense for an order's current status. */
export function availableFulfillment(status: string): FulfillmentAction[] {
  switch (status) {
    case 'confirmed': return ['process', 'pack'];
    case 'processing': return ['pack'];
    case 'packed': return ['ship'];
    case 'shipped': return ['out_for_delivery', 'deliver'];
    case 'out_for_delivery': return ['deliver'];
    default: return [];
  }
}

export const FULFILLMENT_LABELS: Record<FulfillmentAction, string> = {
  process: 'Start processing',
  pack: 'Mark packed',
  ship: 'Mark shipped',
  out_for_delivery: 'Out for delivery',
  deliver: 'Mark delivered',
};

export const CANCELLABLE = ['pending_payment', 'confirmed', 'processing', 'packed'];

export function formatAddress(a: Address | null | undefined): string[] {
  if (!a) return [];
  return [
    a.recipientName ?? a.recipient_name,
    [a.line1, a.line2].filter(Boolean).join(', '),
    a.landmark ? `Near ${a.landmark}` : null,
    [a.city, a.state, a.postalCode ?? a.postal_code].filter(Boolean).join(', '),
    a.recipientPhone ?? a.recipient_phone,
  ].filter((x): x is string => Boolean(x));
}
