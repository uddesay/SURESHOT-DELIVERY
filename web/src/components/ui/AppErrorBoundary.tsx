import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Catches render errors. `inline` keeps the admin shell (sidebar/topbar)
 * usable and only replaces the page body; the default is a full-screen fallback.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode; inline?: boolean }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Sureshot] Unhandled render error', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.inline) {
      return (
        <div role="alert" className="card mx-auto mt-10 max-w-md p-8 text-center">
          <p className="eyebrow">Something broke</p>
          <h1 className="mt-3 text-xl font-semibold text-ink">This page hit an unexpected error.</h1>
          <p className="mt-2 text-sm text-muted">The rest of the workspace still works. Reload to try again — the error details are in the browser console.</p>
          <button className="mt-5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-ink" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      );
    }
    return (
      <main className="grid min-h-screen place-items-center bg-stone-50 p-6">
        <div className="max-w-md rounded-2xl border border-stone-200 bg-white p-8" role="alert">
          <p className="text-sm font-semibold text-primary-700">Sureshot</p>
          <h1 className="mt-4 text-2xl font-semibold">Let’s get you back on track.</h1>
          <p className="my-4 text-sm text-slate-600">This page couldn’t load. Reload to get the latest version. Your saved orders and bag are safe.</p>
          <button className="rounded-lg bg-primary-700 px-5 py-3 text-sm text-white" onClick={() => window.location.reload()}>Reload Sureshot</button>
        </div>
      </main>
    );
  }
}
