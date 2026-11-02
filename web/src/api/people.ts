import { apiGet, apiGetPage, apiPatch, apiPost } from '../lib/apiClient';

export interface UserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  created_at: string;
  last_login_at: string | null;
  order_count: number;
  total_spent_minor: number;
  aov_minor: number;
  last_order_at: string | null;
  roles: string[];
}

export interface UserDetail {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  is_email_verified: boolean;
  is_phone_verified: boolean;
  created_at: string;
  last_login_at: string | null;
  roles: string[];
  totalOrders: number;
  lifetimeValueMinor: number;
  addresses: {
    id: string; label: string; recipient_name: string; recipient_phone: string; line1: string; line2: string | null;
    city: string; state: string; postal_code: string; is_default: boolean;
  }[];
  wishlist: { id: string; title: string; created_at: string }[];
  reviews: { id: string; rating: number; title: string | null; status: string; created_at: string; product_title: string; product_id: string }[];
  vendor: { id: string; store_name: string; status: string } | null;
}

export interface VendorRow {
  id: string;
  store_name: string;
  store_slug: string;
  logo_url: string | null;
  status: string;
  commission_rate_bp: number | null;
  rating_avg: string | number;
  rating_count: number;
  created_at: string;
  approved_at: string | null;
  owner_name: string | null;
  owner_email: string | null;
  product_count: number;
  order_count: number;
  revenue_minor: number;
  commission_minor: number;
  business_type: string | null;
  gstin: string | null;
}

export interface VendorDetail extends Omit<VendorRow, 'owner_name' | 'owner_email' | 'product_count' | 'order_count' | 'revenue_minor' | 'commission_minor'> {
  description: string | null;
  banner_url: string | null;
  support_email: string | null;
  support_phone: string | null;
  pan: string | null;
  owner: { id: string; full_name: string | null; email: string | null; phone: string | null } | null;
  kycDocuments: { id: string; doc_type: string; file_url: string; status: string; rejection_reason: string | null; created_at: string }[];
  bankAccounts: { id: string; accountHolder: string; accountNumberMasked: string; ifsc: string; bankName: string; isVerified: boolean; isPrimary: boolean; createdAt: string }[];
  warehouses: { id: string; name: string; city: string; state: string; is_active: boolean }[];
  stats: { orders: number; customers: number; revenueMinor: number; commissionMinor: number; products: Record<string, number> };
  payouts: { id: string; status: string; net_minor: number; gross_minor?: number; commission_minor?: number; period_start: string; period_end: string; created_at: string }[];
  reviews: { id: string; rating: number; title: string | null; status: string; created_at: string; product_title: string }[];
  categories: { id: string; name: string; products: number }[];
}

export const peopleApi = {
  users: (params: Record<string, unknown>) => apiGetPage<UserRow>('/admin/users', params),
  user: (id: string) => apiGet<UserDetail>(`/admin/users/${id}`),
  suspendUser: (id: string) => apiPost(`/admin/users/${id}/suspend`),
  reactivateUser: (id: string) => apiPost(`/admin/users/${id}/reactivate`),
  vendors: (params: Record<string, unknown>) => apiGetPage<VendorRow>('/admin/vendors', params),
  vendor: (id: string) => apiGet<VendorDetail>(`/admin/vendors/${id}`),
  approveVendor: (id: string) => apiPost(`/admin/vendors/${id}/approve`),
  rejectVendor: (id: string, reason: string) => apiPost(`/admin/vendors/${id}/reject`, { reason }),
  requestVendorInfo: (id: string, message: string) => apiPost(`/admin/vendors/${id}/request-info`, { message }),
  suspendVendor: (id: string) => apiPost(`/admin/vendors/${id}/suspend`),
  reactivateVendor: (id: string) => apiPost(`/admin/vendors/${id}/reactivate`),
  reviewKyc: (docId: string, status: 'approved' | 'rejected', rejectionReason?: string) =>
    apiPost(`/admin/vendors/kyc-documents/${docId}/review`, { status, ...(rejectionReason ? { rejectionReason } : {}) }),
  verifyBank: (bankAccountId: string) => apiPost(`/admin/vendors/bank-accounts/${bankAccountId}/verify`),
  setCommission: (id: string, commissionRateBp: number | null) => apiPatch(`/admin/vendors/${id}/commission`, { commissionRateBp }),
};
