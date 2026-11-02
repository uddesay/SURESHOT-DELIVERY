import { ArrowLeft, ArrowRight, BarChart3, Eye, EyeOff, ShieldCheck, Sparkles, Store } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';

import { BrandMark } from '../components/layout/Sidebar';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Input';
import { ApiException } from '../lib/apiClient';
import { useAuth } from './AuthContext';

export function LoginPage() {
  const { status, login, hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const isSuper = searchParams.get('role') === 'super_admin';
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from;
    const home = hasPermission('analytics:read') ? '/dashboard' : '/support/tickets';
    return <Navigate to={from && from !== '/login' ? from : home} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login(identifier.trim(), password);
    } catch (err) {
      setError(err instanceof ApiException ? err.message : 'Sign-in failed. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="staff-login">
      <aside className="staff-login-story">
        <Link to="/" className="staff-wordmark" aria-label="Sureshot storefront"><img src="/brand/icon.png" alt="" width={40} height={40} style={{ width: 40, height: 40 }} />Sureshot <span>DELIVERY</span></Link>
        <div>
          <span className="staff-eyebrow"><Sparkles size={14} /> Sureshot WORKSPACE</span>
          <h1>Run the whole<br />marketplace<br /><em>beautifully.</em></h1>
          <p>Orders, vendors, catalogue and customers — one calm, connected place to keep good things moving.</p>
          <div className="staff-feature"><BarChart3 size={18} /><span>Live sales, KPIs and activity as it happens</span></div>
          <div className="staff-feature" style={{ marginTop: 14 }}><Store size={18} /><span>Vendor approvals, payouts and commissions</span></div>
        </div>
        <span className="staff-copyright">© {new Date().getFullYear()} Sureshot · Staff access only</span>
      </aside>
      <section className="staff-login-form">
        <Link to="/" className="staff-back"><ArrowLeft size={15} /> Back to store</Link>
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <BrandMark />
            <h1 className="mt-8 font-display text-[26px] font-semibold tracking-tight text-ink">Sign in to your workspace</h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
              <ShieldCheck className="h-4 w-4 text-sage" /> {isSuper ? 'Super admin' : 'Staff'} access · your role decides what you can see
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Field label="Email or phone" required>
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@sureshot.com" autoComplete="username" autoFocus required />
            </Field>
            <div className="relative">
              <Field label="Password" required>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="pr-10"
                />
              </Field>
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute bottom-[7px] right-2 rounded p-1 text-faint hover:text-ink"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            <Button type="submit" className="h-10 w-full" isLoading={isLoading} disabled={!identifier.trim() || !password}>
              Sign in <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
          <p className="mt-6 text-xs leading-relaxed text-faint">Customer accounts can’t sign in here. Use the storefront to shop.</p>
        </div>
      </section>
    </div>
  );
}
