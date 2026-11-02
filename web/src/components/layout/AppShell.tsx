import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { AppErrorBoundary } from '../ui/AppErrorBoundary';
import { CommandPalette } from './CommandPalette';
import { ShellProvider } from './ShellContext';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  return (
    <ShellProvider>
      <a href="#main" className="sr-only z-[100] rounded-lg bg-surface px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
      <div className="commerce-shell flex min-h-screen bg-canvas">
        <div
          aria-hidden
          onClick={() => setMobileOpen(false)}
          className={clsx('fixed inset-0 z-40 bg-[rgb(10_16_12/0.45)] transition-opacity lg:hidden', mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0')}
        />
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onOpenNav={() => setMobileOpen(true)} />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 outline-none print:max-w-none print:p-0 md:px-6 lg:px-8 lg:py-8">
            <AppErrorBoundary inline key={location.pathname}>
              <Outlet />
            </AppErrorBoundary>
          </main>
        </div>
      </div>
      <CommandPalette />
    </ShellProvider>
  );
}
