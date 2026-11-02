import { Compass } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { useShell } from '../components/layout/ShellContext';

export function NotFoundPage() {
  const location = useLocation();
  const pathname = (location.state as { from?: string } | null)?.from ?? location.pathname;
  const { setPaletteOpen } = useShell();
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-sage"><Compass className="h-6 w-6" /></div>
      <p className="eyebrow mt-4">404</p>
      <h1 className="mt-2 text-lg font-semibold text-ink">This page doesn’t exist</h1>
      <p className="mt-2 text-sm text-muted">Nothing lives at <code className="rounded bg-surface-2 px-1 text-xs">{pathname}</code>. It may have moved.</p>
      <div className="mt-5 flex justify-center gap-3 text-sm font-medium">
        <Link to="/dashboard" className="text-sage hover:underline">Go to dashboard</Link>
        <button onClick={() => setPaletteOpen(true)} className="text-muted hover:text-ink">Search instead</button>
      </div>
    </div>
  );
}
