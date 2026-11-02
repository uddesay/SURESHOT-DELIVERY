import { apiGet } from '../lib/apiClient';

export type KpiKey = 'gmv' | 'netSales' | 'orders' | 'aov' | 'newCustomers' | 'activeVendors' | 'repeatRate' | 'refundRate';

export interface Kpi { value: number; previous: number; change: number | null }

export interface SeriesPoint { date: string; gmv: number; revenue: number; orders: number; netOrders: number; customers: number; aov: number }

export interface Overview {
  range: { from: string; to: string; days: number };
  previousRange: { from: string; to: string };
  kpis: Record<KpiKey, Kpi>;
  series: SeriesPoint[];
  previousSeries: SeriesPoint[];
  queues: { products: number; vendors: number; payouts: number; returns: number; tickets: number; lowStock: number; reviews: number };
}

export interface RankedRow { id: string; name: string; revenue_minor: number; units: number; orders: number; commission_minor?: number }

export interface Breakdown {
  products: RankedRow[];
  categories: RankedRow[];
  vendors: RankedRow[];
  statuses: { status: string; count: number }[];
  payments: { method: string; count: number; amount_minor: number }[];
}

export interface ActivityEvent {
  id: string;
  type: 'order' | 'customer' | 'vendor' | 'product' | 'refund' | 'payment' | 'support';
  title: string;
  entity: string;
  detail?: string;
  amountMinor?: number;
  status: string;
  at: string;
  link: string;
}

export interface SearchHit { id: string; title: string; subtitle?: string; status?: string; amountMinor?: number; link: string }
export type SearchResults = Record<'products' | 'orders' | 'customers' | 'vendors' | 'categories', SearchHit[]>;

export const analyticsApi = {
  overview: (range: { from: string; to: string }) => apiGet<Overview>('/admin/analytics/overview', range),
  breakdown: (range: { from: string; to: string }, limit = 8) => apiGet<Breakdown>('/admin/analytics/breakdown', { ...range, limit }),
  userGrowth: (range: { from: string; to: string }, interval: 'day' | 'month' = 'day') =>
    apiGet<{ date: string; newUsers: number }[]>('/admin/analytics/user-growth', { ...range, interval }),
  activity: (limit = 20) => apiGet<ActivityEvent[]>('/admin/activity', { limit }),
  search: (q: string) => apiGet<SearchResults>('/admin/search', { q, limit: 5 }),
};
