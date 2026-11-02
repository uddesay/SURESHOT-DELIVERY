import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { ArrowLeft, Loader2, LogOut, type LucideIcon } from 'lucide-react';

import { StoreProvider, useStore } from '../StoreContext';
import { Toasts } from '../StoreLayout';
import '../sureshot.css';
import '../ss.css';
import './panels.css';

export interface PanelConfig {
  role: 'vendor' | 'delivery_partner';
  title: string;
  /** Shown on the sign-in card. */
  intro: string;
  nav: { to: string; label: string; icon: LucideIcon; end?: boolean }[];
  /** Shown to signed-in users who lack the role. */
  noAccess: ReactNode;
}

function SignInCard({ config }: { config: PanelConfig }) {
  const { signIn, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    try { await signIn(String(data.get('identifier')).trim(), String(data.get('password'))); }
    catch (err) { toast(err instanceof Error ? err.message : 'Sign-in failed', { tone: 'error' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="pn-auth">
      <form className="ms-panel ms-form pn-auth-card" onSubmit={submit}>
        <img src="/brand/logo.png" alt="Sureshot Delivery" className="pn-auth-logo" />
        <h1>{config.title}</h1>
        <p>{config.intro}</p>
        <label className="ms-field">Email or mobile number<input name="identifier" required autoComplete="username" /></label>
        <label className="ms-field">Password<input name="password" type="password" required autoComplete="current-password" /></label>
        <button className="ms-btn full" disabled={busy}>{busy ? <Loader2 size={17} className="ms-spin" /> : 'Sign in'}</button>
        <Link to="/" className="pn-back"><ArrowLeft size={15} /> Back to the shop</Link>
      </form>
    </div>
  );
}

function Frame({ config }: { config: PanelConfig }) {
  const { signedIn, user, signOut } = useStore();
  const allowed = user?.roles?.includes(config.role);
  return (
    <div className="ms pn">
      <header className="pn-top">
        <Link to="/" className="pn-logo" aria-label="Sureshot shop"><img src="/brand/icon.png" alt="" width={34} height={34} /><span>{config.title}</span></Link>
        {signedIn && user && <div className="pn-user"><span>{user.full_name}</span><button className="ms-icon-btn" aria-label="Sign out" onClick={() => void signOut({ stay: true })}><LogOut size={19} /></button></div>}
      </header>
      {!signedIn ? <SignInCard config={config} />
        : !user ? <div className="pn-loading"><Loader2 className="ms-spin" /></div>
          : !allowed ? <div className="pn-auth"><div className="ms-panel pn-auth-card">{config.noAccess}<button className="ms-btn ghost" onClick={() => void signOut({ stay: true })}>Sign in with another account</button></div></div>
            : (
              <div className="pn-body">
                <nav className="pn-nav" aria-label={config.title}>
                  {config.nav.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end}><Icon size={20} /><span>{label}</span></NavLink>)}
                </nav>
                <main className="pn-main"><Outlet /></main>
              </div>
            )}
      <Toasts />
    </div>
  );
}

export function PanelFrame({ config }: { config: PanelConfig }) {
  return <StoreProvider><Frame config={config} /></StoreProvider>;
}
