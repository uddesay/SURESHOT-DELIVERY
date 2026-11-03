import { createContext, useContext, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, ChevronDown, Heart, Home, LayoutGrid, Menu, Phone, RotateCcw, Search, ShieldCheck, ShoppingBag, ShoppingBasket, Store, Truck, User, X } from 'lucide-react';

import { customerEnvelope, customerRequest } from '../pages/shop/storeApi';
import { money, photo } from '../pages/shop/storeFormat';
import { SUPPORT_PHONE } from './brand';
import { StoreProvider, useStore } from './StoreContext';
import type { Category, Product } from './types';
import './sureshot.css';
import './ss.css';
import './app.css';

export interface Department extends Category { count: number; label: string; blurb: string; image: string }

const deptMeta: Record<string, { label?: string; blurb: string; img: string }> = {
  grocery: { blurb: 'Staples, dairy, fruits & vegetables', img: 'photo-1542838132-92c53300491e' },
  electronics: { blurb: 'Audio, laptops & speakers', img: 'photo-1546435770-a3e426bf472b' },
  mobiles: { blurb: 'Smartphones & accessories', img: 'photo-1598327105666-5b89351aff97' },
  watches: { blurb: 'Analog & smartwatches', img: 'photo-1524592094714-0f0654e20314' },
  sunglasses: { blurb: 'UV400 & polarised eyewear', img: 'photo-1511499767150-a48a237f0083' },
  'mens-fashion': { label: 'Men', blurb: 'Shirts, ethnic & suits', img: 'photo-1617137968427-85924c800a22' },
  'womens-fashion': { label: 'Women', blurb: 'Sarees, ethnic sets & dresses', img: 'photo-1610030469983-98e550d6193c' },
  'bags-footwear': { label: 'Bags', blurb: 'Backpacks & handbags', img: 'photo-1547949003-9792a18a2601' },
  shoes: { blurb: 'Sneakers, formal & heels', img: 'photo-1614252235316-8c857d38b5f4' },
  jewellery: { blurb: 'Necklaces, earrings & rings', img: 'photo-1515562141207-7a88fb7ce338' },
  'car-bike-accessories': { label: 'Car & Bike', blurb: 'Riding gear & car interiors', img: 'photo-1558981806-ec527fa84c39' },
  'pet-store': { label: 'Pets', blurb: 'Food & accessories for pets', img: 'photo-1583337130417-3346a1be7dee' },
  beauty: { blurb: 'Makeup & skincare', img: 'photo-1583241800698-e8ab01830a07' },
  kitchen: { label: 'Kitchen', blurb: 'Cookware, appliances & tableware', img: 'photo-1556911220-bff31c812dba' },
  toys: { blurb: 'Building sets & play sets', img: 'photo-1587654780291-39c9404d746b' },
};

const DeptContext = createContext<Department[]>([]);
/** Top-level departments with live product counts; stocked ones first. */
export const useDepartments = () => useContext(DeptContext);

function useLoadDepartments() {
  const [depts, setDepts] = useState<Department[]>([]);
  useEffect(() => {
    let live = true;
    let timer = 0;
    // Retries with backoff so a transient failure (offline, rate limit) doesn't leave navigation empty.
    const load = (attempt: number) => Promise.all([customerRequest<Category[]>('/categories'), customerEnvelope<Product[]>('/products?limit=100')]).then(async ([cats, catalog]) => {
      // One request covers catalogues up to 100 products; beyond that, ask per department.
      const complete = (catalog.meta?.total ?? 0) <= catalog.data.length;
      const counts = complete
        ? cats.map((c) => { const ids = new Set([c.id, ...c.children.map((s) => s.id)]); return catalog.data.filter((p) => ids.has(p.category_id)).length; })
        : await Promise.all(cats.map((c) => customerEnvelope<Product[]>(`/products?category=${c.slug}&limit=1`).then((r) => r.meta?.total ?? 0).catch(() => 0)));
      const rows = cats.map((c, i) => {
        const m = deptMeta[c.slug];
        return { ...c, count: counts[i] ?? 0, label: m?.label ?? c.name, blurb: m?.blurb ?? `${c.name} from verified sellers`, image: c.image_url || (m ? photo(m.img, 900) : '') };
      });
      if (live) setDepts([...rows.filter((d) => d.count > 0), ...rows.filter((d) => d.count === 0)]);
    }).catch(() => { if (live && attempt < 4) timer = window.setTimeout(() => load(attempt + 1), 1500 * 2 ** attempt); });
    load(0);
    return () => { live = false; window.clearTimeout(timer); };
  }, []);
  return depts;
}

function SearchBox({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [hits, setHits] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = window.setTimeout(() => {
      customerRequest<Product[]>(`/products?q=${encodeURIComponent(q.trim())}&limit=6`).then(setHits).catch(() => setHits([]));
    }, 200);
    return () => window.clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const go = (to: string) => { setOpen(false); onDone?.(); navigate(to); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (active >= 0 && hits[active]) return go(`/product/${hits[active]!.slug}`);
    go(q.trim() ? `/shop?q=${encodeURIComponent(q.trim())}` : '/shop');
  };
  return (
    <form ref={box} className="ms-search" role="search" onSubmit={submit}>
      <Search size={19} />
      <input type="search" enterKeyHint="search" value={q} autoFocus={autoFocus} placeholder="Search products — phones, rice, shoes…" aria-label="Search products" autoComplete="off"
        role="combobox" aria-expanded={open && hits.length > 0} aria-controls="ms-suggest" aria-autocomplete="list"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
          if (e.key === 'Escape') setOpen(false);
        }} />
      {open && hits.length > 0 && (
        <div className="ms-suggest" id="ms-suggest" role="listbox">
          {hits.map((p, i) => (
            <Link key={p.id} to={`/product/${p.slug}`} role="option" aria-selected={i === active} onClick={() => { setOpen(false); onDone?.(); }}>
              {p.image?.url ? <img src={p.image.url} alt="" /> : <span style={{ width: 42 }} />}
              <span>{p.title}<small>{money(Number(p.min_price))}</small></span>
            </Link>
          ))}
          <Link to={`/shop?q=${encodeURIComponent(q.trim())}`} onClick={() => { setOpen(false); onDone?.(); }} style={{ justifyContent: 'space-between', fontWeight: 600 }}>See all results for “{q.trim()}” <ArrowRight size={16} /></Link>
        </div>
      )}
    </form>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useStore();
  return (
    <div className="ms-toasts" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`ms-toast${t.tone === 'error' ? ' error' : ''}`}>
          <span>{t.text}</span>
          {t.action && <button onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
          <button className="x" aria-label="Dismiss" onClick={() => dismiss(t.id)}><X size={17} /></button>
        </div>
      ))}
    </div>
  );
}

function Frame() {
  const { bagCount, bagBump, signedIn, user, favoriteIds } = useStore();
  const depts = useLoadDepartments();
  const location = useLocation();
  const [params] = useSearchParams();
  const [scrolled, setScrolled] = useState(false);
  const [tucked, setTucked] = useState(false);
  const [mega, setMega] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [searching, setSearching] = useState(false);
  const stocked = depts.filter((d) => d.count > 0);
  const soon = depts.filter((d) => d.count === 0);

  useEffect(() => {
    let last = window.scrollY;
    // Tuck the header away while reading down the page; bring it back on any upward scroll.
    const on = () => {
      const y = window.scrollY;
      setScrolled(y > 8);
      if (Math.abs(y - last) > 6) { setTucked(y > last && y > 240); last = y; }
    };
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => { setMega(false); setDrawer(false); setSearching(false); window.scrollTo({ top: 0 }); }, [location.pathname]);
  useEffect(() => {
    const overlay = drawer || searching;
    document.documentElement.style.overflow = overlay ? 'hidden' : '';
    if (!overlay && !mega) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDrawer(false); setMega(false); setSearching(false); } };
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('keydown', esc); document.documentElement.style.overflow = ''; };
  }, [drawer, mega, searching]);

  const activeCat = location.pathname === '/shop' ? params.get('category') : null;
  const isActive = (d: Department) => activeCat === d.slug || d.children.some((s) => s.slug === activeCat);
  const first = user?.full_name?.split(' ')[0];

  return (
    <DeptContext.Provider value={depts}>
      <div className="ms" data-header={tucked && !mega ? 'tucked' : undefined}>
        <a href="#main" className="ms-skip">Skip to content</a>
        <div className="ms-util">
          <div className="ms-wrap">
            <span className="long">Free delivery above ₹499 · New here? Use <b>WELCOME10</b> for 10% off</span><span className="short">Free delivery over ₹499 · <b>WELCOME10</b> 10% off</span>
            <nav aria-label="Utility">{SUPPORT_PHONE && <a href={SUPPORT_PHONE.tel}>Call {SUPPORT_PHONE.display}</a>}<Link to="/help/contact">Help</Link><Link to={signedIn ? '/account/orders' : '/signin'}>Track order</Link><Link to="/sell">Sell on Sureshot</Link><Link to="/deliver">Deliver with us</Link></nav>
          </div>
        </div>

        <header className={`ms-header${scrolled ? ' is-scrolled' : ''}${tucked && !mega ? ' is-tucked' : ''}`} onMouseLeave={() => setMega(false)}>
          <div className="ms-wrap ms-header-bar">
            <div className="ms-only-mobile" style={{ gap: 0 }}>
              <button className="ms-icon-btn" aria-label="Open menu" onClick={() => setDrawer(true)}><Menu size={23} /></button>
            </div>
            <Link to="/" className="ms-logo" aria-label="Sureshot home"><img src="/brand/logo.png" alt="Sureshot" width={160} height={50} /></Link>
            <SearchBox key={location.pathname === '/shop' ? `shop-${params.get('q') ?? ''}` : 'other'} />
            <div className="ms-actions">
              <button className="ms-action ms-only-mobile" aria-label="Search" onClick={() => setSearching(true)}><Search size={22} /></button>
              <Link to={signedIn ? '/account' : '/signin'} className="ms-action ms-hide-mobile"><User size={21} /><span className="lbl">{signedIn ? (first ? `Hi, ${first}` : 'Account') : 'Sign in'}</span></Link>
              <Link to="/wishlist" className="ms-action ms-hide-mobile" aria-label={`Wishlist, ${favoriteIds.length} items`}><Heart size={21} /><span className="lbl">Saved</span>{favoriteIds.length > 0 && <span className="ms-badge">{favoriteIds.length}</span>}</Link>
              <Link to="/cart" className="ms-action" aria-label={`Bag, ${bagCount} items`} data-bag-target><ShoppingBag size={22} /><span className="lbl">Bag</span>{bagCount > 0 && <span key={bagBump} className={`ms-badge${bagBump ? ' bump' : ''}`}>{bagCount}</span>}</Link>
            </div>
          </div>
          <button className="ms-only-mobile ss-searchbar" onClick={() => setSearching(true)} aria-label="Search products and stores">
            <Search size={19} /><span>Search products, stores…</span>
          </button>
          <nav className="ms-wrap ms-deptnav" aria-label="Departments">
            <button aria-expanded={mega} aria-controls="ms-mega" onClick={() => setMega((m) => !m)} onMouseEnter={() => setMega(true)}><LayoutGrid size={15} /> All departments <ChevronDown size={15} /></button>
            <NavLink to="/grocery" className="ss-nav-grocery" onMouseEnter={() => setMega(false)}><ShoppingBasket size={15} /> Grocery</NavLink>
            <NavLink to="/stores" onMouseEnter={() => setMega(false)}><Store size={15} /> Stores</NavLink>
            {stocked.filter((d) => d.slug !== 'grocery').slice(0, 6).map((d) => <Link key={d.id} to={`/shop?category=${d.slug}`} className={isActive(d) ? 'active' : ''} onMouseEnter={() => setMega(false)}>{d.label}</Link>)}
            <Link to="/shop?sort=price_asc" className="sale">Deals</Link>
            <span className="note">Own delivery fleet · Cash on delivery</span>
          </nav>
          {mega && depts.length > 0 && (
            <div className="ms-mega" id="ms-mega">
              <div className="ms-wrap ms-mega-grid ss-mega-all">
                {stocked.map((d) => (
                  <div key={d.id}>
                    <h4><Link to={`/shop?category=${d.slug}`} style={{ padding: 0, font: 'inherit', color: 'var(--ink)' }}>{d.label}</Link><small>{d.count} {d.count === 1 ? 'item' : 'items'}</small></h4>
                    {d.children.map((s) => <Link key={s.id} to={`/shop?category=${s.slug}`}>{s.name}</Link>)}
                    <Link to={`/shop?category=${d.slug}`} style={{ color: 'var(--royal)', fontWeight: 600 }}>Shop all {d.label} →</Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </header>

        {drawer && <>
          <div className="ms-scrim" onClick={() => setDrawer(false)} />
          <aside className="ms-drawer" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="ms-drawer-head">
              <img src="/brand/logo.png" alt="Sureshot" />
              <button className="ms-icon-btn" aria-label="Close menu" autoFocus onClick={() => setDrawer(false)}><X size={23} /></button>
            </div>
            <div className="ms-drawer-body">
              <Link to="/grocery" className="big">Grocery<ShoppingBasket size={20} /></Link>
              <Link to="/stores" className="big">Search stores<Store size={20} /></Link>
              <h5>Departments</h5>
              {stocked.map((d) => <Link key={d.id} to={`/shop?category=${d.slug}`} className="big">{d.label}<small>{d.count}</small></Link>)}
              <Link to="/shop" className="big">Shop everything<ArrowRight size={20} /></Link>
              {soon.map((d) => <span key={d.id} className="soon">{d.label}<small>Coming soon</small></span>)}
              <h5>Discover</h5>
              <Link to="/shop?sort=newest">New in<ArrowUpRight size={18} /></Link>
              <Link to="/shop?sort=price_asc">Price drops<ArrowUpRight size={18} /></Link>
              <h5>Your account</h5>
              <Link to={signedIn ? '/account' : '/signin'}>{signedIn ? `Account · ${first ?? ''}` : 'Sign in or create account'}<ArrowRight size={18} /></Link>
              <Link to={signedIn ? '/account/orders' : '/signin'}>Track an order<ArrowRight size={18} /></Link>
              <Link to="/help/contact">Help & support<ArrowRight size={18} /></Link>
              <h5>Work with Sureshot</h5>
              <Link to="/seller">Seller panel<ArrowRight size={18} /></Link>
              <Link to="/sell">Sell on Sureshot<ArrowRight size={18} /></Link>
              <Link to="/deliver">Deliver with us<ArrowRight size={18} /></Link>
              <Link to="/rider">Delivery partner login<ArrowRight size={18} /></Link>
            </div>
          </aside>
        </>}

        {searching && (
          <div className="ms-searchpage" role="dialog" aria-modal="true" aria-label="Search">
            <div className="ms-searchpage-bar">
              <button className="ms-icon-btn" aria-label="Close search" onClick={() => setSearching(false)}><ArrowLeft size={22} /></button>
              <SearchBox autoFocus onDone={() => setSearching(false)} />
            </div>
            <div className="ms-searchpage-body">
              <h5>Departments</h5>
              <div className="ms-quick">{stocked.map((d) => <Link key={d.id} to={`/shop?category=${d.slug}`} onClick={() => setSearching(false)}>{d.label}</Link>)}</div>
              <h5>Looking for a shop?</h5>
              <div className="ms-quick"><Link to="/stores" onClick={() => setSearching(false)}><Store size={14} /> Search stores by name</Link></div>
              <h5>Popular searches</h5>
              <div className="ms-quick">{['Smartphone', 'Basmati rice', 'Smartwatch', 'Sneakers', 'Saree', 'Headphones'].map((t) => <Link key={t} to={`/shop?q=${t.toLowerCase()}`} onClick={() => setSearching(false)}>{t}</Link>)}</div>
            </div>
          </div>
        )}

        <main id="main" className="ms-main"><div className="ms-route" key={location.pathname}><Outlet /></div></main>

        <footer className="ms-footer">
          <div className="ms-footer-trust" aria-label="Our promises">
            <div className="ms-wrap">
              <span><Truck size={20} /><span><b>Our own riders</b>fast delivery, free above ₹499</span></span>
              <span><RotateCcw size={20} /><span><b>Easy returns</b>within each item’s window</span></span>
              <span><ShieldCheck size={20} /><span><b>Cash on delivery</b>pay when it arrives</span></span>
              <span><BadgeCheck size={20} /><span><b>Verified sellers</b>every store is reviewed</span></span>
            </div>
          </div>
          <div className="ms-wrap ms-footer-grid">
            <div className="ms-footer-brand">
              <img src="/brand/logo-white.png" alt="Sureshot Delivery" width={190} height={50} style={{ height: 50, width: 'auto' }} />
              <p className="ms-footer-statement">Your trust. <em>Delivered fast.</em></p>
              <p>Groceries, electronics, fashion and more from local stores — delivered by Sureshot’s own delivery partners.</p>
            </div>
            <nav aria-label="Shop"><h4>Shop</h4><Link to="/grocery">Grocery</Link><Link to="/stores">All stores</Link>{stocked.filter((d) => d.slug !== 'grocery').slice(0, 7).map((d) => <Link key={d.id} to={`/shop?category=${d.slug}`}>{d.label}</Link>)}<Link to="/categories">All departments</Link></nav>
            <nav aria-label="Help"><h4>Help</h4><Link to={signedIn ? '/account/orders' : '/signin'}>Track an order</Link><Link to="/help/shipping-and-returns">Delivery & returns</Link><Link to="/help/contact">Contact support</Link>{SUPPORT_PHONE && <><a href={SUPPORT_PHONE.tel}><Phone size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />{SUPPORT_PHONE.display}</a><a href={SUPPORT_PHONE.whatsapp} target="_blank" rel="noreferrer">WhatsApp us</a></>}</nav>
            <nav aria-label="Company"><h4>Sureshot</h4><Link to="/help/about">About us</Link><Link to="/sell">Sell with us</Link><Link to="/seller">Seller panel</Link><Link to="/deliver">Deliver with us</Link><Link to="/rider">Rider login</Link><Link to={signedIn ? '/account' : '/signin'}>{signedIn ? 'Your account' : 'Sign in'}</Link></nav>
          </div>
          <div className="ms-wrap ms-footer-base"><span>© {new Date().getFullYear()} Sureshot. All rights reserved.</span><span>Prices include all taxes · Secure checkout</span></div>
        </footer>

        <nav className="ms-tabbar" aria-label="Quick navigation">
          <NavLink to="/" end><Home size={22} />Home</NavLink>
          <NavLink to="/categories"><LayoutGrid size={22} />Categories</NavLink>
          <NavLink to="/grocery"><ShoppingBasket size={22} />Grocery</NavLink>
          <NavLink to="/cart"><ShoppingBag size={22} />{bagCount > 0 && <span className="ms-badge">{bagCount}</span>}Bag</NavLink>
          <NavLink to={signedIn ? '/account' : '/signin'}><User size={22} />{signedIn ? 'Account' : 'Sign in'}</NavLink>
        </nav>
        <Toasts />
      </div>
    </DeptContext.Provider>
  );
}

export function StoreLayout() {
  return <StoreProvider><Frame /></StoreProvider>;
}
