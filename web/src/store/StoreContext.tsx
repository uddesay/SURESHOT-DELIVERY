import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { customerLogout, customerRequest, customerSession, type Cart } from '../pages/shop/storeApi';
import type { Product, ProductDetail, StoreUser } from './types';

interface Toast { id: number; text: string; tone: 'ok' | 'error'; action?: { label: string; run: () => void } }

interface StoreValue {
  user: StoreUser | null;
  signedIn: boolean;
  cart: Cart | null;
  bagCount: number;
  favoriteIds: string[];
  wishlist: Product[];
  setCart: (cart: Cart | null) => void;
  signIn: (identifier: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  signOut: (opts?: { stay?: boolean }) => Promise<void>;
  requireSignIn: () => boolean;
  addVariant: (variantId: string, quantity?: number, origin?: Element | null) => Promise<void>;
  quickAdd: (product: Product, origin?: Element | null) => Promise<boolean>;
  toggleFavorite: (product: Product) => void;
  refreshWishlist: () => Promise<void>;
  toast: (text: string, opts?: { tone?: Toast['tone']; action?: Toast['action'] }) => void;
  toasts: Toast[];
  dismiss: (id: number) => void;
  bagBump: number;
}

const StoreContext = createContext<StoreValue | null>(null);

/** Flies a small dot from the clicked control to the bag icon — tactile add-to-bag confirmation. */
function flyToBag(origin?: Element | null) {
  const target = document.querySelector('[data-bag-target]');
  if (!origin || !target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = origin.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const dot = document.createElement('span');
  dot.className = 'ms-fly';
  dot.style.left = `${a.left + a.width / 2 - 9}px`;
  dot.style.top = `${a.top + a.height / 2 - 9}px`;
  document.body.appendChild(dot);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  dot.animate(
    [
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy - 90}px) scale(1.1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(.35)`, opacity: 0.2 },
    ],
    { duration: 680, easing: 'cubic-bezier(.5,0,.25,1)' },
  ).onfinish = () => dot.remove();
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [signedIn, setSignedIn] = useState(Boolean(customerSession.get()));
  const [user, setUser] = useState<StoreUser | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [bagBump, setBagBump] = useState(0);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((text: string, opts: { tone?: Toast['tone']; action?: Toast['action'] } = {}) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, text, tone: opts.tone ?? 'ok', action: opts.action }]);
    window.setTimeout(() => dismiss(id), opts.tone === 'error' ? 6500 : 4300);
  }, [dismiss]);

  const refreshWishlist = useCallback(async () => {
    const rows = await customerRequest<{ product: { id: string; title: string; slug: string; priceMinor: number; mrpMinor: number; rating_avg: string; rating_count: number; image: string } }[]>('/wishlist');
    setFavoriteIds(rows.map((r) => r.product.id));
    setWishlist(rows.map(({ product: p }) => ({ id: p.id, title: p.title, slug: p.slug, category_id: '', min_price: p.priceMinor, min_mrp: p.mrpMinor, rating_avg: p.rating_avg, rating_count: p.rating_count, image: p.image ? { url: p.image } : null })));
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    // Loaded separately so a cart hiccup never leaves the profile (and its roles) unknown.
    customerRequest<StoreUser>('/auth/me').then((u) => { if (live) setUser(u); }).catch(() => undefined);
    customerRequest<Cart>('/cart').then((c) => { if (live) setCart(c); }).catch(() => undefined);
    refreshWishlist().catch(() => undefined);
    return () => { live = false; };
  }, [signedIn, refreshWishlist]);

  useEffect(() => {
    const expired = () => {
      setSignedIn(false); setUser(null); setCart(null); setFavoriteIds([]); setWishlist([]);
      toast('Your session expired. Please sign in again.', { tone: 'error' });
      navigate('/signin', { state: { from: location.pathname } });
    };
    window.addEventListener('customer-session-expired', expired);
    return () => window.removeEventListener('customer-session-expired', expired);
  }, [navigate, location.pathname, toast]);

  const afterAuth = async (result: { user: StoreUser; tokens: { accessToken: string; refreshToken: string } }) => {
    customerSession.save(result.tokens.accessToken, result.tokens.refreshToken);
    setUser(result.user);
    setSignedIn(true);
    setCart(await customerRequest<Cart>('/cart').catch(() => null));
  };

  const value = useMemo<StoreValue>(() => {
    const bagCount = cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;
    const requireSignIn = () => {
      if (signedIn) return true;
      navigate('/signin', { state: { from: location.pathname + location.search } });
      return false;
    };
    const addVariant = async (variantId: string, quantity = 1, origin?: Element | null) => {
      if (!requireSignIn()) return;
      const existing = cart?.items.find((i) => i.variantId === variantId)?.quantity ?? 0;
      const updated = await customerRequest<Cart>('/cart/items', 'POST', { variantId, quantity: existing + quantity });
      setCart(updated);
      flyToBag(origin);
      setBagBump((n) => n + 1);
      toast('Added to your bag', { action: { label: 'View bag', run: () => navigate('/cart') } });
    };
    return {
      user, signedIn, cart, bagCount, favoriteIds, wishlist, setCart, toasts, dismiss, toast, bagBump, refreshWishlist,
      requireSignIn,
      addVariant,
      quickAdd: async (product, origin) => {
        if (!requireSignIn()) return false;
        const detail = await customerRequest<ProductDetail>(`/products/${encodeURIComponent(product.slug)}`);
        const options = detail.variants.filter((v) => v.is_active && v.in_stock);
        if (options.length === 1) { await addVariant(options[0]!.id, 1, origin); return true; }
        navigate(`/product/${product.slug}`);
        if (options.length > 1) toast('Choose a size or colour first');
        else toast('This item is out of stock right now', { tone: 'error' });
        return false;
      },
      signIn: async (identifier, password) => afterAuth(await customerRequest('/auth/login', 'POST', { identifier, password })),
      register: async (fullName, email, password) => afterAuth(await customerRequest('/auth/register', 'POST', { fullName, email, password })),
      signOut: async ({ stay = false } = {}) => {
        await customerLogout().catch(() => customerSession.clear());
        setSignedIn(false); setUser(null); setCart(null); setFavoriteIds([]); setWishlist([]);
        toast('You’re signed out. See you soon.');
        if (!stay) navigate('/');
      },
      toggleFavorite: (product) => {
        if (!requireSignIn()) return;
        const saved = favoriteIds.includes(product.id);
        setFavoriteIds((ids) => (saved ? ids.filter((x) => x !== product.id) : [...ids, product.id]));
        void (async () => {
          try {
            if (saved) await customerRequest(`/wishlist/items/${product.id}`, 'DELETE');
            else await customerRequest('/wishlist/items', 'POST', { productId: product.id });
            toast(saved ? 'Removed from wishlist' : 'Saved to your wishlist', saved ? {} : { action: { label: 'View', run: () => navigate('/wishlist') } });
            await refreshWishlist();
          } catch (e) {
            setFavoriteIds((ids) => (saved ? [...ids, product.id] : ids.filter((x) => x !== product.id)));
            toast(e instanceof Error ? e.message : 'Wishlist couldn’t be updated', { tone: 'error' });
          }
        })();
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, signedIn, cart, favoriteIds, wishlist, toasts, bagBump, location.pathname, location.search]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
