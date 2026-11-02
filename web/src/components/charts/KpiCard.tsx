import clsx from 'clsx';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

import { Skeleton } from '../ui/Skeleton';
import { useChartTheme } from './chartTheme';

export interface KpiCardProps {
  label: string;
  icon?: ReactNode;
  value: string;
  previous?: string;
  /** Percent change vs previous period; null when there is no baseline. */
  change?: number | null;
  /** Set when a rise is bad (refund rate). */
  invert?: boolean;
  series?: number[];
  to?: string;
  hint?: string;
  loading?: boolean;
  compareLabel?: string;
}

export function TrendPill({ change, invert = false }: { change: number | null | undefined; invert?: boolean }) {
  if (change === null || change === undefined) {
    return <span className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-1.5 py-0.5 text-2xs font-medium text-muted">New</span>;
  }
  const flat = Math.abs(change) < 0.05;
  const good = flat ? null : (change > 0) !== invert;
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={clsx(
        'tabular inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-2xs font-semibold',
        good === null ? 'bg-surface-3 text-muted' : good ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {flat ? '0%' : `${change > 0 ? '+' : ''}${change.toFixed(1).replace(/\.0$/, '')}%`}
      <span className="sr-only">{good === null ? 'unchanged' : good ? 'improved' : 'worsened'}</span>
    </span>
  );
}

export function Sparkline({ data, positive = true, height = 36 }: { data: number[]; positive?: boolean | null; height?: number }) {
  const theme = useChartTheme();
  const id = useId().replace(/:/g, '');
  const color = positive === null ? theme.compare : positive ? theme.primary : theme.danger;
  const points = data.map((v, i) => ({ i, v }));
  if (!points.length) return <div style={{ height }} />;
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.6} fill={`url(#spark-${id})`} isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function KpiCard({ icon, label, value, previous, change, invert, series, to, hint, loading, compareLabel = 'vs previous period' }: KpiCardProps) {
  const flat = change === null || change === undefined || Math.abs(change) < 0.05;
  const positive = flat ? null : (change! > 0) !== Boolean(invert);
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="commerce-kpi-label">{icon && <span className="commerce-kpi-icon" aria-hidden>{icon}</span>}<p className="text-[13px] font-medium text-muted">{label}</p></div>
        {to && <ArrowRight className="h-3.5 w-3.5 -translate-x-1 text-faint opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />}
      </div>
      {loading ? (
        <div className="mt-3 space-y-2"><Skeleton className="h-7 w-28" /><Skeleton className="h-3 w-36" /></div>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="tabular font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</p>
            <TrendPill change={change} invert={invert} />
          </div>
          <p className="mt-2 truncate text-xs text-faint" title={hint}>
            {previous !== undefined ? <>{previous} {compareLabel}</> : hint}
          </p>
        </>
      )}
      <div className="-mx-1 mt-3">
        {loading ? <Skeleton className="h-9 w-full" /> : <Sparkline data={series ?? []} positive={positive} />}
      </div>
    </>
  );
  const classes = 'commerce-kpi card group block p-4 pb-2 transition-[border-color,box-shadow] duration-200';
  return to ? (
    <Link to={to} aria-label={`${label}: ${value}. View details`} className={clsx(classes, 'hover:border-line-strong hover:shadow-pop')}>{body}</Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
