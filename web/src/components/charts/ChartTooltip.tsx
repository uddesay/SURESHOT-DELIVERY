import type { ReactNode } from 'react';

interface Entry { name?: string | number; value?: number | string; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }

/** Tooltip body styled with design tokens; recharts passes payload/label. */
export function ChartTooltip({
  active, payload, label, format, labelFormat,
}: {
  active?: boolean;
  payload?: Entry[];
  label?: string | number;
  format: (value: number, entry: Entry) => ReactNode;
  labelFormat?: (label: string | number | undefined, payload?: Entry[]) => ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[160px] rounded-lg border border-line bg-surface px-3 py-2.5 text-xs shadow-pop">
      <p className="mb-1.5 font-medium text-ink">{labelFormat ? labelFormat(label, payload) : label}</p>
      <ul className="space-y-1">
        {payload.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
              {p.name}
            </span>
            <span className="tabular font-medium text-ink">{format(Number(p.value ?? 0), p)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
