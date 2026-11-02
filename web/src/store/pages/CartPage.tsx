import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Lock, ShoppingBag, Tag, Trash2, X } from 'lucide-react';

import { customerRequest, type Cart } from '../../pages/shop/storeApi';
import { money } from '../../pages/shop/storeFormat';
import { useStore } from '../StoreContext';
import { Empty, Img, Stepper } from '../ui';

export function Totals({ cart }: { cart: Cart }) {
  const t = cart.totals;
  return (
    <>
      <div className="ms-sum-row"><span>Subtotal</span><span>{money(t.subtotalMinor)}</span></div>
      <div className="ms-sum-row"><span>Delivery</span><span>{t.shippingMinor ? money(t.shippingMinor) : 'Free'}</span></div>
      {t.discountMinor > 0 && <div className="ms-sum-row save"><span>Savings{t.coupon ? ` (${t.coupon.code})` : ''}</span><span>−{money(t.discountMinor)}</span></div>}
      <div className="ms-sum-row total"><span>Total <small style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 13 }}>incl. taxes</small></span><span>{money(t.totalMinor)}</span></div>
    </>
  );
}

export function CartPage() {
  const { cart, setCart, signedIn, toast } = useStore();
  const [loading, setLoading] = useState(signedIn);
  const [pending, setPending] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    customerRequest<Cart>('/cart').then(setCart).catch(() => undefined).finally(() => setLoading(false));
  }, [signedIn, setCart]);

  const update = async (itemId: string, quantity: number) => {
    setPending(itemId);
    try {
      if (quantity === 0) { setLeaving(itemId); await new Promise((r) => setTimeout(r, 220)); }
      setCart(await customerRequest<Cart>(`/cart/items/${itemId}`, quantity === 0 ? 'DELETE' : 'PATCH', quantity === 0 ? undefined : { quantity }));
      if (quantity === 0) toast('Removed from your bag');
    } catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t update your bag', { tone: 'error' }); }
    finally { setPending(null); setLeaving(null); }
  };
  const coupon = async (e?: FormEvent) => {
    e?.preventDefault();
    setCouponBusy(true);
    try {
      const next = await customerRequest<Cart>('/cart/coupon', cart?.totals.coupon ? 'DELETE' : 'POST', cart?.totals.coupon ? undefined : { code: code.trim().toUpperCase() });
      setCart(next);
      if (next.totals.couponError) toast(next.totals.couponError, { tone: 'error' });
      else toast(next.totals.coupon ? `Code ${next.totals.coupon.code} applied` : 'Coupon removed');
      setCode('');
    } catch (err) { toast(err instanceof Error ? err.message : 'That code didn’t work', { tone: 'error' }); }
    finally { setCouponBusy(false); }
  };

  const head = <header className="ms-page-head"><span className="ms-eyebrow">Your bag</span><h1>{cart?.items.length ? `${cart.items.reduce((s, i) => s + i.quantity, 0)} items, ready when you are` : 'Your bag'}</h1></header>;

  if (!signedIn) return <div className="ms-wrap">{head}<Empty icon={<ShoppingBag size={32} />} title="Sign in to see your bag" action={<Link className="ms-btn" to="/signin" state={{ from: '/cart' }}>Sign in <ArrowRight size={17} /></Link>}>Your bag is saved to your account, so it follows you across devices.</Empty></div>;
  if (loading && !cart) return <div className="ms-wrap">{head}<div className="ms-two"><div style={{ display: 'grid', gap: 18 }}>{[0, 1, 2].map((i) => <div key={i} className="ms-skel" style={{ height: 130 }} />)}</div><div className="ms-skel" style={{ height: 260 }} /></div></div>;
  if (!cart?.items.length) return <div className="ms-wrap">{head}<Empty icon={<ShoppingBag size={32} />} title="Your bag is empty" action={<Link className="ms-btn" to="/shop">Discover something good <ArrowRight size={17} /></Link>}>Pieces you add will wait for you here.</Empty></div>;

  const blocked = cart.items.some((i) => !i.purchasable || i.quantity > i.availableStock);
  return (
    <div className="ms-wrap">
      {head}
      <div className="ms-two">
        <section aria-label="Items in your bag">
          {cart.items.map((i) => (
            <article key={i.itemId} className={`ms-line${leaving === i.itemId ? ' leaving' : ''}`}>
              <div className="ms-line-img"><Img src={i.image} alt={i.title} /></div>
              <div>
                <h3>{i.title}</h3>
                <p className="meta">{money(i.unitPriceMinor)} each</p>
                {!i.purchasable ? <p className="meta" style={{ color: 'var(--err)' }}>No longer available — please remove it</p>
                  : i.quantity > i.availableStock ? <p className="meta" style={{ color: 'var(--err)' }}>Only {i.availableStock} left — reduce the quantity</p>
                    : i.availableStock <= 5 ? <p className="meta" style={{ color: '#b45309' }}>Only {i.availableStock} left</p> : null}
                <div className="controls">
                  <Stepper label={`Quantity of ${i.title}`} value={i.quantity} min={1} max={Math.max(i.quantity, Math.min(i.availableStock, 10))} disabled={pending === i.itemId} onChange={(n) => update(i.itemId, n)} />
                  <button className="ms-link" style={{ color: 'var(--muted)' }} disabled={pending === i.itemId} onClick={() => update(i.itemId, 0)}><Trash2 size={15} /> Remove</button>
                </div>
              </div>
              <span className="amount">{money(i.unitPriceMinor * i.quantity)}</span>
            </article>
          ))}
        </section>
        <aside className="ms-panel ms-summary" aria-label="Order summary">
          <h2>Summary</h2>
          {cart.totals.coupon ? (
            <div className="ms-alert ok" style={{ alignItems: 'center' }}><Tag size={16} /><span style={{ flex: 1 }}><b>{cart.totals.coupon.code}</b> applied</span><button className="ms-icon-btn" style={{ width: 34, height: 34 }} aria-label="Remove coupon" disabled={couponBusy} onClick={() => coupon()}><X size={16} /></button></div>
          ) : (
            <form className="ms-coupon-form ms-field" onSubmit={coupon}>
              <input aria-label="Coupon code" placeholder="Coupon code" value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="ms-btn ghost sm" style={{ minHeight: 46 }} disabled={!code.trim() || couponBusy}>Apply</button>
            </form>
          )}
          <Totals cart={cart} />
          {blocked && <p className="ms-alert">Some items need attention before checkout.</p>}
          {blocked ? <button className="ms-btn royal full" disabled>Checkout securely</button> : <Link className="ms-btn royal full" to="/checkout"><Lock size={16} /> Checkout securely</Link>}
          <Link to="/shop" className="ms-link" style={{ justifySelf: 'center' }}>Continue shopping</Link>
        </aside>
      </div>
    </div>
  );
}
