import { useEffect, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, Heart, Loader2, Minus, Package, Plus, ShoppingBag, Star } from 'lucide-react';

import { useInViewClass } from '../pages/shop/motion/hooks';
import { money } from '../pages/shop/storeFormat';
import { useStore } from './StoreContext';
import type { Product } from './types';

export const fmtDate = (value: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
export const statusLabel = (s: string) => s.replace(/_/g, ' ');

/** Scroll-triggered reveal; `index` staggers siblings by 60ms. */
export function Reveal({ as: Tag = 'div', index = 0, className = '', children, style, ...rest }: { as?: ElementType; index?: number; className?: string; children: ReactNode; style?: CSSProperties; [prop: string]: unknown }) {
  const ref = useInViewClass<HTMLElement>();
  return <Tag {...rest} ref={ref} className={`ms-reveal ${className}`} style={{ ...style, '--d': `${Math.min(index, 8) * 60}ms` } as CSSProperties}>{children}</Tag>;
}

/** Unsplash URLs get a responsive srcset so phones never download desktop-sized photos. */
const srcSetFor = (src: string) => (/images\.unsplash\.com/.test(src) && /[?&]w=\d+/.test(src)
  ? [480, 800, 1200, 1600].map((w) => `${src.replace(/([?&])w=\d+/, `$1w=${w}`).replace(/([?&])q=\d+/, '$1q=80')} ${w}w`).join(', ')
  : undefined);

/** Image that fades in after decode and falls back to a neutral placeholder. */
export function Img({ src, alt, eager, sizes = '(min-width: 900px) 40vw, 90vw' }: { src?: string | null; alt: string; eager?: boolean; sizes?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) return <span className="ms-ph" role="img" aria-label={alt}><Package size={34} /></span>;
  const srcSet = srcSetFor(src);
  return <img src={src} srcSet={srcSet} sizes={srcSet ? sizes : undefined} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" className="ms-img" onError={() => setFailed(true)} />;
}

export function Price({ price, mrp }: { price: number | string; mrp?: number | string }) {
  const p = Number(price); const m = Number(mrp ?? 0);
  const off = m > p ? Math.round((1 - p / m) * 100) : 0;
  return <span className="ms-price"><b>{money(p)}</b>{off > 0 && <><s>{money(m)}</s><em>{off}% off</em></>}</span>;
}

export function Stars({ value, count }: { value: number | string; count: number }) {
  if (!count) return <span className="ms-stars">New arrival</span>;
  return <span className="ms-stars" aria-label={`Rated ${Number(value).toFixed(1)} out of 5 from ${count} reviews`}><Star size={13} />{Number(value).toFixed(1)} <span aria-hidden>({count})</span></span>;
}

export function ProductCard({ product: p, index = 0 }: { product: Product; index?: number; feature?: boolean }) {
  const { favoriteIds, toggleFavorite, quickAdd } = useStore();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const saved = favoriteIds.includes(p.id);
  const add = async (el: HTMLElement) => {
    setState('busy');
    try {
      if (await quickAdd(p, el)) { setState('done'); window.setTimeout(() => setState('idle'), 1800); } else setState('idle');
    }
    catch { setState('idle'); }
  };
  return (
    <Reveal as="article" index={index} className="ms-card">
      <div className="ms-card-media">
        <Img src={p.image?.url} alt={p.title} sizes="(min-width: 1200px) 22vw, (min-width: 600px) 31vw, 46vw" />
        <button className={`ms-card-fav${saved ? ' on' : ''}`} aria-pressed={saved} aria-label={saved ? `Remove ${p.title} from wishlist` : `Save ${p.title} to wishlist`} onClick={() => toggleFavorite(p)}><Heart size={19} /></button>
        <button className={`ms-card-add${state === 'busy' ? ' busy' : state === 'done' ? ' done' : ''}`} disabled={state === 'busy'} aria-label={`Add ${p.title} to bag`} onClick={(e) => void add(e.currentTarget)}>
          {state === 'done' ? <Check size={18} /> : state === 'busy' ? <Loader2 size={18} className="ms-spin" /> : <ShoppingBag size={18} />}
          <span className="lbl">{state === 'done' ? 'Added' : state === 'busy' ? 'Adding…' : 'Add to bag'}</span>
        </button>
      </div>
      <div className="ms-card-body">
        <Link to={`/product/${p.slug}`} className="ms-card-title">{p.title}</Link>
        <div className="ms-card-foot"><Price price={p.min_price} mrp={p.min_mrp} /></div>
        <Stars value={p.rating_avg} count={p.rating_count} />
      </div>
    </Reveal>
  );
}

export function CardSkeletons({ count = 8 }: { count?: number }) {
  return <>{Array.from({ length: count }, (_, i) => <div className="ms-skel-card" key={i} aria-hidden><div className="ms-skel" /><div className="ms-skel" style={{ height: 14, width: '40%' }} /><div className="ms-skel" style={{ height: 16, width: '85%' }} /><div className="ms-skel" style={{ height: 16, width: '35%' }} /></div>)}</>;
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="ms-empty"><span className="ms-empty-icon">{icon}</span><h2>{title}</h2>{children && <p>{children}</p>}{action}</div>;
}

export function Stepper({ value, min = 0, max, onChange, label, disabled }: { value: number; min?: number; max: number; onChange: (n: number) => void; label: string; disabled?: boolean }) {
  return (
    <span className="ms-stepper" role="group" aria-label={label}>
      <button type="button" aria-label="Decrease quantity" disabled={disabled || value <= min} onClick={() => onChange(value - 1)}><Minus size={15} /></button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label="Increase quantity" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}><Plus size={15} /></button>
    </span>
  );
}

/** Loads data with cancellation and exposes loading / error / retry. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string }>({ data: null, loading: true, error: '' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    load().then((data) => live && setState({ data, loading: false, error: '' }))
      .catch((e: unknown) => live && setState({ data: null, loading: false, error: e instanceof Error ? e.message : 'Something went wrong' }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, retry: () => setTick((n) => n + 1), setData: (data: T) => setState((s) => ({ ...s, data })) };
}
