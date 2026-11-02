import { AlertTriangle } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

import { Button, type ButtonVariant } from './Button';
import { Field, Textarea } from './Input';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'default';
  /** Ask for a written reason (cancellation, rejection…). Resolves with the text. */
  reason?: { label: string; placeholder?: string; minLength?: number; required?: boolean };
  /** Optional async action; the dialog stays open with a spinner until it settles and closes only on success. */
  onConfirm?: (reason: string) => Promise<unknown>;
}

type Resolver = (value: string | false) => void;

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<string | false>) | null>(null);

/**
 * Promise-based confirmation: `if (await confirm({...}) === false) return;`.
 * Resolves with the entered reason (or '' when none was asked for).
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolver = useRef<Resolver | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next);
    setReason('');
    setError(null);
    setPending(false);
    return new Promise<string | false>((resolve) => { resolver.current = resolve; });
  }, []);

  const close = (value: string | false) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  const min = options?.reason?.minLength ?? (options?.reason?.required ? 3 : 0);
  const invalid = Boolean(options?.reason) && reason.trim().length < min;

  const submit = async () => {
    if (!options || invalid) return;
    if (!options.onConfirm) return close(reason.trim());
    setPending(true);
    setError(null);
    try {
      await options.onConfirm(reason.trim());
      close(reason.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The action failed. Please try again.');
    } finally {
      setPending(false);
    }
  };

  const variant: ButtonVariant = options?.tone === 'danger' ? 'danger' : 'primary';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(options)}
        onClose={() => !pending && close(false)}
        title={options?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" disabled={pending} onClick={() => close(false)}>Cancel</Button>
            <Button variant={variant} isLoading={pending} disabled={invalid} onClick={() => void submit()}>
              {options?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {options?.tone === 'danger' && (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft text-danger">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </div>
          )}
          {options?.description && <div className="text-sm leading-relaxed text-ink-2">{options.description}</div>}
          {options?.reason && (
            <Field label={options.reason.label} required={options.reason.required} hint={min ? `At least ${min} characters.` : undefined}>
              <Textarea rows={3} autoFocus value={reason} placeholder={options.reason.placeholder} onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
          {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
