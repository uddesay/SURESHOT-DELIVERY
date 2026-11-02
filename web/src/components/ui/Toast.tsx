import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { ApiException } from '../../lib/apiClient';

type Tone = 'success' | 'error' | 'info' | 'warning';
interface ToastItem { id: number; tone: Tone; title: string; description?: string }

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  /** Friendly message for the admin, technical detail to the console for developers. */
  fromError: (error: unknown, fallback?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const icons = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
const tones = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-info',
  warning: 'text-warning',
};

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiException) {
    const field = error.errors[0]?.message;
    return field && error.code === 'VALIDATION_ERROR' ? field : error.message;
  }
  return fallback;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback((tone: Tone, title: string, description?: string) => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-3), { id, tone, title, description }]);
    window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4300);
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    success: (t, d) => push('success', t, d),
    error: (t, d) => push('error', t, d),
    info: (t, d) => push('info', t, d),
    warning: (t, d) => push('warning', t, d),
    fromError: (error, fallback) => {
      console.error('[admin]', error);
      push('error', errorMessage(error, fallback));
    },
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {items.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex animate-slide-up items-start gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-pop">
              <Icon className={clsx('mt-0.5 h-[18px] w-[18px] shrink-0', tones[t.tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{t.title}</p>
                {t.description && <p className="mt-0.5 text-xs text-muted">{t.description}</p>}
              </div>
              <button aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="rounded p-0.5 text-faint hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
