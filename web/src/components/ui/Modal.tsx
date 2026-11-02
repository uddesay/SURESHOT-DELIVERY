import clsx from 'clsx';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Native <dialog> gives focus trapping, Escape handling and inert background
 * for free; we only add styling, scroll lock and focus restoration.
 */
function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);
  return ref;
}

export function Modal({
  open, onClose, title, description, children, footer, size: sizeProp, wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** @deprecated use size="lg" */
  wide?: boolean;
}) {
  const ref = useDialog(open);
  const titleId = useId();
  const size = sizeProp ?? (wide ? 'lg' : 'md');
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className={clsx(
        'm-auto w-[calc(100%-2rem)] overflow-visible rounded-2xl border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-[rgb(10_16_12/0.45)] backdrop:backdrop-blur-[2px] open:animate-pop-in',
        widths[size],
      )}
    >
      {open && (
        <div className="flex max-h-[min(88vh,860px)] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <h2 id={titleId} className="text-base font-semibold tracking-tight">{title}</h2>
              {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
            </div>
            <button aria-label="Close dialog" onClick={onClose} className="-mr-2 rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-ink">
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2/60 px-6 py-3.5">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function Drawer({
  open, onClose, title, description, children, footer, width = 'max-w-xl',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useDialog(open);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className={clsx(
        'fixed inset-y-0 left-auto right-0 m-0 h-full max-h-none w-full border-l border-line bg-surface p-0 text-ink shadow-drawer backdrop:bg-[rgb(10_16_12/0.4)] open:animate-slide-in',
        width,
      )}
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-base font-semibold tracking-tight">{title}</h2>
              {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
            </div>
            <button aria-label="Close panel" onClick={onClose} className="-mr-2 rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-ink">
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2/60 px-6 py-3.5">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
