import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bike, CheckCircle2, Clock, Loader2, Wallet } from 'lucide-react';

import { customerRequest } from '../../pages/shop/storeApi';

const PERKS = [
  { icon: Wallet, title: 'Earn every day', text: 'Per-delivery earnings, paid out regularly.' },
  { icon: Clock, title: 'Flexible hours', text: 'Go online when you want, offline when you don’t.' },
  { icon: Bike, title: 'Use your own vehicle', text: 'Bike, scooter, cycle or van — all welcome.' },
];

const VEHICLES: [string, string][] = [['bike', 'Motorbike'], ['scooter', 'Scooter'], ['cycle', 'Cycle'], ['car', 'Car'], ['van', 'Van / mini-truck']];

/** Public application form. Nothing is created until the Sureshot team approves it. */
export function Deliver() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (data.password !== data.confirm) { setFieldErrors({ confirm: 'The two passwords don’t match' }); return; }
    setBusy(true); setError(''); setFieldErrors({});
    try {
      await customerRequest('/delivery/apply', 'POST', {
        fullName: data.fullName, phone: data.phone, email: data.email || undefined, city: data.city, vehicleType: data.vehicleType,
        vehicleNumber: data.vehicleNumber || undefined, licenseNumber: data.licenseNumber || undefined, about: data.about || undefined, password: data.password,
      });
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We couldn’t send your application. Please try again.');
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="ms-wrap dl-page">
        <div className="dl-done">
          <CheckCircle2 size={56} />
          <h1>Application received</h1>
          <p>Thanks! The Sureshot team will review it and contact you within 2 business days. Once approved, sign in with your mobile number and the password you just set.</p>
          <div><Link className="ms-btn" to="/rider">Rider sign-in <ArrowRight size={17} /></Link><Link className="ms-btn ghost" to="/">Back to shop</Link></div>
        </div>
      </div>
    );
  }

  return (
    <div className="ms-wrap dl-page">
      <header className="dl-hero">
        <span className="ss-pill light"><Bike size={14} /> Delivery partner</span>
        <h1>Deliver with Sureshot</h1>
        <p>Join our delivery fleet — pick up from local stores and deliver to customers in your city.</p>
        <ul className="dl-perks">{PERKS.map(({ icon: Icon, title, text }) => <li key={title}><span><Icon size={20} /></span><div><b>{title}</b><small>{text}</small></div></li>)}</ul>
      </header>

      <form className="ms-panel ms-form dl-form" onSubmit={submit} noValidate>
        <h2>Apply now</h2>
        {error && <p className="ms-alert" role="alert">{error}</p>}
        <label className="ms-field">Full name<input name="fullName" required minLength={2} maxLength={120} autoComplete="name" /></label>
        <label className="ms-field"><span>Mobile number</span><input name="phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" /><small>This is your sign-in ID.</small></label>
        <div className="ms-row">
          <label className="ms-field">City<input name="city" required minLength={2} maxLength={80} autoComplete="address-level2" /></label>
          <label className="ms-field">Vehicle<select name="vehicleType" defaultValue="bike">{VEHICLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </div>
        <div className="ms-row">
          <label className="ms-field"><span>Vehicle number <small>optional</small></span><input name="vehicleNumber" maxLength={20} autoCapitalize="characters" placeholder="MH01 AB 1234" /></label>
          <label className="ms-field"><span>Driving licence no. <small>optional</small></span><input name="licenseNumber" maxLength={30} autoCapitalize="characters" /></label>
        </div>
        <label className="ms-field"><span>Email <small>optional</small></span><input name="email" type="email" inputMode="email" autoComplete="email" /></label>
        <label className="ms-field"><span>Anything we should know? <small>optional</small></span><textarea name="about" rows={3} maxLength={500} placeholder="Previous delivery experience, areas you can cover…" /></label>
        <div className="ms-row">
          <label className="ms-field">Create password<input name="password" type="password" required minLength={8} autoComplete="new-password" /><small>8+ characters with upper &amp; lower case and a number.</small></label>
          <label className="ms-field">Confirm password<input name="confirm" type="password" required autoComplete="new-password" />{fieldErrors.confirm && <small className="dl-err">{fieldErrors.confirm}</small>}</label>
        </div>
        <button className="ms-btn full" disabled={busy}>{busy ? <><Loader2 size={17} className="ms-spin" /> Sending…</> : <>Submit application <ArrowRight size={17} /></>}</button>
        <p className="dl-foot">Already approved? <Link to="/rider" className="ms-link">Rider sign-in</Link></p>
      </form>
    </div>
  );
}
