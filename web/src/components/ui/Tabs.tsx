import clsx from 'clsx';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<K extends string> { key: K; label: ReactNode; count?: number; icon?: ReactNode; error?: boolean }

/** WAI-ARIA tabs with roving focus; the panel is rendered by the caller via `panelId(key)`. */
export function Tabs<K extends string>({
  tabs, value, onChange, className, variant = 'underline', label,
}: {
  tabs: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
  variant?: 'underline' | 'pill';
  label: string;
}) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, index: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + tabs.length) % tabs.length;
    refs.current[next]?.focus();
    onChange(tabs[next]!.key);
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className={clsx(
        'nav-scroll flex items-center overflow-x-auto',
        variant === 'underline' ? 'gap-5 border-b border-line' : 'gap-1 rounded-lg bg-surface-2 p-1',
        className,
      )}
    >
      {tabs.map((tab, i) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            id={`${base}-${tab.key}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={clsx(
              'inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[13px] font-medium transition-colors',
              variant === 'underline'
                ? clsx('-mb-px border-b-2 py-2.5', active ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink')
                : clsx('rounded-md px-3 py-1.5', active ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'),
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.error && <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-label="has errors" />}
            {tab.count !== undefined && (
              <span className={clsx('tabular rounded-md px-1.5 text-2xs', active ? 'bg-surface-3 text-ink' : 'bg-surface-2 text-muted')}>{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Compact segmented control for small option sets (date ranges, chart metrics). */
export function Segmented<K extends string | number>({
  options, value, onChange, label, size = 'sm',
}: { options: { value: K; label: ReactNode }[]; value: K; onChange: (v: K) => void; label: string; size?: 'xs' | 'sm' }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex items-center rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'tabular rounded-md font-medium transition-all duration-150',
              size === 'xs' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs',
              active ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
