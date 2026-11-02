import clsx from 'clsx';
import { CloudOff, RefreshCw, type LucideIcon } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

import { errorMessage } from './Toast';

export function EmptyState({
  icon: Icon, title, message, action, compact, className,
}: { icon: LucideIcon; title: string; message?: ReactNode; action?: ReactNode; compact?: boolean; className?: string }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center text-center', compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14', className)}>
      <div className={clsx('flex items-center justify-center rounded-2xl bg-brand-soft text-sage', compact ? 'h-10 w-10' : 'h-12 w-12')}>
        <Icon className={compact ? 'h-5 w-5' : 'h-6 w-6'} aria-hidden />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {message && <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{message}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Friendly message + retry for the admin; logs technical detail for developers. */
export function ErrorState({
  message = 'We couldn’t load this.', error, onRetry, compact, className,
}: { message?: string; error?: unknown; onRetry?: () => void; compact?: boolean; className?: string }) {
  useEffect(() => {
    if (error) console.error('[admin] load failed:', error);
  }, [error]);
  const detail = error ? errorMessage(error, '') : '';
  return (
    <div role="alert" className={clsx('flex flex-col items-center justify-center gap-3 text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <CloudOff className="h-5 w-5" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{message}</p>
        {detail && detail !== message && <p className="mt-1 text-[13px] text-muted">{detail}</p>}
      </div>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-2">
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
      )}
    </div>
  );
}
