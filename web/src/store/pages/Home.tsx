import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BadgeCheck, Banknote, Bike, Copy, Package, RotateCcw, Search, ShoppingBasket, Store, Truck, Zap } from 'lucide-react';

import { customerEnvelope, customerRequest } from '../../pages/shop/storeApi';
import { money, photo } from '../../pages/shop/storeFormat';
import { BRAND, SUPPORT_PHONE } from '../brand';
import { useStore } from '../StoreContext';
import { useDepartments, type Department } from '../StoreLayout';
import type { Product } from '../types';
import { CardSkeletons, Img, ProductCard, Reveal, useLoad } from '../ui';
import { StoreCard, type StoreSummary } from './Discover';
import './home.css';

type Tab = 'popularity' | 'newest' | 'rating';
const tabs: { id: Tab; label: string }[] = [{ id: 'popularity', label: 'Best sellers' }, { id: 'newest', label: 'New arrivals' }, { id: 'rating', label: 'Top rated' }];
const off = (p: Product) => (Number(p.min_mrp) > Number(p.min_price) ? Math.round((1 - Number(p.min_price) / Number(p.min_mrp)) * 100) : 0);
const pick = (rows: Product[], word: string) => rows.find((p) => p.slug.includes(word) && p.image?.url);
const sized = (url: string | undefined, w: number) => url?.replace(/([?&])w=\d+/, `$1w=${w}`);
const ROWS = ['grocery', 'mobiles', 'electronics', 'womens-fashion', 'beauty'];

const perks = [
  { icon: Bike, title: 'Our own riders', text: 'Delivered by the Sureshot fleet' },
  { icon: Banknote, title: 'Cash on delivery', text: 'Pay by cash or UPI at the door' },
  { icon: BadgeCheck, title: 'Verified stores', text: 'Every seller is reviewed' },
  { icon: RotateCcw, title: 'Easy returns', text: 'Within each item’s window' },
];

/** One horizontal product row per department. */
function DeptRow({ dept }: { dept: Department }) {
  const rows = useLoad(() => customerRequest<Product[]>(`/products?category=${dept.slug}&limit=10&sort=popularity`), [dept.slug]);
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  const to = dept.slug === 'grocery' ? '/grocery' : `/shop?category=${dept.slug}`;
  return (
    <section className="vx-row" aria-labelledby={`row-${dept.slug}`}>
      <div className="vx-row-head">
        <div><h2 id={`row-${dept.slug}`}>{dept.label}</h2><p>{dept.blurb}</p></div>
        <div className="vx-row-actions">
          <Link className="vx-pill-link" to={to}>View all {dept.count} <ArrowRight size={16} /></Link>
          <div className="ms-rail-nav"><button aria-label="Scroll back" onClick={() => scroll(-1)}><ArrowLeft size={18} /></button><button aria-label="Scroll forward" onClick={() => scroll(1)}><ArrowRight size={18} /></button></div>
        </div>
      </div>
      {dept.children.length > 0 && <div className="vx-chips">{dept.children.map((s) => <Link key={s.id} to={`/shop?category=${s.slug}`}>{s.name}</Link>)}</div>}
      <div className="ms-rail vx-rail" ref={ref}>
        {rows.loading ? <CardSkeletons count={5} /> : (rows.data ?? []).map((p, i) => <ProductCard key={p.id} product={p} index={i % 5} />)}
      </div>
    </section>
  );
}

export function Home() {
  const { toast } = useStore();
  const navigate = useNavigate();
  const depts = useDepartments();
  const stocked = depts.filter((d) => d.count > 0);
  const [tab, setTab] = useState<Tab>('popularity');
  const [mode, setMode] = useState<'products' | 'stores'>('products');
  const [q, setQ] = useState('');

  const meta = useLoad(async () => {
    const [catalog, stores] = await Promise.all([
      customerEnvelope<Product[]>('/products?limit=60&sort=popularity'),
      customerEnvelope<StoreSummary[]>('/stores?limit=4&sort=popular'),
    ]);
    return { total: catalog.meta?.total ?? catalog.data.length, all: catalog.data, stores: stores.data, storeCount: stores.meta?.total ?? stores.data.length };
  }, []);
  const best = useLoad(() => customerRequest<Product[]>(`/products?limit=10&sort=${tab}`), [tab]);

  const all = meta.data?.all ?? [];
  const collage = [pick(all, 'smartphone') ?? pick(all, 'phone'), pick(all, 'headphones'), pick(all, 'basmati') ?? pick(all, 'mango')]
    .map((p, i) => p ?? all.filter((x) => x.image?.url)[i]);
  const maxOff = all.reduce((m, p) => Math.max(m, off(p)), 0);
  const search = (e: FormEvent) => { e.preventDefault(); const t = q.trim(); navigate(mode === 'stores' ? `/stores${t ? `?q=${encodeURIComponent(t)}` : ''}` : (t ? `/shop?q=${encodeURIComponent(t)}` : '/shop')); };
  const copyCode = () => { void navigator.clipboard?.writeText('SURESHOT100').then(() => toast('Code SURESHOT100 copied — apply it in your bag')).catch(() => toast('Use code SURESHOT100 in your bag')); };

  return (
    <div className="vx-home">
      {/* ---------------- hero */}
      <section className="ms-wrap vx-hero ss-hero" aria-labelledby="hero-title">
        <div className="vx-hero-copy">
          <span className="vx-badge"><Zap size={15} /> {BRAND.tagline}</span>
          <h1 id="hero-title">Everything you need, <span>delivered fast.</span></h1>
          <p>Groceries, phones, fashion, beauty and more from verified local stores — delivered to your door by Sureshot’s own delivery partners.</p>
          <form className="ss-hero-search" role="search" onSubmit={search}>
            <div className="ss-mode" role="radiogroup" aria-label="Search in">
              <button type="button" role="radio" aria-checked={mode === 'products'} onClick={() => setMode('products')}><Package size={15} /> Products</button>
              <button type="button" role="radio" aria-checked={mode === 'stores'} onClick={() => setMode('stores')}><Store size={15} /> Stores</button>
            </div>
            <div className="ss-hero-input">
              <Search size={20} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search"
                placeholder={mode === 'stores' ? 'Search a store by name…' : 'Search phones, rice, sneakers…'} aria-label={mode === 'stores' ? 'Search stores' : 'Search products'} />
              <button type="submit" className="vx-btn vx-btn-mango">Search</button>
            </div>
          </form>
          <div className="ss-hero-quick">
            <Link to="/grocery"><ShoppingBasket size={16} /> Grocery</Link>
            <Link to="/stores"><Store size={16} /> All stores</Link>
            <Link to="/shop?sort=price_asc"><Zap size={16} /> Deals</Link>
          </div>
          <ul className="vx-hero-stats">
            <li><b>{meta.data ? meta.data.total : '—'}</b><span>products</span></li>
            <li><b>{meta.data ? meta.data.storeCount : '—'}</b><span>stores</span></li>
            <li><b>{stocked.length || '—'}</b><span>departments</span></li>
          </ul>
        </div>
        <div className="vx-hero-art" aria-hidden={!collage[0]}>
          {collage.map((p, i) => (p ? (
            <Link key={p.id} to={`/product/${p.slug}`} className={`vx-bubble vx-bubble-${i}`} aria-label={p.title}>
              <Img src={sized(p.image?.url, i === 0 ? 900 : 500)} alt={p.title} eager sizes="(min-width: 900px) 24vw, 40vw" />
              <span className="vx-tag"><b>{p.title}</b>{money(Number(p.min_price))}</span>
            </Link>
          ) : <div key={i} className={`vx-bubble vx-bubble-${i} ms-skel`} />))}
          {maxOff > 0 && <span className="vx-stamp">Up to<b>{maxOff}%</b>off</span>}
        </div>
      </section>

      {/* ---------------- quick entries */}
      <section className="ms-wrap ss-entries">
        <Link to="/grocery" className="ss-entry ss-entry-grocery">
          <div><span className="ss-pill light"><ShoppingBasket size={14} /> Grocery</span><h2>Daily groceries in a separate, faster aisle</h2><p>Staples, dairy, fruits & vegetables · same-day delivery</p><span className="ss-entry-cta">Open Grocery <ArrowRight size={17} /></span></div>
          <Img src={photo('photo-1542838132-92c53300491e', 700)} alt="" sizes="(min-width: 900px) 20vw, 40vw" />
        </Link>
        <Link to="/stores" className="ss-entry ss-entry-stores">
          <div><span className="ss-pill light"><Store size={14} /> Store search</span><h2>Search any shop by its name</h2><p>Browse a store’s full catalogue in one place</p><span className="ss-entry-cta">Search stores <ArrowRight size={17} /></span></div>
          <Img src={photo('photo-1555529669-e69e7aa0ba9a', 700)} alt="" sizes="(min-width: 900px) 20vw, 40vw" />
        </Link>
      </section>

      {/* ---------------- all categories */}
      <section className="ms-wrap vx-sec" aria-labelledby="cat-title">
        <div className="vx-sec-head"><h2 id="cat-title">Shop by category</h2><Link className="vx-pill-link" to="/categories">All categories <ArrowRight size={16} /></Link></div>
        <div className="ss-cats">
          {stocked.length === 0 ? Array.from({ length: 15 }, (_, i) => <div key={i} className="ss-cat ms-skel" />)
            : stocked.map((d, i) => (
              <Reveal as={Link} key={d.id} index={i % 5} className="ss-cat" {...{ to: d.slug === 'grocery' ? '/grocery' : `/shop?category=${d.slug}` }}>
                <span className="ss-cat-img"><Img src={d.image} alt="" sizes="120px" /></span>
                <b>{d.label}</b>
              </Reveal>
            ))}
        </div>
      </section>

      {/* ---------------- perks */}
      <section className="ms-wrap vx-perks" aria-label={`Why ${BRAND.name}`}>
        {perks.map(({ icon: Icon, title, text }) => <div key={title}><span><Icon size={22} /></span><p><b>{title}</b>{text}</p></div>)}
      </section>

      {/* ---------------- best sellers */}
      <section className="ms-wrap vx-sec" aria-labelledby="best-title">
        <div className="vx-sec-head">
          <h2 id="best-title">Popular this week</h2>
          <div className="vx-seg" role="tablist" aria-label="Collections">
            {tabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
          </div>
        </div>
        {best.error ? <p className="ms-alert">{best.error} <button className="ms-link" onClick={best.retry}>Try again</button></p> : (
          <div className="vx-grid" role="tabpanel" key={tab}>
            {best.loading ? <CardSkeletons count={5} /> : (best.data ?? []).map((p, i) => <ProductCard key={p.id} product={p} index={i % 5} />)}
          </div>
        )}
      </section>

      {/* ---------------- top stores */}
      <section className="ms-wrap vx-sec" aria-labelledby="stores-title">
        <div className="vx-sec-head"><h2 id="stores-title">Top stores near you</h2><Link className="vx-pill-link" to="/stores">Search all stores <ArrowRight size={16} /></Link></div>
        <div className="ss-store-grid">
          {meta.loading ? Array.from({ length: 4 }, (_, i) => <div key={i} className="ms-skel" style={{ height: 230, borderRadius: 20 }} />)
            : (meta.data?.stores ?? []).map((s) => <StoreCard key={s.id} store={s} />)}
        </div>
      </section>

      {/* ---------------- offer */}
      <section className="ms-wrap vx-sec">
        <Reveal className="vx-offer">
          <div>
            <span className="vx-badge vx-badge-dark">Limited offer</span>
            <h2>₹100 off your order</h2>
            <p>On any order above ₹999. Buying groceries? <b>GROCERY50</b> takes ₹50 off above ₹499.</p>
            <button className="vx-code" onClick={copyCode}><b>SURESHOT100</b><span><Copy size={15} /> Copy code</span></button>
          </div>
          <div className="vx-offer-img"><Img src={photo('photo-1607082348824-0a96f2a4b9da', 1000)} alt="" sizes="(min-width: 900px) 40vw, 90vw" /></div>
        </Reveal>
      </section>

      {/* ---------------- department rows */}
      <div className="ms-wrap vx-rows">
        {ROWS.map((slug) => stocked.find((d) => d.slug === slug)).filter((d): d is Department => Boolean(d)).map((d) => <DeptRow key={d.id} dept={d} />)}
      </div>

      {/* ---------------- join */}
      <section className="ms-wrap vx-sec vx-last ss-join">
        <Reveal className="ss-join-card">
          <Store size={30} />
          <h2>Sell on {BRAND.name}</h2>
          <p>List your products, get orders from your city and let our riders deliver them. Approval in 2 business days.</p>
          <div><Link to="/sell" className="vx-btn vx-btn-green">Start selling <ArrowRight size={18} /></Link><Link to="/seller" className="ss-text-link">Seller login</Link></div>
        </Reveal>
        <Reveal className="ss-join-card dark" index={1}>
          <Truck size={30} />
          <h2>Deliver with {BRAND.name}</h2>
          <p>Join our delivery fleet — flexible hours, daily earnings. {SUPPORT_PHONE ? `Call ${SUPPORT_PHONE.display} to apply.` : 'Contact our team to apply.'}</p>
          <div><Link to="/help/contact" className="vx-btn vx-btn-mango">Apply as a rider <ArrowRight size={18} /></Link><Link to="/rider" className="ss-text-link">Rider login</Link></div>
        </Reveal>
      </section>
    </div>
  );
}
