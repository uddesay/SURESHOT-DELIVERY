import { ShieldOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';

import { Spinner } from '../components/ui/Spinner';
import { useAuth } from './AuthContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'unknown') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner label="Checking your session" />
      </div>
    );
  }
  if (status === 'unauthenticated') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** Wraps a route that requires a specific RBAC permission beyond just being staff. */
export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-warning-soft text-warning"><ShieldOff className="h-6 w-6" /></div>
        <h1 className="mt-4 text-lg font-semibold text-ink">You don’t have access to this page</h1>
        <p className="mt-2 text-sm text-muted">Your role doesn’t include the <code className="rounded bg-surface-2 px-1 text-xs">{permission}</code> permission. Ask a super admin if you need it.</p>
        <Link to="/dashboard" className="mt-5 inline-block text-sm font-medium text-sage hover:underline">Back to dashboard</Link>
      </div>
    );
  }
  return <>{children}</>;
}
