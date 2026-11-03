import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, Heart, Loader2, PackageX, Plus, RotateCcw, ShieldCheck, ShoppingBag, Store, Truck, Zap } from 'lucide-react';

import { customerRequest, type Variant } from '../../pages/shop/storeApi';
import { money } from '../../pages/shop/storeFormat';
import { useStore } from '../StoreContext';
import type { Product, ProductDetail } from '../types';
import { CardSkeletons, Empty, Img, Price, ProductCard, Stars, Stepper, useLoad } from '../ui';

const clean = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export function ProductPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { addVariant, requireSignIn, favoriteIds, toggleFavorite, toast } = useStore();
  const { data, loading, error, retry } = useLoad(() => customerRequest<ProductDetail>(`/products/${encodeURIComponent(slug)}`), [slug]);
  const related = useLoad(() => customerRequest<Product[]>(`/products/${encodeURIComponent(slug)}/related`).catch(() => [] as Product[]), [slug]);
  const [image, setImage] = useState(0);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const buyRef = useRef<HTMLDivElement>(null);
  const [buyVisible, setBuyVisible] = useState(true);
  // The sticky mobile bar only appears once the in-page buy controls scroll out of view.
  useEffect(() => {
    const el = buyRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setBuyVisible(Boolean(e?.isIntersecting)));
    io.observe(el);
    return () => io.disconnect();
  });

  // Seed data often stores one photo several times with different crops; show each photo once.
  const gallery = useMemo(() => {
    const seen = new Set<string>();
    return (data?.media ?? []).filter((m) => { const key = m.url.split('?')[0]!; if (seen.has(key)) return false; seen.add(key); return true; });
  }, [data]);
  const variants = useMemo(() => (data?.variants ?? []).filter((v) => v.is_active), [data]);
  const optionNames = useMemo(() => [...new Set(variants.flatMap((v) => v.options.map((o) => o.name)))], [variants]);
  useEffect(() => {
    setImage(0); setQty(1); setDone(false);
    const first = variants.find((v) => v.in_stock) ?? variants[0];
    setPicked(Object.fromEntries(first?.options.map((o) => [o.name, o.value]) ?? []));
  }, [variants]);
  useEffect(() => { if (data) document.title = `${data.title} — Sureshot`; return () => { document.title = 'Sureshot'; }; }, [data]);

  const matches = (v: Variant, sel: Record<string, string>) => optionNames.every((n) => !sel[n] || v.options.find((o) => o.name === n)?.value === sel[n]);
  const variant = variants.length === 1 ? variants[0] : variants.find((v) => optionNames.every((n) => v.options.find((o) => o.name === n)?.value === picked[n]));
  const stock = variant?.available_stock ?? 0;

  if (error) return <div className="ms-wrap" style={{ paddingTop: 48 }}><Empty icon={<PackageX size={32} />} title="This product isn’t available" action={<div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}><button className="ms-btn ghost" onClick={retry}>Try again</button><Link className="ms-btn" to="/shop">Keep browsing</Link></div>}>{error}</Empty></div>;
  if (loading || !data) {
    return <div className="ms-wrap ms-pdp" aria-busy><div className="ms-skel" style={{ aspectRatio: '4 / 5', borderRadius: 28 }} /><div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>{[30, 80, 60, 40, 100].map((w, i) => <div key={i} className="ms-skel" style={{ height: i === 1 ? 44 : 18, width: `${w}%` }} />)}</div></div>;
  }

  const saved = favoriteIds.includes(data.id);
  const asProduct: Product = { id: data.id, title: data.title, slug: data.slug, category_id: '', min_price: variant?.sale_price_minor ?? 0, min_mrp: variant?.mrp_minor ?? 0, rating_avg: data.rating_avg, rating_count: data.rating_count, image: data.media[0] ? { url: data.media[0].url } : null };
  const add = async (el: Element | null) => {
    if (!variant) { toast('Choose an option first', { tone: 'error' }); return; }
    setBusy(true);
    try { await addVariant(variant.id, qty, el); setDone(true); window.setTimeout(() => setDone(false), 2200); }
    catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t add to bag', { tone: 'error' }); }
    finally { setBusy(false); }
  };
  const buyNow = () => {
    if (!variant) { toast('Choose an option first', { tone: 'error' }); return; }
    if (!requireSignIn()) return;
    navigate(`/checkout?buy=${variant.id}&qty=${qty}`);
  };
  const buyLabel = busy ? <><Loader2 size={18} className="ms-spin" /> Adding…</> : done ? <><Check size={18} /> Added to bag</> : <><ShoppingBag size={18} /> Add to bag · {money((variant?.sale_price_minor ?? 0) * qty)}</>;
  const specGroups = data.specifications?.length ? data.specifications : [];

  return (
    <>
      <div className="ms-wrap">
        <nav className="ms-crumbs" aria-label="Breadcrumb" style={{ padding: '24px 0 18px' }}><Link to="/">Home</Link><span>/</span><Link to={`/shop?category=${data.category_slug}`}>{data.category_name}</Link><span>/</span><span aria-current="page">{data.title}</span></nav>
        <div className="ms-pdp">
          <div className="ms-gallery">
            {gallery.length > 1 && <div className="ms-thumbs">{gallery.map((m, i) => <button key={m.url + i} aria-pressed={i === image} aria-label={`Show image ${i + 1}`} onClick={() => setImage(i)}><Img src={m.url} alt="" /></button>)}</div>}
            <div className="ms-gallery-main" style={gallery.length > 1 ? undefined : { gridColumn: '1 / -1' }}><Img key={image} src={gallery[image]?.url} alt={gallery[image]?.alt_text || data.title} eager sizes="(min-width: 900px) 50vw, 100vw" /></div>
          </div>

          <div className="ms-pdp-info">
            <div>
              <span className="ms-eyebrow">{data.brand_name ?? data.category_name}</span>
              <h1 style={{ marginTop: 12 }}>{data.title}</h1>
              <div className="ms-pdp-meta" style={{ marginTop: 12 }}><Stars value={data.rating_avg} count={data.rating_count} />{data.sold_count > 0 && <span>{data.sold_count} sold</span>}<span><Store size={14} style={{ verticalAlign: -2 }} /> {data.vendor_name}</span></div>
            </div>
            <div className="ms-pdp-price"><Price price={variant?.sale_price_minor ?? 0} mrp={variant?.mrp_minor} /><small>Inclusive of all taxes</small></div>

            {optionNames.map((name) => {
              const values = [...new Set(variants.flatMap((v) => v.options.filter((o) => o.name === name).map((o) => o.value)))];
              return (
                <div className="ms-options" key={name}>
                  <span>{name}: <span style={{ fontWeight: 400, color: 'var(--muted)' }}>{picked[name] ?? 'Choose'}</span></span>
                  <div role="group" aria-label={name}>
                    {values.map((value) => {
                      const available = variants.some((v) => v.in_stock && matches(v, { ...picked, [name]: value }));
                      return <button key={value} className="ms-opt" aria-pressed={picked[name] === value} disabled={!available} onClick={() => { setPicked((p) => ({ ...p, [name]: value })); setQty(1); }}>{value}</button>;
                    })}
                  </div>
                </div>
              );
            })}

            <span className={`ms-stock${!variant || !variant.in_stock ? ' out' : stock <= 5 ? ' low' : ''}`}>
              {!variant ? 'Choose an available option' : !variant.in_stock ? 'Out of stock' : stock <= 5 ? `Only ${stock} left — order soon` : 'In stock, ready to ship'}
            </span>

            <div className="ms-buy" ref={buyRef}>
              <Stepper label="Quantity" value={qty} min={1} max={Math.max(1, Math.min(stock, 10))} onChange={setQty} disabled={!variant?.in_stock} />
              <button className={`ms-btn${done ? ' is-done' : ''}`} disabled={busy || !variant?.in_stock} onClick={(e) => add(e.currentTarget)} aria-live="polite">{buyLabel}</button>
              <button className="ms-btn orange" disabled={busy || !variant?.in_stock} onClick={buyNow}><Zap size={18} /> Buy now</button>
              <button className="ms-icon-btn" style={{ boxShadow: 'var(--raise-sm)', width: 48, height: 48 }} aria-pressed={saved} aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'} onClick={() => toggleFavorite(asProduct)}>
                <Heart size={20} style={saved ? { fill: 'var(--orange)', color: 'var(--orange)' } : undefined} />
              </button>
            </div>

            <div className="ms-promises">
              <div><Truck size={20} /><b>Free delivery</b>above ₹499</div>
              <div><RotateCcw size={20} /><b>{data.is_returnable ? `${data.return_window_days}-day returns` : 'Non-returnable'}</b>{data.is_returnable ? 'hassle-free' : 'final sale'}</div>
              <div><ShieldCheck size={20} /><b>{data.is_cod_available ? 'Cash on delivery' : 'Secure payment'}</b>pay at your door</div>
            </div>

            <div className="ms-accordion">
              <details open><summary>Description <Plus size={18} /></summary><div className="body"><p>{clean(data.description) || 'No description provided by the seller.'}</p></div></details>
              {data.highlights?.length > 0 && <details><summary>Highlights <Plus size={18} /></summary><div className="body"><ul>{data.highlights.map((h) => <li key={h}>{h}</li>)}</ul></div></details>}
              {specGroups.length > 0 && <details><summary>Specifications <Plus size={18} /></summary><div className="body"><dl className="ms-spec">{specGroups.map((s, i) => <Fragment key={i}><dt>{s.spec_key}</dt><dd>{s.spec_value}</dd></Fragment>)}</dl></div></details>}
              <details><summary>Sold by {data.vendor_name} <Plus size={18} /></summary><div className="body"><p>A verified Sureshot seller. Every order is packed by the seller and tracked end-to-end, with support from our team.</p></div></details>
            </div>
          </div>
        </div>
      </div>

      {(related.loading || (related.data?.length ?? 0) > 0) && <section className="ms-wrap ms-section" aria-labelledby="related-title">
        <div className="ms-section-head"><div><span className="ms-eyebrow">You may also like</span><h2 id="related-title">More in {data.category_name}</h2></div></div>
        <div className="ms-rail">{related.loading ? <CardSkeletons count={4} /> : (related.data ?? []).map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}</div>
      </section>}

      <div className={`ms-sticky-buy${buyVisible ? ' away' : ''}`} aria-hidden={buyVisible || undefined}>
        <Price price={variant?.sale_price_minor ?? 0} />
        <button className={`ms-btn ghost${done ? ' is-done' : ''}`} disabled={busy || !variant?.in_stock} onClick={(e) => add(e.currentTarget)}>{busy ? 'Adding…' : done ? 'Added' : 'Add to bag'}</button>
        <button className="ms-btn orange" disabled={busy || !variant?.in_stock} onClick={buyNow}>Buy now</button>
      </div>
    </>
  );
}
