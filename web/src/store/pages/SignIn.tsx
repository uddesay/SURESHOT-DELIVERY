import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';

import { photo } from '../../pages/shop/storeFormat';
import { useStore } from '../StoreContext';

export function SignIn() {
  const { signIn, register, signedIn, toast } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (signedIn && !busy) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true); setError('');
    try {
      if (mode === 'in') await signIn(f.email!.trim(), f.password!);
      else await register(f.name!.trim(), f.email!.trim(), f.password!);
      toast(mode === 'in' ? 'Welcome back' : 'Welcome to Sureshot');
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus();
    } finally { setBusy(false); }
  };

  return (
    <div className="ms-auth">
      <div className="ms-auth-art">
        <img src={photo('photo-1542838132-92c53300491e', 1200)} alt="" />
        <span className="ms-eyebrow">Sureshot members</span>
        <h2>Your orders, bag and favourite stores — in one place.</h2>
        <p>Sign in to check out faster, follow your delivery partner to the door and save the things you love.</p>
      </div>
      <div className="ms-auth-form">
        <div>
          <div>
            <h1>{mode === 'in' ? 'Welcome back' : 'Create your account'}</h1>
            <p style={{ color: 'var(--muted)', marginTop: 8 }}>{mode === 'in' ? 'New here? ' : 'Already a member? '}<button className="ms-link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); }}>{mode === 'in' ? 'Create an account' : 'Sign in'}</button></p>
          </div>
          {error && <p className="ms-alert" role="alert">{error}</p>}
          <form className="ms-form" onSubmit={submit} key={mode}>
            {mode === 'up' && <label className="ms-field">Full name<input name="name" required minLength={2} autoComplete="name" /></label>}
            <label className="ms-field">{mode === 'in' ? 'Email or phone' : 'Email'}<input name="email" type={mode === 'in' ? 'text' : 'email'} required autoComplete={mode === 'in' ? 'username' : 'email'} placeholder="you@example.com" /></label>
            <label className="ms-field">Password
              <span className="ms-pw">
                <input name="password" type={show ? 'text' : 'password'} required minLength={8} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} style={{ paddingRight: 52 }} />
                <button type="button" className="ms-icon-btn" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </span>
              {mode === 'up' && <small>At least 8 characters, with upper & lower case letters and a number.</small>}
            </label>
            <button className="ms-btn full" disabled={busy}>{busy ? <Loader2 size={18} className="ms-spin" /> : null}{mode === 'in' ? 'Sign in' : 'Create account'} {!busy && <ArrowRight size={17} />}</button>
          </form>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Selling on Sureshot? <Link to="/seller" className="ms-link" style={{ fontSize: 13 }}>Seller panel</Link> · Delivery partner? <Link to="/rider" className="ms-link" style={{ fontSize: 13 }}>Rider login</Link></p>
          <p className="ms-web-only" style={{ fontSize: 13, color: 'var(--muted)' }}>Store staff? <Link to="/login" className="ms-link" style={{ fontSize: 13 }}>Admin sign-in</Link></p>
        </div>
      </div>
    </div>
  );
}
