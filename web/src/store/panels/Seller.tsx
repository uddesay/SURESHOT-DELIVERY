import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bike, Box, ExternalLink, ImagePlus, LayoutDashboard, Loader2, Package, PackageCheck, Plus, Search, ShoppingBag, Store, Trash2 } from 'lucide-react';

import { customerEnvelope, customerRequest } from '../../pages/shop/storeApi';
import { money } from '../../pages/shop/storeFormat';
import { useStore } from '../StoreContext';
import type { Category } from '../types';
import { Empty, useLoad } from '../ui';
import { PanelFrame, type PanelConfig } from './PanelFrame';

const config: PanelConfig = {
  role: 'vendor',
  title: 'Seller panel',
  intro: 'Sign in with your seller account to list products, manage stock and pack orders.',
  nav: [
    { to: '/seller', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/seller/products', label: 'Products', icon: Package },
    { to: '/seller/orders', label: 'Orders', icon: ShoppingBag },
    { to: '/seller/store', label: 'My store', icon: Store },
  ],
  noAccess: (
    <>
      <Store size={34} />
      <h1>This account isn’t a seller yet</h1>
      <p>Apply to sell on Sureshot — our team reviews applications within 2 business days.</p>
      <Link className="ms-btn" to="/sell">Apply to sell</Link>
    </>
  ),
};

export function SellerPanel() { return <PanelFrame config={config} />; }

interface Summary { ratingAvg: number; ratingCount: number; totalOrders: number; totalUnitsSold: number; totalRevenueMinor: number; pendingPayoutMinor: number; products: Record<string, number> }
interface Profile { id: string; store_name: string; store_slug: string; status: string; description: string | null; logo_url: string | null; support_phone: string | null; support_email: string | null }
interface SellerProduct { id: string; title: string; slug: string; status: string; rejection_reason: string | null; category_name: string | null; min_price: string | null; min_mrp: string | null; stock: number; variant_count: number; image_url: string | null; sold_count: number }
interface Shipment {
  id: string; status: string; order_number: string; payment_method: string; placed_at: string; item_count: number; shipment_value_minor: string;
  shipping_address: { recipientName?: string; city?: string; postalCode?: string } | null; partner_name: string | null; partner_phone: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', pending_approval: 'Awaiting approval', active: 'Live', rejected: 'Rejected', inactive: 'Hidden', archived: 'Archived',
  pending: 'New order', processing: 'Processing', packed: 'Packed · waiting for rider', shipped: 'Handed over', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', rto: 'Returned',
};
const Status = ({ s }: { s: string }) => <span className={`pn-status s-${s}`}>{STATUS_LABEL[s] ?? s.replace(/_/g, ' ')}</span>;
const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

/** Gate for approval-only pages: pending sellers see their application status instead. */
function useProfile() { return useLoad(() => customerRequest<Profile>('/vendor/profile'), []); }

function PendingNotice({ profile }: { profile: Profile }) {
  return (
    <div className="pn-card pn-notice">
      <h2>{profile.status === 'rejected' ? 'Your application needs changes' : 'Your store is under review'}</h2>
      <p>{profile.status === 'rejected' ? 'Our team has asked for changes. Contact support for details.' : 'We’ll email you once Sureshot approves your store. You can list products after approval.'}</p>
      <Status s={profile.status} />
    </div>
  );
}

export function SellerHome() {
  const profile = useProfile();
  const summary = useLoad(() => (profile.data?.status === 'approved' ? customerRequest<Summary>('/vendor/analytics/summary') : Promise.resolve(null)), [profile.data?.status]);
  const todo = useLoad(() => (profile.data?.status === 'approved' ? customerEnvelope<Shipment[]>('/vendor/shipments?limit=5&status=pending') : Promise.resolve(null)), [profile.data?.status]);
  if (profile.loading) return <div className="pn-loading"><Loader2 className="ms-spin" /></div>;
  if (profile.error || !profile.data) return <p className="ms-alert">{profile.error}</p>;
  if (profile.data.status !== 'approved') return <PendingNotice profile={profile.data} />;
  const s = summary.data;
  const p = s?.products ?? {};
  return (
    <div className="pn-stack">
      <div className="pn-head"><div><h1>{profile.data.store_name}</h1><p>Here’s how your store is doing.</p></div><Link className="ms-btn sm" to="/seller/products/new"><Plus size={16} /> Add product</Link></div>
      <div className="pn-kpis">
        {[['Orders delivered', s?.totalOrders ?? '—'], ['Units sold', s?.totalUnitsSold ?? '—'], ['Revenue', s ? money(s.totalRevenueMinor) : '—'], ['Payout due', s ? money(s.pendingPayoutMinor) : '—'], ['Rating', s ? `${s.ratingAvg.toFixed(1)} ★ (${s.ratingCount})` : '—']].map(([label, value]) => (
          <div key={label as string} className="pn-kpi"><span>{label}</span><b>{value}</b></div>
        ))}
      </div>
      <div className="pn-grid2">
        <section className="pn-card">
          <div className="pn-card-head"><h2>Products</h2><Link to="/seller/products">Manage</Link></div>
          <ul className="pn-list">
            {[['Live', p.active], ['Awaiting approval', p.pendingApproval], ['Drafts', p.draft], ['Rejected', p.rejected]].map(([l, n]) => <li key={l as string}><span>{l}</span><b>{n ?? 0}</b></li>)}
          </ul>
        </section>
        <section className="pn-card">
          <div className="pn-card-head"><h2>New orders to pack</h2><Link to="/seller/orders">All orders</Link></div>
          {todo.loading ? <div className="ms-skel" style={{ height: 120 }} />
            : !todo.data?.data.length ? <p className="pn-muted">No new orders right now.</p>
              : <ul className="pn-list">{todo.data.data.map((o) => <li key={o.id}><span><b>{o.order_number}</b> · {o.item_count} item{o.item_count === 1 ? '' : 's'}</span><b>{money(Number(o.shipment_value_minor))}</b></li>)}</ul>}
        </section>
      </div>
    </div>
  );
}

export function SellerProducts() {
  const profile = useProfile();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const list = useLoad(() => customerEnvelope<SellerProduct[]>(`/vendor/products?limit=100${term ? `&q=${encodeURIComponent(term)}` : ''}${status ? `&status=${status}` : ''}`), [term, status]);
  if (profile.data && profile.data.status !== 'approved') return <PendingNotice profile={profile.data} />;
  return (
    <div className="pn-stack">
      <div className="pn-head"><div><h1>Products</h1><p>{list.data?.meta?.total ?? '—'} listed · new listings are reviewed by Sureshot before going live.</p></div><Link className="ms-btn sm" to="/seller/products/new"><Plus size={16} /> Add product</Link></div>
      <form className="pn-search" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }}>
        <Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your products" aria-label="Search your products" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>{['active', 'pending_approval', 'draft', 'rejected', 'inactive'].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </form>
      {list.error ? <p className="ms-alert">{list.error}</p>
        : list.loading ? <div className="ms-skel" style={{ height: 300 }} />
          : !list.data?.data.length ? <Empty icon={<Package size={30} />} title="No products yet" action={<Link className="ms-btn" to="/seller/products/new">Add your first product</Link>}>List products with photos, prices and stock.</Empty>
            : (
              <div className="pn-products">
                {list.data.data.map((p) => (
                  <Link key={p.id} to={`/seller/products/${p.id}`} className="pn-product">
                    <span className="pn-thumb">{p.image_url ? <img src={p.image_url.replace(/([?&])w=\d+/, '$1w=160')} alt="" /> : <Box size={22} />}</span>
                    <span className="pn-product-main"><b>{p.title}</b><small>{p.category_name ?? 'Uncategorised'} · {p.variant_count} variant{p.variant_count === 1 ? '' : 's'} · {p.sold_count} sold</small>{p.status === 'rejected' && p.rejection_reason && <small className="pn-err">{p.rejection_reason}</small>}</span>
                    <span className="pn-product-side"><b>{p.min_price ? money(Number(p.min_price)) : '—'}</b><small className={p.stock <= 5 ? 'pn-err' : ''}>{p.stock} in stock</small><Status s={p.status} /></span>
                  </Link>
                ))}
              </div>
            )}
    </div>
  );
}

interface VariantRow { id?: string; sku?: string; value: string; mrp: string; price: string; stock: string; currentStock?: number }
interface ProductDetail {
  id: string; title: string; status: string; category_id: string; description: string; highlights: string[]; tax_rate_bp: number;
  is_cod_available: boolean; return_window_days: number; media: { url: string }[];
  variants: { id: string; sku: string; mrp_minor: number; sale_price_minor: number; available_stock: number; options: { name: string; value: string }[] }[];
}

const rupees = (v: string) => Math.round(Number(v) * 100);
const skuFor = (title: string, value: string, i: number) => `${title.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'SKU'}${value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}${i}`;

/** Create or edit a listing. Stock on edit is set to an absolute number via inventory adjustments. */
export function SellerProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useStore();
  const editing = Boolean(id);
  const cats = useLoad(() => customerRequest<Category[]>('/categories'), []);
  const warehouses = useLoad(() => customerRequest<{ id: string }[]>('/vendor/warehouses'), []);
  const existing = useLoad(() => (id ? customerRequest<ProductDetail>(`/vendor/products/${id}`) : Promise.resolve(null)), [id]);
  const [form, setForm] = useState({ title: '', categoryId: '', description: '', highlights: '', tax: '500', cod: true, returnDays: '7', images: '' });
  const [optionName, setOptionName] = useState('');
  const [variants, setVariants] = useState<VariantRow[]>([{ value: '', mrp: '', price: '', stock: '10' }]);
  const [busy, setBusy] = useState<'' | 'draft' | 'submit'>('');
  const [error, setError] = useState('');
  // Editing a live product's details sends it back for approval; stock changes alone don't.
  const [dirty, setDirty] = useState(!editing);

  useEffect(() => {
    const p = existing.data;
    if (!p) return;
    setForm({
      title: p.title, categoryId: p.category_id, description: p.description ?? '', highlights: (p.highlights ?? []).join('\n'),
      tax: String(p.tax_rate_bp), cod: p.is_cod_available, returnDays: String(p.return_window_days), images: p.media.map((m) => m.url).join('\n'),
    });
    setOptionName(p.variants[0]?.options[0]?.name ?? '');
    setVariants(p.variants.map((v) => ({ id: v.id, sku: v.sku, value: v.options[0]?.value ?? '', mrp: String(v.mrp_minor / 100), price: String(v.sale_price_minor / 100), stock: String(v.available_stock), currentStock: v.available_stock })));
  }, [existing.data]);

  const groups = useMemo(() => (cats.data ?? []).map((c) => ({ name: c.name, options: c.children.length ? c.children : [c] })), [cats.data]);
  const imageList = form.images.split(/\s+/).map((u) => u.trim()).filter(Boolean).slice(0, 8);
  const set = (k: keyof typeof form, v: string | boolean) => { setDirty(true); setForm((f) => ({ ...f, [k]: v })); };
  const setVariant = (i: number, patch: Partial<VariantRow>) => {
    if (Object.keys(patch).some((k) => k !== 'stock')) setDirty(true);
    setVariants((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const save = async (submit: boolean) => {
    setError('');
    if (form.title.trim().length < 3) return setError('Give the product a title (at least 3 characters).');
    if (!form.categoryId) return setError('Choose a category.');
    if (!imageList.length) return setError('Add at least one photo URL.');
    if (variants.some((v) => !v.mrp || !v.price)) return setError('Every variant needs an MRP and a selling price.');
    if (variants.some((v) => rupees(v.price) > rupees(v.mrp))) return setError('Selling price can’t be higher than the MRP.');
    if (optionName && variants.some((v) => !v.value.trim())) return setError(`Fill in the ${optionName} for every variant.`);
    setBusy(submit ? 'submit' : 'draft');
    try {
      const body = {
        title: form.title.trim(), categoryId: form.categoryId, description: form.description.trim(),
        highlights: form.highlights.split('\n').map((h) => h.trim()).filter(Boolean).slice(0, 20),
        taxRateBp: Number(form.tax), isCodAvailable: form.cod, returnWindowDays: Number(form.returnDays) || 0,
        media: imageList.map((url) => ({ url, altText: form.title.trim().slice(0, 160) })),
        variants: variants.map((v, i) => ({
          sku: v.sku ?? skuFor(form.title, v.value || 'STD', i), mrpMinor: rupees(v.mrp), salePriceMinor: rupees(v.price),
          options: optionName && v.value ? { [optionName]: v.value.trim() } : {},
          ...(editing ? {} : { initialStock: Math.max(0, Number(v.stock) || 0) }),
        })),
        submit,
      };
      if (!editing) {
        const created = await customerRequest<{ id: string }>('/vendor/products', 'POST', { ...body, warehouseId: warehouses.data?.[0]?.id });
        toast(submit ? 'Sent to Sureshot for approval' : 'Saved as draft');
        navigate(`/seller/products/${created.id}`, { replace: true });
      } else {
        const draftLike = ['draft', 'rejected'].includes(existing.data?.status ?? '');
        if (dirty || (submit && draftLike)) await customerRequest(`/vendor/products/${id}`, 'PATCH', body);
        // Stock: move each variant to the number the seller typed.
        const fresh = await customerRequest<ProductDetail>(`/vendor/products/${id}`);
        const warehouseId = warehouses.data?.[0]?.id;
        for (const v of variants) {
          const live = fresh.variants.find((x) => x.sku === v.sku);
          const delta = (Number(v.stock) || 0) - (live?.available_stock ?? 0);
          if (live && warehouseId && delta !== 0) await customerRequest(`/vendor/inventory/${live.id}/${warehouseId}`, 'PATCH', { delta, reason: 'Stock updated from seller panel' });
        }
        toast(!dirty && !(submit && draftLike) ? 'Stock updated' : submit || existing.data?.status === 'active' ? 'Sent to Sureshot for approval' : 'Changes saved');
        setDirty(false);
        existing.retry();
      }
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(''); }
  };

  const submitForm = (e: FormEvent) => { e.preventDefault(); void save(true); };
  if (existing.loading || cats.loading) return <div className="pn-loading"><Loader2 className="ms-spin" /></div>;
  return (
    <form className="pn-stack" onSubmit={submitForm}>
      <div className="pn-head">
        <div><Link to="/seller/products" className="pn-back">← Products</Link><h1>{editing ? existing.data?.title : 'Add a product'}</h1>{existing.data && <Status s={existing.data.status} />}</div>
      </div>
      <div className="pn-form-grid">
        <section className="pn-card ms-form">
          <h2>Details</h2>
          <label className="ms-field">Title<input value={form.title} maxLength={255} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Cotton Kurta Set" /></label>
          <label className="ms-field">Category
            <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">Choose a category</option>
              {groups.map((g) => <optgroup key={g.name} label={g.name}>{g.options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}
            </select>
          </label>
          <label className="ms-field">Description<textarea rows={5} value={form.description} onChange={(e) => set('description', e.target.value)} /></label>
          <label className="ms-field">Highlights <small>one per line</small><textarea rows={3} value={form.highlights} onChange={(e) => set('highlights', e.target.value)} placeholder={'100% cotton\nMachine washable'} /></label>
          <div className="ms-row">
            <label className="ms-field">GST<select value={form.tax} onChange={(e) => set('tax', e.target.value)}>{[0, 300, 500, 1200, 1800, 2800].map((t) => <option key={t} value={t}>{t / 100}%</option>)}</select></label>
            <label className="ms-field">Return window (days)<input type="number" min={0} max={30} value={form.returnDays} onChange={(e) => set('returnDays', e.target.value)} /></label>
          </div>
          <label className="pn-check"><input type="checkbox" checked={form.cod} onChange={(e) => set('cod', e.target.checked)} /> Allow cash on delivery</label>
        </section>
        <section className="pn-card ms-form">
          <h2><ImagePlus size={18} /> Photos</h2>
          <label className="ms-field">Photo URLs <small>one per line, first is the cover</small><textarea rows={4} value={form.images} onChange={(e) => set('images', e.target.value)} placeholder="https://…" /></label>
          {imageList.length > 0 && <div className="pn-previews">{imageList.map((u) => <img key={u} src={u} alt="" />)}</div>}
        </section>
      </div>
      <section className="pn-card ms-form">
        <h2>Price, variants & stock</h2>
        <label className="ms-field pn-narrow">Variant type <small>leave empty for a single item, or e.g. Size, Colour, Weight</small><input value={optionName} disabled={editing} onChange={(e) => { setDirty(true); setOptionName(e.target.value); }} placeholder="Size" /></label>
        <div className="pn-variants">
          <div className="pn-variant pn-variant-head"><span>{optionName || 'Variant'}</span><span>MRP ₹</span><span>Price ₹</span><span>Stock</span><span /></div>
          {variants.map((v, i) => (
            <div key={v.id ?? i} className="pn-variant">
              <input aria-label={`${optionName || 'Variant'} ${i + 1}`} value={v.value} disabled={!optionName} placeholder={optionName ? 'e.g. M' : 'Standard'} onChange={(e) => setVariant(i, { value: e.target.value })} />
              <input aria-label="MRP" inputMode="decimal" value={v.mrp} onChange={(e) => setVariant(i, { mrp: e.target.value })} />
              <input aria-label="Selling price" inputMode="decimal" value={v.price} onChange={(e) => setVariant(i, { price: e.target.value })} />
              <input aria-label="Stock" inputMode="numeric" value={v.stock} onChange={(e) => setVariant(i, { stock: e.target.value })} />
              <button type="button" className="ms-icon-btn" aria-label="Remove variant" disabled={variants.length === 1 || Boolean(v.id)} onClick={() => setVariants((rows) => rows.filter((_, j) => j !== i))}><Trash2 size={17} /></button>
            </div>
          ))}
        </div>
        {optionName && <button type="button" className="ms-btn ghost sm pn-add" onClick={() => { setDirty(true); setVariants((rows) => [...rows, { value: '', mrp: rows[rows.length - 1]?.mrp ?? '', price: rows[rows.length - 1]?.price ?? '', stock: '10' }]); }}><Plus size={16} /> Add {optionName.toLowerCase()}</button>}
      </section>
      {editing && existing.data?.status === 'active' && dirty && <p className="pn-muted">Changing a live product’s details sends it back to Sureshot for a quick review. Stock changes go live immediately.</p>}
      {error && <p className="ms-alert" role="alert">{error}</p>}
      <div className="pn-actions">
        {editing && !dirty && !['draft', 'rejected'].includes(existing.data?.status ?? '')
          ? <button className="ms-btn" disabled={Boolean(busy)}>{busy ? <Loader2 size={17} className="ms-spin" /> : 'Update stock'}</button>
          : <>
            {existing.data?.status !== 'active' && <button type="button" className="ms-btn ghost" disabled={Boolean(busy)} onClick={() => void save(false)}>{busy === 'draft' ? <Loader2 size={17} className="ms-spin" /> : 'Save draft'}</button>}
            <button className="ms-btn" disabled={Boolean(busy)}>{busy === 'submit' ? <Loader2 size={17} className="ms-spin" /> : existing.data?.status === 'active' ? 'Save & send for review' : 'Submit for approval'}</button>
          </>}
      </div>
    </form>
  );
}

const ORDER_TABS = [['pending', 'New'], ['packed', 'Packed'], ['out_for_delivery', 'On the way'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']] as const;

export function SellerOrders() {
  const { toast } = useStore();
  const [status, setStatus] = useState<string>('pending');
  const [busy, setBusy] = useState('');
  const list = useLoad(() => customerEnvelope<Shipment[]>(`/vendor/shipments?limit=50&status=${status}`), [status]);
  const pack = async (s: Shipment) => {
    setBusy(s.id);
    try { await customerRequest(`/vendor/shipments/${s.id}/pack`, 'POST'); toast(`${s.order_number} packed — Sureshot will send a rider`); list.retry(); }
    catch (e) { toast(errorText(e), { tone: 'error' }); }
    finally { setBusy(''); }
  };
  return (
    <div className="pn-stack">
      <div className="pn-head"><div><h1>Orders</h1><p>Pack new orders — a Sureshot delivery partner collects them from your store.</p></div></div>
      <div className="ss-chips">{ORDER_TABS.map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
      {list.error ? <p className="ms-alert">{list.error}</p>
        : list.loading ? <div className="ms-skel" style={{ height: 240 }} />
          : !list.data?.data.length ? <Empty icon={<PackageCheck size={30} />} title="Nothing here">No orders in this state.</Empty>
            : (
              <div className="pn-orders">
                {list.data.data.map((s) => (
                  <article key={s.id} className="pn-card pn-order">
                    <div className="pn-order-top"><b>{s.order_number}</b><Status s={s.status} /></div>
                    <p className="pn-muted">{s.item_count} item{s.item_count === 1 ? '' : 's'} · {money(Number(s.shipment_value_minor))} · {s.payment_method === 'cod' ? 'Cash on delivery' : 'Prepaid'} · {new Date(s.placed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                    <p className="pn-muted">Deliver to {s.shipping_address?.recipientName ?? 'customer'}, {[s.shipping_address?.city, s.shipping_address?.postalCode].filter(Boolean).join(' ')}</p>
                    <div className="pn-order-foot">
                      {s.partner_name ? <span className="pn-rider"><Bike size={16} /> {s.partner_name} {s.partner_phone && <a href={`tel:${s.partner_phone}`}>{s.partner_phone}</a>}</span> : <span className="pn-muted">{['pending', 'processing', 'packed'].includes(s.status) ? 'Rider will be assigned by Sureshot' : ''}</span>}
                      {['pending', 'processing'].includes(s.status) && <button className="ms-btn sm" disabled={busy === s.id} onClick={() => void pack(s)}>{busy === s.id ? <Loader2 size={16} className="ms-spin" /> : <><PackageCheck size={16} /> Mark packed</>}</button>}
                    </div>
                  </article>
                ))}
              </div>
            )}
    </div>
  );
}

export function SellerStore() {
  const { toast } = useStore();
  const profile = useProfile();
  const [form, setForm] = useState({ description: '', logoUrl: '', supportPhone: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { const p = profile.data; if (p) setForm({ description: p.description ?? '', logoUrl: p.logo_url ?? '', supportPhone: p.support_phone ?? '' }); }, [profile.data]);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await customerRequest('/vendor/profile', 'PATCH', { description: form.description, ...(form.logoUrl ? { logoUrl: form.logoUrl } : {}), ...(form.supportPhone ? { supportPhone: form.supportPhone } : {}) });
      toast('Store profile saved'); profile.retry();
    } catch (err) { toast(errorText(err), { tone: 'error' }); }
    finally { setBusy(false); }
  };
  if (profile.loading) return <div className="pn-loading"><Loader2 className="ms-spin" /></div>;
  const p = profile.data;
  if (!p) return <p className="ms-alert">{profile.error}</p>;
  return (
    <form className="pn-stack" onSubmit={save}>
      <div className="pn-head"><div><h1>{p.store_name}</h1><p>What customers see when they search for your store.</p></div>{p.status === 'approved' && <Link className="ms-btn ghost sm" to={`/store/${p.store_slug}`}><ExternalLink size={16} /> View store</Link>}</div>
      <section className="pn-card ms-form">
        <label className="ms-field">About your store<textarea rows={4} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label className="ms-field">Logo URL<input type="url" value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://…" /></label>
        <label className="ms-field">Store phone<input type="tel" value={form.supportPhone} onChange={(e) => setForm({ ...form, supportPhone: e.target.value })} placeholder="+919876543210" /></label>
        <button className="ms-btn" disabled={busy} style={{ justifySelf: 'start' }}>{busy ? <Loader2 size={17} className="ms-spin" /> : 'Save'}</button>
      </section>
    </form>
  );
}
