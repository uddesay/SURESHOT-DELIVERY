import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Clock, MapPin, Package, Search, ShoppingBasket, Star, Store as StoreIcon, X } from 'lucide-react';

import { customerEnvelope, customerRequest } from '../../pages/shop/storeApi';
import { useDepartments } from '../StoreLayout';
import type { Product } from '../types';
import { CardSkeletons, Empty, Img, ProductCard, useLoad } from '../ui';

export interface StoreSummary {
  id: string; store_name: string; store_slug: string; description: string | null; logo_url: string | null;
  rating_avg: string | number; rating_count: number; product_count: number; city: string | null;
  departments: { name: string; slug: string }[]; preview_images: string[];
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const hue = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export function StoreBadge({ store, size = 56 }: { store: Pick<StoreSummary, 'store_name' | 'logo_url'>; size?: number }) {
  return store.logo_url
    ? <img className="ss-store-logo" src={store.logo_url} alt="" width={size} height={size} />
    : <span className="ss-store-logo" style={{ width: size, height: size, background: `hsl(${hue(store.store_name)} 70% 92%)`, color: `hsl(${hue(store.store_name)} 60% 30%)` }} aria-hidden>{initials(store.store_name)}</span>;
}

export function StoreCard({ store }: { store: StoreSummary }) {
  return (
    <Link to={`/store/${store.store_slug}`} className="ss-store-card">
      <div className="ss-store-previews">
        {[0, 1, 2].map((i) => (store.preview_images[i] ? <Img key={i} src={store.preview_images[i]} alt="" sizes="120px" /> : <span key={i} />))}
      </div>
      <div className="ss-store-body">
        <StoreBadge store={store} size={48} />
        <div>
          <h3>{store.store_name}</h3>
          <p className="ss-store-meta">
            <span><Star size={13} fill="currentColor" /> {Number(store.rating_avg).toFixed(1)}</span>
            <span><Package size={13} /> {store.product_count} products</span>
            {store.city && <span><MapPin size={13} /> {store.city}</span>}
          </p>
          <p className="ss-store-depts">{store.departments.map((d) => d.name).join(' · ') || 'New store'}</p>
        </div>
      </div>
    </Link>
  );
}

/** Every department and its subcategories — the app's "Categories" tab. */
export function Categories() {
  const depts = useDepartments();
  return (
    <div className="ms-wrap ss-page">
      <header className="ss-page-head"><h1>All categories</h1><p>{depts.length ? `${depts.length} departments` : 'Loading…'} · tap one to start shopping</p></header>
      <div className="ss-cat-list">
        {depts.length === 0 ? Array.from({ length: 8 }, (_, i) => <div key={i} className="ms-skel" style={{ height: 96, borderRadius: 18 }} />)
          : depts.map((d) => (
            <section key={d.id} className="ss-cat-row">
              <Link to={d.slug === 'grocery' ? '/grocery' : `/shop?category=${d.slug}`} className="ss-cat-row-head">
                <span className="ss-cat-row-img"><Img src={d.image} alt="" sizes="72px" /></span>
                <span><b>{d.label}</b><small>{d.count} items · {d.blurb}</small></span>
                <ArrowRight size={18} />
              </Link>
              {d.children.length > 0 && <div className="ss-chips">{d.children.map((s) => <Link key={s.id} to={`/shop?category=${s.slug}`}>{s.name}</Link>)}</div>}
            </section>
          ))}
      </div>
    </div>
  );
}

/** Store search dashboard: find a shop by name, narrow by department, sort. */
export function Stores() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const depts = useDepartments();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'popular';
  const [text, setText] = useState(q);
  const list = useLoad(() => customerEnvelope<StoreSummary[]>(`/stores?limit=50&sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ''}${category ? `&category=${category}` : ''}`), [q, category, sort]);
  const set = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next, { replace: true }); };
  const submit = (e: FormEvent) => { e.preventDefault(); set('q', text.trim()); };
  const total = list.data?.meta?.total ?? list.data?.data.length ?? 0;

  return (
    <div className="ms-wrap ss-page">
      <header className="ss-stores-hero">
        <span className="ss-pill"><StoreIcon size={14} /> Store search</span>
        <h1>Find a store you trust</h1>
        <p>Search every shop on Sureshot by name — then browse just their products.</p>
        <form className="ss-bigsearch" role="search" onSubmit={submit}>
          <Search size={20} />
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search store name, e.g. “TechZone” or “Rangoli”" aria-label="Search stores by name" enterKeyHint="search" />
          {text && <button type="button" className="clear" aria-label="Clear" onClick={() => { setText(''); set('q', ''); }}><X size={18} /></button>}
          <button className="ms-btn sm" type="submit">Search</button>
        </form>
      </header>

      <div className="ss-toolbar">
        <div className="ss-chips" role="group" aria-label="Filter stores by department">
          <button className={!category ? 'on' : ''} onClick={() => set('category', '')}>All</button>
          {depts.filter((d) => d.count > 0).map((d) => <button key={d.id} className={category === d.slug ? 'on' : ''} onClick={() => set('category', d.slug)}>{d.label}</button>)}
        </div>
        <label className="ss-sort">Sort
          <select value={sort} onChange={(e) => set('sort', e.target.value)}>
            <option value="popular">Most popular</option><option value="rating">Top rated</option><option value="name">A–Z</option><option value="newest">Newest</option>
          </select>
        </label>
      </div>

      <p className="ss-count">{list.loading ? 'Searching stores…' : `${total} ${total === 1 ? 'store' : 'stores'}${q ? ` matching “${q}”` : ''}`}</p>
      {list.error ? <p className="ms-alert">{list.error} <button className="ms-link" onClick={list.retry}>Try again</button></p>
        : list.loading ? <div className="ss-store-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="ms-skel" style={{ height: 230, borderRadius: 20 }} />)}</div>
          : total === 0 ? <Empty icon={<StoreIcon size={30} />} title="No stores found" action={<button className="ms-btn" onClick={() => { setText(''); navigate('/stores'); }}>Show all stores</button>}>Try a shorter name or another department.</Empty>
            : <div className="ss-store-grid">{list.data!.data.map((s) => <StoreCard key={s.id} store={s} />)}</div>}
    </div>
  );
}

/** One store: its profile and only its products, filterable by department. */
export function StorePage() {
  const { slug = '' } = useParams();
  const [dept, setDept] = useState('');
  const [sort, setSort] = useState('popularity');
  const store = useLoad(() => customerRequest<StoreSummary>(`/stores/${slug}`), [slug]);
  const products = useLoad(async () => (store.data ? customerRequest<Product[]>(`/products?vendor=${store.data.id}&limit=60&sort=${sort}${dept ? `&category=${dept}` : ''}`) : []), [store.data?.id, dept, sort]);
  const s = store.data;

  if (store.error) return <div className="ms-wrap ss-page"><Empty icon={<StoreIcon size={30} />} title="Store not found" action={<Link className="ms-btn" to="/stores">Browse stores</Link>}>{store.error}</Empty></div>;
  return (
    <div className="ms-wrap ss-page">
      <header className="ss-store-head">
        <div className="ss-store-cover">{s?.preview_images[0] ? <Img src={s.preview_images[0].replace(/([?&])w=\d+/, '$1w=1400')} alt="" eager sizes="100vw" /> : <div className="ms-skel" style={{ height: '100%' }} />}</div>
        <div className="ss-store-id">
          {s ? <StoreBadge store={s} size={76} /> : <span className="ss-store-logo ms-skel" style={{ width: 76, height: 76 }} />}
          <div>
            <h1>{s?.store_name ?? <span className="ms-skel" style={{ display: 'inline-block', width: 240, height: 34 }} />}</h1>
            {s && <p className="ss-store-meta">
              <span><Star size={14} fill="currentColor" /> {Number(s.rating_avg).toFixed(1)} ({s.rating_count})</span>
              <span><Package size={14} /> {s.product_count} products</span>
              {s.city && <span><MapPin size={14} /> {s.city}</span>}
              <span><Clock size={14} /> Delivered by Sureshot</span>
            </p>}
            {s?.description && <p className="ss-store-desc">{s.description}</p>}
          </div>
        </div>
      </header>
      <div className="ss-toolbar">
        <div className="ss-chips" role="group" aria-label="Filter this store’s products">
          <button className={!dept ? 'on' : ''} onClick={() => setDept('')}>Everything</button>
          {(s?.departments ?? []).map((d) => <button key={d.slug} className={dept === d.slug ? 'on' : ''} onClick={() => setDept(d.slug)}>{d.name}</button>)}
        </div>
        <label className="ss-sort">Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="popularity">Popular</option><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="rating">Top rated</option>
          </select>
        </label>
      </div>
      <div className="ms-grid ss-grid5">{products.loading || store.loading ? <CardSkeletons count={10} /> : (products.data ?? []).map((p, i) => <ProductCard key={p.id} product={p} index={i % 5} />)}</div>
      {!products.loading && s && (products.data ?? []).length === 0 && <Empty icon={<Package size={30} />} title="Nothing here yet">This store hasn’t listed products in this department.</Empty>}
    </div>
  );
}

/** Grocery mode: its own aisle with subcategory tabs, a grocery-only search and quick add. */
export function Grocery() {
  const depts = useDepartments();
  const grocery = depts.find((d) => d.slug === 'grocery');
  const [aisle, setAisle] = useState('');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const products = useLoad(() => customerRequest<Product[]>(`/products?category=${aisle || 'grocery'}&limit=60&sort=popularity${term ? `&q=${encodeURIComponent(term)}` : ''}`), [aisle, term]);
  const aisles = useMemo(() => grocery?.children ?? [], [grocery]);
  const submit = (e: FormEvent) => { e.preventDefault(); setTerm(q.trim()); };

  return (
    <div className="ss-grocery">
      <header className="ss-grocery-hero">
        <div className="ms-wrap">
          <span className="ss-pill light"><ShoppingBasket size={14} /> Sureshot Grocery</span>
          <h1>Daily groceries, delivered fast</h1>
          <p>Staples, dairy, fruits, vegetables and more — packed by local stores and delivered by our own riders.</p>
          <form className="ss-bigsearch" role="search" onSubmit={submit}>
            <Search size={20} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groceries — rice, milk, tea…" aria-label="Search groceries" enterKeyHint="search" />
            {q && <button type="button" className="clear" aria-label="Clear" onClick={() => { setQ(''); setTerm(''); }}><X size={18} /></button>}
            <button className="ms-btn sm saffron" type="submit">Search</button>
          </form>
        </div>
      </header>
      <div className="ms-wrap ss-page">
        <div className="ss-aisles" role="tablist" aria-label="Grocery aisles">
          <button role="tab" aria-selected={!aisle} onClick={() => setAisle('')}><span className="ss-aisle-img"><Img src={grocery?.image} alt="" sizes="64px" /></span>All</button>
          {aisles.map((a) => (
            <button key={a.id} role="tab" aria-selected={aisle === a.slug} onClick={() => setAisle(a.slug)}>
              <span className="ss-aisle-img">{a.image_url ? <Img src={a.image_url} alt="" sizes="64px" /> : <ShoppingBasket size={22} />}</span>{a.name}
            </button>
          ))}
        </div>
        <p className="ss-count">{products.loading ? 'Loading aisle…' : `${products.data?.length ?? 0} items${term ? ` for “${term}”` : ''}`}</p>
        <div className="ms-grid ss-grid5">{products.loading ? <CardSkeletons count={10} /> : (products.data ?? []).map((p, i) => <ProductCard key={p.id} product={p} index={i % 5} />)}</div>
        {!products.loading && (products.data ?? []).length === 0 && <Empty icon={<ShoppingBasket size={30} />} title="Nothing in this aisle yet">Try another aisle or search term.</Empty>}
      </div>
    </div>
  );
}
