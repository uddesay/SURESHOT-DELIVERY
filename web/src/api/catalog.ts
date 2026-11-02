import { apiGet, apiGetPage, apiPatch, apiPost } from '../lib/apiClient';

export type ProductStatus = 'draft' | 'pending_approval' | 'active' | 'rejected' | 'inactive' | 'archived';

export interface ProductRow {
  id: string;
  title: string;
  slug: string;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
  rating_avg: number;
  rating_count: number;
  sold_count: number;
  rejection_reason: string | null;
  vendor_id: string;
  vendor_name: string;
  category_id: string;
  category_name: string | null;
  brand_id: string | null;
  brand_name: string | null;
  sku: string | null;
  price_minor: number | null;
  mrp_minor: number | null;
  stock: number;
  image_url: string | null;
  variant_count: number;
}

export interface ProductVariant {
  id: string;
  sku: string;
  barcode: string | null;
  mrp_minor: number;
  sale_price_minor: number;
  weight_grams: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  is_default: boolean;
  options: { name: string; value: string }[];
  available_stock: number;
}

export interface ProductDetail {
  id: string;
  title: string;
  slug: string;
  description: string;
  highlights: string[];
  status: ProductStatus;
  rejection_reason: string | null;
  vendor_id: string;
  vendor_name: string;
  category_id: string;
  category_name: string;
  brand_id: string | null;
  brand_name: string | null;
  hsn_code: string | null;
  tax_rate_bp: number;
  is_returnable: boolean;
  return_window_days: number;
  is_cod_available: boolean;
  seo_title: string | null;
  seo_description: string | null;
  rating_avg: string | number;
  rating_count: number;
  sold_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  variants: ProductVariant[];
  media: { id: string; url: string; alt_text: string | null; media_type: string; sort_order: number }[];
  specifications: { group_name: string; spec_key: string; spec_value: string }[];
  faqs: { question: string; answer: string }[];
}

export interface CategoryRow {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  commission_rate_bp: number;
  sort_order: number;
  is_active: boolean;
  seo_title: string | null;
  seo_description: string | null;
  product_count: number;
}

export interface BrandRow { id: string; name: string; slug: string; logo_url: string | null; description: string | null; is_active: boolean; product_count: number }

export interface VariantInput {
  sku: string;
  barcode?: string;
  mrpMinor: number;
  salePriceMinor: number;
  weightGrams?: number;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  options: Record<string, string>;
  initialStock?: number;
}

export interface ProductInput {
  vendorId?: string;
  title: string;
  categoryId: string;
  brandId: string | null;
  description: string;
  highlights: string[];
  hsnCode?: string;
  taxRateBp: number;
  isReturnable: boolean;
  returnWindowDays: number;
  isCodAvailable: boolean;
  seoTitle?: string;
  seoDescription?: string;
  variants: VariantInput[];
  media: { url: string; altText?: string; type: 'image' }[];
  specifications: { group: string; key: string; value: string }[];
  status?: 'draft' | 'pending_approval' | 'active' | 'inactive';
}

export type BulkAction = 'publish' | 'unpublish' | 'draft' | 'archive' | 'category';

export const catalogApi = {
  products: (params: Record<string, unknown>) => apiGetPage<ProductRow>('/admin/products', params),
  product: (id: string) => apiGet<ProductDetail>(`/admin/products/${id}`),
  createProduct: (body: ProductInput) => apiPost<ProductDetail>('/admin/products', body),
  updateProduct: (id: string, body: Partial<ProductInput>) => apiPatch<ProductDetail>(`/admin/products/${id}`, body),
  bulk: (ids: string[], action: BulkAction, categoryId?: string) =>
    apiPost<{ updated: number; failed: number; results: { id: string; ok: boolean; message?: string }[] }>('/admin/products/bulk', { ids, action, ...(categoryId ? { categoryId } : {}) }),
  approve: (id: string) => apiPost(`/admin/products/${id}/approve`),
  reject: (id: string, reason: string) => apiPost(`/admin/products/${id}/reject`, { reason }),
  categories: () => apiGet<CategoryRow[]>('/admin/categories'),
  brands: (params: Record<string, unknown> = { limit: 100 }) => apiGetPage<BrandRow>('/admin/brands', params),
};

/** Builds an indented option list from the flat category rows. */
export function categoryOptions(rows: CategoryRow[]): { id: string; label: string; depth: number; row: CategoryRow }[] {
  const byParent = new Map<string | null, CategoryRow[]>();
  for (const row of rows) {
    const key = row.parent_id && rows.some((r) => r.id === row.parent_id) ? row.parent_id : null;
    byParent.set(key, [...(byParent.get(key) ?? []), row]);
  }
  const out: { id: string; label: string; depth: number; row: CategoryRow }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const row of byParent.get(parent) ?? []) {
      out.push({ id: row.id, label: row.name, depth, row });
      walk(row.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
