import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, FileQuestion, Heart, LifeBuoy, Loader2, MessageCircle, Phone, Send, Store } from 'lucide-react';

import { customerRequest } from '../../pages/shop/storeApi';
import { SUPPORT_PHONE } from '../brand';
import { useStore } from '../StoreContext';
import { Empty, ProductCard, useLoad } from '../ui';

export function Wishlist() {
  const { signedIn, wishlist } = useStore();
  return (
    <div className="ms-wrap">
      <header className="ms-page-head"><span className="ms-eyebrow">Saved for later</span><h1>Your wishlist</h1>{signedIn && <p>{wishlist.length} {wishlist.length === 1 ? 'item' : 'items'} you love</p>}</header>
      {!signedIn ? <Empty icon={<Heart size={30} />} title="Sign in to see your wishlist" action={<Link className="ms-btn" to="/signin" state={{ from: '/wishlist' }}>Sign in <ArrowRight size={17} /></Link>}>Tap the heart on anything you like and it will be saved here, across your devices.</Empty>
        : !wishlist.length ? <Empty icon={<Heart size={30} />} title="Nothing saved yet" action={<Link className="ms-btn" to="/shop">Find something you love</Link>}>Tap the heart on any product to keep it here.</Empty>
          : <div className="ms-grid" style={{ paddingBottom: 40 }}>{wishlist.map((p, i) => <ProductCard key={p.id} product={p} index={i % 4} />)}</div>}
    </div>
  );
}

export function Sell() {
  const { signedIn, toast } = useStore();
  const status = useLoad(async () => {
    if (!signedIn) return null;
    const me = await customerRequest<{ roles?: string[] }>('/auth/me');
    return me.roles?.includes('vendor') ? (await customerRequest<{ status: string }>('/vendor/profile')).status : null;
  }, [signedIn]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const apply = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true); setError('');
    try {
      await customerRequest('/vendor/register', 'POST', {
        storeName: f.storeName, description: f.description, supportEmail: f.supportEmail, supportPhone: f.supportPhone,
        ...(f.gstin ? { gstin: f.gstin.toUpperCase() } : {}), ...(f.pan ? { pan: f.pan.toUpperCase() } : {}), businessType: f.businessType,
        warehouse: { name: `${f.storeName} warehouse`, line1: f.line1, city: f.city, state: f.state, postalCode: f.postalCode },
      });
      status.setData('pending');
      toast('Application received — we’ll review it shortly');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { setError(err instanceof Error ? err.message : 'We couldn’t submit your application'); }
    finally { setBusy(false); }
  };

  return (
    <div className="ms-wrap">
      <header className="ms-page-head"><span className="ms-eyebrow"><Store size={13} /> Sell on Sureshot</span><h1>Open your store.</h1><p>Tell us about your business. Every application is reviewed by our marketplace team before your store goes live.</p></header>
      <div className="ms-two">
        <section className="ms-panel">
          {!signedIn ? <Empty icon={<Store size={30} />} title="Sign in to apply" action={<Link className="ms-btn" to="/signin" state={{ from: '/sell' }}>Sign in or create account</Link>}>Your seller application is linked to your Sureshot account.</Empty>
            : status.loading ? <div className="ms-skel" style={{ height: 320 }} />
              : status.data ? <Empty icon={<CheckCircle2 size={32} />} title={status.data === 'approved' ? 'Your store is live' : 'Application under review'} action={<Link className="ms-btn" to="/seller">Open seller panel</Link>}>{status.data === 'approved' ? 'Manage products, orders and payouts from your seller panel.' : 'We review new sellers within 2 business days and will notify you as soon as you’re approved.'}</Empty>
                : (
                  <form className="ms-form" onSubmit={apply}>
                    {error && <p className="ms-alert" role="alert">{error}</p>}
                    <label className="ms-field">Store name<input name="storeName" required minLength={2} maxLength={120} placeholder="e.g. Sharma Textiles" /></label>
                    <label className="ms-field">What do you sell?<textarea name="description" maxLength={2000} placeholder="Mobiles, fashion, groceries…" /></label>
                    <div className="ms-row">
                      <label className="ms-field">Business email<input name="supportEmail" type="email" required autoComplete="email" /></label>
                      <label className="ms-field">Business phone<input name="supportPhone" type="tel" required pattern="\+?[1-9][0-9]{7,14}" placeholder="+919876543210" /></label>
                    </div>
                    <div className="ms-row">
                      <label className="ms-field">GSTIN <small>Optional</small><input name="gstin" maxLength={15} pattern="[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z]Z[0-9A-Za-z]" placeholder="27ABCDE1234F1Z5" /></label>
                      <label className="ms-field">PAN <small>Optional</small><input name="pan" maxLength={10} pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]" placeholder="ABCDE1234F" /></label>
                    </div>
                    <label className="ms-field">Business type<select name="businessType" defaultValue="proprietorship"><option value="individual">Individual</option><option value="proprietorship">Proprietorship</option><option value="partnership">Partnership</option><option value="llp">LLP</option><option value="private_limited">Private limited</option></select></label>
                    <label className="ms-field">Pickup address<input name="line1" required minLength={3} placeholder="Shop / warehouse address" /></label>
                    <div className="ms-row">
                      <label className="ms-field">City<input name="city" required minLength={2} /></label>
                      <label className="ms-field">State<input name="state" required minLength={2} /></label>
                      <label className="ms-field">PIN code<input name="postalCode" required pattern="[1-9][0-9]{5}" maxLength={6} inputMode="numeric" /></label>
                    </div>
                    <button className="ms-btn royal" disabled={busy} style={{ justifySelf: 'start' }}>{busy ? <><Loader2 size={17} className="ms-spin" /> Submitting…</> : <>Submit application <ArrowRight size={17} /></>}</button>
                  </form>
                )}
        </section>
        <aside className="ms-panel ms-summary">
          <h2>How it works</h2>
          <ol className="ms-timeline">
            {[['Apply', 'Share your business and pickup details.'], ['Verification', 'We review KYC within 2 business days.'], ['List products', 'Add your catalogue with photos and stock.'], ['Get paid', 'Regular payouts, minus a transparent commission.']].map(([t, s], i) => <li key={t} className={i === 0 ? 'now' : ''}><i>{i + 1}</i><span><b>{t}</b><small>{s}</small></span></li>)}
          </ol>
        </aside>
      </div>
    </div>
  );
}

export function Help() {
  const { slug = '' } = useParams();
  const { signedIn, toast } = useStore();
  const page = useLoad(() => (slug === 'contact' ? Promise.resolve(null) : customerRequest<{ title: string; body: string }>(`/cms/pages/${slug}`)), [slug]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (slug === 'contact') {
    const submit = async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      setBusy(true);
      try { await customerRequest('/support/tickets', 'POST', { subject: data.get('subject'), message: data.get('message') }); setSent(true); }
      catch (err) { toast(err instanceof Error ? err.message : 'We couldn’t send your message', { tone: 'error' }); }
      finally { setBusy(false); }
    };
    return (
      <div className="ms-wrap">
        <header className="ms-page-head"><span className="ms-eyebrow"><LifeBuoy size={13} /> Support</span><h1>How can we help?</h1><p>Questions about an order, a delivery or a seller — send us a message and we’ll reply within one business day.</p></header>
        <div style={{ maxWidth: 640, paddingBottom: 40, display: 'grid', gap: 20 }}>
          {SUPPORT_PHONE && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <a className="ms-btn" href={SUPPORT_PHONE.tel}><Phone size={17} /> Call {SUPPORT_PHONE.display}</a>
            <a className="ms-btn ghost" href={SUPPORT_PHONE.whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={17} /> WhatsApp us</a>
          </div>}
          {!signedIn ? <Empty icon={<LifeBuoy size={30} />} title="Sign in to contact support" action={<Link className="ms-btn" to="/signin" state={{ from: '/help/contact' }}>Sign in</Link>}>So we can look up your orders and reply to you directly.</Empty>
            : sent ? <Empty icon={<CheckCircle2 size={32} />} title="Message received" action={<Link className="ms-btn" to="/account">Back to your account</Link>}>Thanks — our team will reply by email shortly.</Empty>
              : (
                <form className="ms-panel ms-form" onSubmit={submit}>
                  <label className="ms-field">Subject<input name="subject" required minLength={3} maxLength={200} placeholder="e.g. Where is my order?" /></label>
                  <label className="ms-field">Message<textarea name="message" required minLength={10} maxLength={5000} rows={6} placeholder="Include your order number if it’s about an order." /></label>
                  <button className="ms-btn royal" disabled={busy} style={{ justifySelf: 'start' }}>{busy ? <Loader2 size={17} className="ms-spin" /> : <Send size={17} />} Send message</button>
                </form>
              )}
        </div>
      </div>
    );
  }
  return (
    <div className="ms-wrap">
      {page.error ? <div style={{ paddingTop: 40 }}><Empty icon={<FileQuestion size={30} />} title="Page not found" action={<Link className="ms-btn" to="/">Go home</Link>}>{page.error}</Empty></div> : (
        <>
          <header className="ms-page-head"><span className="ms-eyebrow">Help</span><h1>{page.data?.title ?? <span className="ms-skel" style={{ display: 'inline-block', width: 320, height: 48 }} />}</h1></header>
          {page.data && <article className="ms-prose">{page.data.body.replace(/<[^>]*>/g, '').split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}</article>}
        </>
      )}
    </div>
  );
}
