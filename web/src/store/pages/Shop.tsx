import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, SearchX, SlidersHorizontal, X } from 'lucide-react';

import { customerEnvelope } from '../../pages/shop/storeApi';
import { useDepartments } from '../StoreLayout';
import type { Product } from '../types';
import { CardSkeletons, Empty, ProductCard, useLoad } from '../ui';

const sorts = [['popularity', 'Most popular'], ['newest', 'Newest first'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['rating', 'Top rated']];
const ratings = [['4', '4★ & above'], ['3', '3★ & above']];

type Patch = Record<string, string>;

function FilterFields({ category, rating, priceMin, priceMax, set, idPrefix }: { category: string; rating: string; priceMin: string; priceMax: string; set: (p: Patch) => void; idPrefix: string }) {
  const depts = useDepartments().filter((d) => d.count > 0);
  const [min, setMin] = useState(priceMin);
  const [max, setMax] = useState(priceMax);
  useEffect(() => { setMin(priceMin); setMax(priceMax); }, [priceMin, priceMax]);
  return (
    <>
      <fieldset className="ms-filter-group" style={{ border: 0, margin: 0, padding: 0 }}>
        <h3>Department</h3>
        <label className="check"><input type="radio" name={`${idPrefix}-cat`} checked={!category} onChange={() => set({ category: '' })} />Everything</label>
        {depts.map((c) => (
          <div key={c.id}>
            <label className="check"><input type="radio" name={`${idPrefix}-cat`} checked={category === c.slug} onChange={() => set({ category: c.slug })} />{c.label} <span style={{ color: 'var(--muted-2)', fontSize: 13.5 }}>{c.count}</span></label>
            {c.children.map((s) => <label key={s.id} className="check" style={{ paddingLeft: 30 }}><input type="radio" name={`${idPrefix}-cat`} checked={category === s.slug} onChange={() => set({ category: s.slug })} />{s.name}</label>)}
          </div>
        ))}
      </fieldset>
      <form className="ms-filter-group" onSubmit={(e) => { e.preventDefault(); set({ priceMin: min, priceMax: max }); }}>
        <h3>Price (₹)</h3>
        <div className="ms-filter-price ms-field">
          <input type="number" min={0} inputMode="numeric" aria-label="Minimum price" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value)} />
          <input type="number" min={0} inputMode="numeric" aria-label="Maximum price" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value)} />
        </div>
        <button className="ms-btn ghost sm full" style={{ marginTop: 12 }}>Apply price</button>
      </form>
      <fieldset className="ms-filter-group" style={{ border: 0, margin: 0, padding: 0, borderBottom: 0 }}>
        <h3>Customer rating</h3>
        {ratings.map(([v, l]) => <label key={v} className="check"><input type="radio" name={`${idPrefix}-rating`} checked={rating === v} onChange={() => set({ rating: v! })} />{l}</label>)}
        <label className="check"><input type="radio" name={`${idPrefix}-rating`} checked={!rating} onChange={() => set({ rating: '' })} />Any rating</label>
      </fieldset>
    </>
  );
}

export function Shop() {
  const [params, setParams] = useSearchParams();
  const depts = useDepartments();
  const [sheet, setSheet] = useState(false);
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'popularity';
  const rating = params.get('rating') ?? '';
  const priceMin = params.get('priceMin') ?? '';
  const priceMax = params.get('priceMax') ?? '';
  const page = Number(params.get('page') ?? 1);

  const set = (patch: Patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  const list = useLoad(() => {
    const p = new URLSearchParams({ limit: '12', page: String(page), sort });
    if (q) p.set('q', q);
    if (category) p.set('category', category);
    if (rating) p.set('rating', rating);
    if (priceMin) p.set('priceMin', String(Number(priceMin) * 100));
    if (priceMax) p.set('priceMax', String(Number(priceMax) * 100));
    return customerEnvelope<Product[]>(`/products?${p}`);
  }, [q, category, sort, rating, priceMin, priceMax, page]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [page]);
  useEffect(() => {
    document.documentElement.style.overflow = sheet ? 'hidden' : '';
    return () => { document.documentElement.style.overflow = ''; };
  }, [sheet]);

  const flat = depts.flatMap((c) => [{ ...c, parent: null as null | typeof c }, ...c.children.map((s) => ({ ...s, label: s.name, parent: c }))]);
  const current = flat.find((c) => c.slug === category);
  const total = list.data?.meta?.total ?? 0;
  const pages = list.data?.meta?.totalPages ?? 1;
  const products = list.data?.data ?? [];
  const chips = [
    q && { k: 'q', label: `“${q}”` }, current && { k: 'category', label: current.label },
    rating && { k: 'rating', label: `${rating}★ & above` }, (priceMin || priceMax) && { k: 'price', label: `₹${priceMin || 0} – ${priceMax ? `₹${priceMax}` : 'any'}` },
  ].filter(Boolean) as { k: string; label: string }[];
  const filterCount = chips.filter((c) => c.k !== 'q').length;
  const title = q ? <>Results for <em>“{q}”</em></> : current ? current.label : sort === 'newest' ? <>New <em>this week</em></> : sort === 'price_asc' ? <>Price <em>drops</em></> : <>The whole <em>bazaar</em></>;

  return (
    <div className="ms-wrap">
      <header className="ms-page-head">
        <nav className="ms-crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><Link to="/shop">Shop</Link>{current?.parent && <><span>/</span><Link to={`/shop?category=${current.parent.slug}`}>{current.parent.label}</Link></>}{current && <><span>/</span><span aria-current="page">{current.label}</span></>}</nav>
        <h1>{title}</h1>
        <p>{list.loading ? 'Finding the good stuff…' : `${total} ${total === 1 ? 'item' : 'items'} from verified sellers`}</p>
      </header>

      <div className="ms-listing">
        <aside className="ms-filters" aria-label="Filters">
          <FilterFields idPrefix="side" category={category} rating={rating} priceMin={priceMin} priceMax={priceMax} set={set} />
        </aside>

        <section aria-live="polite" aria-busy={list.loading}>
          <div className="ms-toolbar">
            <div className="ms-toolbar-btns">
              <button className="ms-btn ghost sm ms-only-sheet" aria-haspopup="dialog" onClick={() => setSheet(true)}><SlidersHorizontal size={16} /> Filter{filterCount ? ` · ${filterCount}` : ''}</button>
              <select className="ms-select" aria-label="Sort products" value={sort} onChange={(e) => set({ sort: e.target.value })}>
                {sorts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <span className="count">{list.loading ? '' : `${total} ${total === 1 ? 'result' : 'results'}`}</span>
            {chips.length > 0 && (
              <div className="ms-chips" style={{ flexBasis: '100%' }}>
                {chips.map((c) => <button key={c.k} className="ms-chip" onClick={() => set(c.k === 'price' ? { priceMin: '', priceMax: '' } : { [c.k]: '' })} aria-label={`Remove filter ${c.label}`}>{c.label}<X size={14} /></button>)}
                {chips.length > 1 && <button className="ms-link" style={{ fontSize: 14.5 }} onClick={() => setParams(new URLSearchParams(sort !== 'popularity' ? { sort } : {}))}>Clear all</button>}
              </div>
            )}
          </div>

          {list.error ? (
            <Empty icon={<SearchX size={32} />} title="We couldn’t load products" action={<button className="ms-btn" onClick={list.retry}>Try again</button>}>{list.error}</Empty>
          ) : !list.loading && products.length === 0 ? (
            <Empty icon={<SearchX size={32} />} title="Nothing here — yet" action={<Link className="ms-btn" to="/shop">Clear filters & browse all</Link>}>{current && 'count' in current && current.count === 0 ? `${current.label} is coming soon. Our sellers are stocking it now.` : 'Try a broader search, another department, or a wider price range.'}</Empty>
          ) : (
            <div className="ms-grid cols-3">{list.loading ? <CardSkeletons count={9} /> : products.map((p, i) => <ProductCard key={p.id} product={p} index={i % 3} />)}</div>
          )}

          {pages > 1 && !list.error && (
            <nav className="ms-pager" aria-label="Pagination">
              <button className="ms-btn ghost sm" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}><ArrowLeft size={15} /> Previous</button>
              <span className="ms-num" style={{ fontSize: 14.5, color: 'var(--muted)' }}>Page {page} of {pages}</span>
              <button className="ms-btn ghost sm" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>Next <ArrowRight size={15} /></button>
            </nav>
          )}
        </section>
      </div>

      {sheet && <>
        <div className="ms-scrim" onClick={() => setSheet(false)} />
        <div className="ms-sheet" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="ms-sheet-head"><h2>Filter</h2><button className="ms-icon-btn" aria-label="Close filters" autoFocus onClick={() => setSheet(false)}><X size={22} /></button></div>
          <div className="ms-sheet-body"><FilterFields idPrefix="sheet" category={category} rating={rating} priceMin={priceMin} priceMax={priceMax} set={set} /></div>
          <div className="ms-sheet-foot">
            <button className="ms-btn ghost" onClick={() => setParams(new URLSearchParams(sort !== 'popularity' ? { sort } : {}))}>Clear</button>
            <button className="ms-btn" onClick={() => setSheet(false)}>Show {list.loading ? '…' : total} {total === 1 ? 'result' : 'results'}</button>
          </div>
        </div>
      </>}
    </div>
  );
}
