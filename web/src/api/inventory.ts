import { apiGet, apiGetPage, apiPost } from '../lib/apiClient';

export interface StockRow {
  variant_id: string;
  warehouse_id: string;
  quantity: number;
  reserved: number;
  available: number;
  low_stock_threshold: number;
  isLowStock: boolean;
  updated_at: string;
  sku: string;
  product_id: string;
  product_title: string;
  warehouse_name: string;
  vendor_id: string;
  vendor_name: string;
  unit_price_minor: number;
}

export interface InventorySummary {
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
  outOfStock: number;
  lowStock: number;
  trackedVariants: number;
  inventoryValueMinor: number;
}

export interface Warehouse { id: string; name: string; city: string; vendor_id: string | null; vendor_name: string | null }

export interface Movement {
  id: string;
  movement_type: string;
  quantity_delta: number;
  reference_type: string | null;
  note: string | null;
  warehouse_name: string | null;
  actor_name: string | null;
  created_at: string;
}

export const inventoryApi = {
  list: (params: Record<string, unknown>) => apiGetPage<StockRow>('/admin/inventory', params),
  summary: () => apiGet<InventorySummary>('/admin/inventory/summary'),
  warehouses: (vendorId?: string) => apiGet<Warehouse[]>('/admin/inventory/warehouses', vendorId ? { vendorId } : undefined),
  movements: (variantId: string, page = 1) => apiGetPage<Movement>(`/admin/inventory/${variantId}/movements`, { page, limit: 30 }),
  adjust: (variantId: string, body: { warehouseId: string; delta: number; reason: string }) => apiPost(`/admin/inventory/${variantId}/adjust`, body),
  transfer: (variantId: string, body: { fromWarehouseId: string; toWarehouseId: string; quantity: number; reason?: string }) =>
    apiPost(`/admin/inventory/${variantId}/transfer`, body),
};

export function stockState(row: { available: number; low_stock_threshold: number }): 'in_stock' | 'low_stock' | 'out_of_stock' {
  if (row.available <= 0) return 'out_of_stock';
  if (row.available <= row.low_stock_threshold) return 'low_stock';
  return 'in_stock';
}
