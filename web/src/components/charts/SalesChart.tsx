import { useMemo } from 'react';
import { Area, Brush, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { SeriesPoint } from '../../api/analytics';
import { formatCompactCurrency, formatCurrency, formatNumber } from '../../lib/format';
import { useChartTheme } from './chartTheme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { ChartTooltip } from './ChartTooltip';

export type SalesMetric = 'revenue' | 'gmv' | 'orders' | 'customers' | 'aov';

export const METRIC_META: Record<SalesMetric, { label: string; money: boolean; description: string }> = {
  revenue: { label: 'Net sales', money: true, description: 'Excludes cancelled, returned and refunded orders' },
  gmv: { label: 'GMV', money: true, description: 'Value of all placed orders' },
  orders: { label: 'Orders', money: false, description: 'Placed orders (excludes failed online payments)' },
  customers: { label: 'New customers', money: false, description: 'Customer accounts registered' },
  aov: { label: 'Avg. order value', money: true, description: 'Net sales ÷ net orders' },
};

interface Bucket { key: string; label: string; current: number; previous: number | null; from: string }

/** Rolls daily points into weekly/monthly buckets for long ranges so the line stays readable. */
export function bucketSeries(series: SeriesPoint[], previous: SeriesPoint[], metric: SalesMetric): Bucket[] {
  const days = series.length;
  const size = days > 180 ? 30 : days > 60 ? 7 : 1;
  const value = (points: SeriesPoint[]) => {
    if (metric !== 'aov') return points.reduce((s, p) => s + p[metric], 0);
    // AOV of a bucket is revenue/orders, not the mean of daily AOVs.
    const orders = points.reduce((s, p) => s + p.netOrders, 0);
    const revenue = points.reduce((s, p) => s + p.revenue, 0);
    return orders ? Math.round(revenue / orders) : 0;
  };
  const out: Bucket[] = [];
  for (let i = 0; i < days; i += size) {
    const slice = series.slice(i, i + size);
    const prevSlice = previous.slice(i, i + size);
    const first = new Date(`${slice[0]!.date}T00:00:00Z`);
    const label = size === 30
      ? first.toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' })
      : first.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    out.push({ key: slice[0]!.date, label, current: value(slice), previous: prevSlice.length ? value(prevSlice) : null, from: slice[0]!.date });
  }
  return out;
}

export function SalesChart({
  series, previousSeries, metric, compare, height = 300, zoom = false,
}: { series: SeriesPoint[]; previousSeries: SeriesPoint[]; metric: SalesMetric; compare: boolean; height?: number; zoom?: boolean }) {
  const theme = useChartTheme();
  const reducedMotion = useReducedMotion();
  const data = useMemo(() => bucketSeries(series, previousSeries, metric), [series, previousSeries, metric]);
  const money = METRIC_META[metric].money;
  const fmt = (v: number) => (money ? formatCurrency(v) : formatNumber(v));
  const axis = (v: number) => (money ? formatCompactCurrency(v) : formatNumber(v));
  const showBrush = zoom && data.length > 20;

  return (
    <div style={{ height }} role="img" aria-label={`${METRIC_META[metric].label} chart${compare ? ' compared with the previous period' : ''}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.fill} stopOpacity={0.45} />
              <stop offset="100%" stopColor={theme.fill} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 4" vertical={false} stroke={theme.grid} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.axis }} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis tick={{ fontSize: 11, fill: theme.axis }} tickLine={false} axisLine={false} width={56} tickFormatter={axis} allowDecimals={false} domain={[0, (max: number) => (max > 0 ? max : money ? 100000 : 10)]} />
          <Tooltip
            cursor={{ stroke: theme.line, strokeWidth: 1 }}
            content={(props) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload as never}
                label={props.label as string}
                format={(v) => fmt(v)}
              />
            )}
          />
          {compare && (
            <Line type="monotone" dataKey="previous" name="Previous period" stroke={theme.compare} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
          )}
          <Area type="monotone" dataKey="current" name={METRIC_META[metric].label} stroke={theme.primary} strokeWidth={2.2} fill="url(#salesFill)" activeDot={{ r: 4, strokeWidth: 2, stroke: theme.surface }} isAnimationActive={!reducedMotion} animationDuration={450} />
          {showBrush && <Brush dataKey="label" height={22} travellerWidth={8} stroke={theme.line} fill={theme.surface} tickFormatter={() => ''} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
