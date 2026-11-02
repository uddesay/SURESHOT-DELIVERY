import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Banknote, Check, Loader2, Lock, MapPin, Plus } from 'lucide-react';

import { customerRequest, type Address, type Cart } from '../../pages/shop/storeApi';
import { money } from '../../pages/shop/storeFormat';
import { useStore } from '../StoreContext';
import { Img, useLoad } from '../ui';
import { Totals } from './CartPage';

export function Checkout() {
  const { signedIn, setCart, toast } = useStore();
  const data = useLoad(async () => {
    const [cart, addresses] = await Promise.all([customerRequest<Cart>('/cart'), customerRequest<Address[]>('/addresses')]);
    return { cart, addresses };
  }, [signedIn]);
  const [step, setStep] = useState(1);
  const [addressId, setAddressId] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [placed, setPlaced] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  useEffect(() => {
    if (!data.data) return;
    setAddressId((id) => id || data.data!.addresses[0]?.id || '');
    setAdding(data.data.addresses.length === 0);
  }, [data.data]);

  if (!signedIn) return <Navigate to="/signin" replace state={{ from: '/checkout' }} />;
  if (placed) {
    return (
      <div className="ms-wrap ms-success">
        <span className="ms-success-mark"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
        <span className="ms-eyebrow">Order confirmed</span>
        <h1 style={{ fontSize: 'clamp(32px,4vw,48px)', fontWeight: 500 }}>Thank you — it’s on its way soon.</h1>
        <p style={{ color: 'var(--muted)' }}>Order <b className="ms-num" style={{ color: 'var(--ink)' }}>{placed}</b> has been placed. Pay in cash when it arrives. We’ll keep you posted at every step.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
          <Link className="ms-btn" to="/account/orders">Track your order <ArrowRight size={17} /></Link>
          <Link className="ms-btn ghost" to="/shop">Keep shopping</Link>
        </div>
      </div>
    );
  }
  if (data.loading && !data.data) return <div className="ms-wrap ms-two" style={{ paddingTop: 40 }}><div className="ms-skel" style={{ height: 360 }} /><div className="ms-skel" style={{ height: 300 }} /></div>;
  if (data.error) return <div className="ms-wrap" style={{ paddingTop: 40 }}><p className="ms-alert">{data.error} <button className="ms-link" onClick={data.retry}>Retry</button></p></div>;
  const { cart, addresses } = data.data!;
  if (!cart.items.length) return <Navigate to="/cart" replace />;
  const address = addresses.find((a) => a.id === addressId);
  const cod = cart.items.every((i) => i.isCodAvailable !== false);

  const saveAddress = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const values = Object.fromEntries(new FormData(e.currentTarget));
      const row = await customerRequest<Address>('/addresses', 'POST', { ...values, country: 'IN', label: 'home' });
      data.setData({ cart, addresses: [...addresses, row] });
      setAddressId(row.id); setAdding(false); key.current = null;
      toast('Address saved');
    } catch (err) { setError(err instanceof Error ? err.message : 'Couldn’t save this address'); }
    finally { setBusy(false); }
  };
  const place = async () => {
    setBusy(true); setError('');
    try {
      key.current ||= crypto.randomUUID();
      const result = await customerRequest<{ orderNumber: string }>('/orders', 'POST', { addressId, paymentMethod: 'cod' }, key.current);
      key.current = null;
      setCart(await customerRequest<Cart>('/cart').catch(() => null));
      setPlaced(result.orderNumber);
      window.scrollTo({ top: 0 });
    } catch (err) { setError(err instanceof Error ? err.message : 'We couldn’t place your order'); }
    finally { setBusy(false); }
  };

  const steps = ['Delivery', 'Payment', 'Review'];
  return (
    <div className="ms-wrap">
      <header className="ms-page-head"><span className="ms-eyebrow"><Lock size={13} /> Secure checkout</span><h1>Almost yours.</h1></header>
      <div className="ms-two">
        <section className="ms-panel">
          <div className="ms-steps" aria-label="Checkout progress">
            {steps.map((s, i) => <span key={s} style={{ display: 'contents' }}>{i > 0 && <hr />}<span className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''} aria-current={step === i + 1 ? 'step' : undefined}><i>{step > i + 1 ? <Check size={14} /> : i + 1}</i>{s}</span></span>)}
          </div>
          {error && <p className="ms-alert" role="alert" style={{ marginBottom: 18 }}>{error}</p>}

          {step === 1 && (
            <div className="ms-form">
              <h2 style={{ marginBottom: 0 }}>Where should we deliver?</h2>
              {addresses.map((a) => (
                <label key={a.id} className="ms-choice">
                  <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                  <span><b>{a.recipient_name}</b> · {a.recipient_phone}<small>{a.line1}, {a.city}, {a.state} {a.postal_code}</small></span>
                </label>
              ))}
              {adding ? (
                <form className="ms-form" onSubmit={saveAddress} style={{ padding: 20, borderRadius: 16, background: '#fff', border: '1px solid var(--line)' }}>
                  <div className="ms-row">
                    <label className="ms-field">Full name<input name="recipientName" required minLength={2} autoComplete="name" /></label>
                    <label className="ms-field">Mobile number<input name="recipientPhone" required type="tel" pattern="\+?[1-9][0-9]{7,14}" placeholder="+919876543210" autoComplete="tel" /></label>
                  </div>
                  <label className="ms-field">Address<input name="line1" required minLength={3} autoComplete="address-line1" placeholder="House no., street, area" /></label>
                  <div className="ms-row">
                    <label className="ms-field">City<input name="city" required autoComplete="address-level2" /></label>
                    <label className="ms-field">State<input name="state" required autoComplete="address-level1" /></label>
                    <label className="ms-field">PIN code<input name="postalCode" required pattern="[1-9][0-9]{5}" inputMode="numeric" maxLength={6} autoComplete="postal-code" /></label>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="ms-btn" disabled={busy}>{busy ? <Loader2 size={17} className="ms-spin" /> : <MapPin size={17} />} Save address</button>
                    {addresses.length > 0 && <button type="button" className="ms-btn ghost" onClick={() => setAdding(false)}>Cancel</button>}
                  </div>
                </form>
              ) : <button className="ms-link" onClick={() => setAdding(true)}><Plus size={16} /> Add a new address</button>}
              <button className="ms-btn royal" disabled={!address || adding} onClick={() => setStep(2)} style={{ justifySelf: 'start' }}>Continue to payment <ArrowRight size={17} /></button>
            </div>
          )}

          {step === 2 && (
            <div className="ms-form">
              <h2 style={{ marginBottom: 0 }}>How would you like to pay?</h2>
              <label className="ms-choice"><input type="radio" name="pay" checked readOnly disabled={!cod} /><span><b><Banknote size={16} style={{ verticalAlign: -3 }} /> Cash on delivery</b><small>{cod ? 'Pay in cash or UPI when your order arrives.' : 'Not available for one or more items in your bag.'}</small></span></label>
              <p className="ms-alert info">Online payments are coming soon. For now, all orders are cash on delivery.</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="ms-btn ghost" onClick={() => setStep(1)}><ArrowLeft size={17} /> Back</button>
                <button className="ms-btn royal" disabled={!cod} onClick={() => setStep(3)}>Review order <ArrowRight size={17} /></button>
              </div>
            </div>
          )}

          {step === 3 && address && (
            <div className="ms-form">
              <h2 style={{ marginBottom: 0 }}>Review & place order</h2>
              <div className="ms-choice" style={{ cursor: 'default' }}><MapPin size={18} /><span><b>{address.recipient_name}</b><small>{address.line1}, {address.city}, {address.state} {address.postal_code}</small></span><button className="ms-link" style={{ marginLeft: 'auto' }} onClick={() => setStep(1)}>Change</button></div>
              <div>
                {cart.items.map((i) => (
                  <div key={i.itemId} style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', gap: 14, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                    <div className="ms-line-img" style={{ borderRadius: 10 }}><Img src={i.image} alt="" /></div>
                    <span style={{ fontSize: 14 }}>{i.title}<small style={{ display: 'block', color: 'var(--muted)' }}>Qty {i.quantity}</small></span>
                    <b className="ms-num" style={{ fontSize: 14 }}>{money(i.unitPriceMinor * i.quantity)}</b>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="ms-btn ghost" onClick={() => setStep(2)}><ArrowLeft size={17} /> Back</button>
                <button className="ms-btn orange" disabled={busy} onClick={place}>{busy ? <><Loader2 size={17} className="ms-spin" /> Placing order…</> : <>Place order · {money(cart.totals.totalMinor)}</>}</button>
              </div>
            </div>
          )}
        </section>
        <aside className="ms-panel ms-summary" aria-label="Order summary">
          <h2>Order summary</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>{cart.items.length} {cart.items.length === 1 ? 'item' : 'items'} · <Link to="/cart" className="ms-link" style={{ fontSize: 14 }}>Edit bag</Link></p>
          <Totals cart={cart} />
        </aside>
      </div>
    </div>
  );
}
