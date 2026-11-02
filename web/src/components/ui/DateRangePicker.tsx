import clsx from 'clsx';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from './Button';
import { Field, Input } from './Input';

export type RangePreset = 'today' | '7d' | '30d' | '90d' | '12m' | 'custom';

export interface DateRange { preset: RangePreset; from: string; to: string }

const DAY = 86400000;
const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Windows end at the next UTC midnight so "today" is always included. */
export function rangeFromPreset(preset: Exclude<RangePreset, 'custom'>, now = new Date()): DateRange {
  const end = new Date(startOfUtcDay(now).getTime() + DAY);
  const days = { today: 1, '7d': 7, '30d': 30, '90d': 90, '12m': 365 }[preset];
  return { preset, from: new Date(end.getTime() - days * DAY).toISOString(), to: end.toISOString() };
}

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '12m': 'Last 12 months', custom: 'Custom',
};

export function describeRange(range: DateRange): string {
  if (range.preset !== 'custom') return PRESET_LABELS[range.preset];
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt(range.from)} – ${fmt(new Date(new Date(range.to).getTime() - DAY).toISOString())}`;
}

export function DateRangePicker({
  value, onChange, presets = ['today', '7d', '30d', '90d', '12m'],
}: { value: DateRange; onChange: (range: DateRange) => void; presets?: Exclude<RangePreset, 'custom'>[] }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.from.slice(0, 10));
  const [to, setTo] = useState(new Date(new Date(value.to).getTime() - DAY).toISOString().slice(0, 10));
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const customInvalid = !from || !to || from > to || to > new Date().toISOString().slice(0, 10);

  const applyCustom = () => {
    if (customInvalid) return;
    onChange({
      preset: 'custom',
      from: new Date(`${from}T00:00:00Z`).toISOString(),
      to: new Date(new Date(`${to}T00:00:00Z`).getTime() + DAY).toISOString(),
    });
    setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <button
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-surface-2"
      >
        <CalendarDays className="h-4 w-4 text-muted" aria-hidden />
        {describeRange(value)}
        <ChevronDown className="h-3.5 w-3.5 text-faint" aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label="Choose date range" className="absolute right-0 top-full z-50 mt-1.5 w-[300px] rounded-xl border border-line bg-surface p-2 shadow-pop animate-pop-in">
          <div className="grid grid-cols-2 gap-1">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => { onChange(rangeFromPreset(p)); setOpen(false); }}
                className={clsx('rounded-lg px-3 py-2 text-left text-[13px] transition-colors', value.preset === p ? 'bg-brand-soft font-medium text-ink' : 'text-ink-2 hover:bg-surface-2')}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="mt-2 space-y-3 border-t border-line p-2 pt-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-faint">Custom range (UTC)</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="To"><Input type="date" value={to} min={from} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setTo(e.target.value)} /></Field>
            </div>
            <Button size="sm" className="w-full" disabled={customInvalid} onClick={applyCustom}>Apply range</Button>
          </div>
        </div>
      )}
    </div>
  );
}
