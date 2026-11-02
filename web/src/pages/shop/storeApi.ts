import { isApp } from '../../lib/appMode';

const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
// The website keeps sign-in per tab; the installed app keeps it across restarts.
const storage: Storage = isApp ? localStorage : sessionStorage;
const accessKey = 'sureshot.customer.access';
const refreshKey = 'sureshot.customer.refresh';
export const customerSession = {
  get: () => storage.getItem(accessKey),
  save: (access: string, refresh?: string) => { storage.setItem(accessKey, access); if (refresh) storage.setItem(refreshKey, refresh); },
  clear: () => { storage.removeItem(accessKey); storage.removeItem(refreshKey); },
};
export interface Envelope<T> { data: T; meta?: { page: number; totalPages: number; total: number }; }
let refreshing: Promise<boolean> | null = null;
async function refreshSession() {
  const token = storage.getItem(refreshKey);
  if (!token) return false;
  const response = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: token }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) return false;
  const result = await response.json();
  if (storage.getItem(refreshKey) !== token) return false;
  customerSession.save(result.data.accessToken, result.data.refreshToken);
  return true;
}
export async function customerEnvelope<T>(path: string, method = 'GET', body?: unknown, idempotencyKey?: string, retry = true): Promise<Envelope<T>> {
  let response: Response;
  const token = customerSession.get();
  try {
    response = await fetch(`${base}${path}`, {
      method, signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new Error('We couldn’t reach the store. Check your connection and try again.'); }
  const result = await response.json().catch(() => ({}));
  if (response.status === 401 && retry && result.code === 'TOKEN_EXPIRED') {
    refreshing ||= refreshSession().catch(() => false).finally(() => { refreshing = null; });
    if (await refreshing) return customerEnvelope(path, method, body, idempotencyKey, false);
  }
  if (!response.ok) {
    if (response.status === 401 && token === customerSession.get() && !['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'].includes(path)) { customerSession.clear(); window.dispatchEvent(new Event('customer-session-expired')); }
    throw new Error(result.message || 'This request could not be completed. Please try again.');
  }
  return result;
}
export async function customerRequest<T>(path: string, method = 'GET', body?: unknown, key?: string): Promise<T> { return (await customerEnvelope<T>(path, method, body, key)).data; }
export async function customerLogout() {
  const refreshToken = storage.getItem(refreshKey);
  if (refreshToken) await customerRequest('/auth/logout', 'POST', { refreshToken });
  customerSession.clear();
}
export interface CartItem { itemId: string; variantId: string; title: string; image: string; quantity: number; unitPriceMinor: number; purchasable: boolean; availableStock: number; isCodAvailable: boolean; }
export interface Cart { items: CartItem[]; totals: { subtotalMinor: number; shippingMinor: number; discountMinor: number; totalMinor: number; couponError?: string; coupon?: { code: string } }; }
export interface Address { id: string; recipient_name: string; recipient_phone: string; line1: string; city: string; state: string; postal_code: string; }
export interface Variant { id: string; sale_price_minor: number; mrp_minor: number; in_stock: boolean; available_stock: number; is_active: boolean; options: { name: string; value: string }[]; }
