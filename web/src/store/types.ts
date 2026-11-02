import type { Variant } from '../pages/shop/storeApi';

export interface StoreUser { id?: string; full_name: string; email?: string; roles?: string[] }
export interface Category { id: string; name: string; slug: string; image_url?: string | null; children: Category[] }
export interface Product {
  id: string; title: string; slug: string; category_id: string; min_price: number | string; min_mrp: number | string;
  rating_avg: string | number; rating_count: number; image: { url: string } | null; sold_count?: number;
}
export interface ProductDetail {
  id: string; title: string; slug: string; description: string; highlights: string[]; category_name: string; category_slug: string;
  vendor_name: string; brand_name: string | null; rating_avg: string | number; rating_count: number; sold_count: number;
  variants: Variant[]; media: { url: string; alt_text?: string }[]; is_returnable: boolean; return_window_days: number; is_cod_available: boolean;
  specifications: { group_name: string; spec_key: string; spec_value: string }[];
}
export interface Banner { id: string; title: string; image_url: string; target_type: string | null; target_value: string | null }
export interface OrderSummary { id: string; orderNumber: string; status: string; totalMinor: number; placedAt: string; itemCount?: number }
export interface OrderDetail {
  id: string; order_number: string; status: string; total_minor: number; subtotal_minor: number; discount_minor: number; shipping_minor: number;
  created_at: string; payment_method: string; shipping_address: Record<string, string>; cancelled_reason: string | null;
  items: { id: string; title: string; variant_label: string | null; image_url: string | null; quantity: number; line_total_minor: number; shipment_id: string }[];
  shipments: { id: string; vendor_name: string; status: string; courier: string | null; awb_number: string | null }[];
  statusHistory: { id: string; to_status: string; created_at: string; note: string | null }[];
}
