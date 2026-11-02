import { useQuery } from '@tanstack/react-query';
import { BadgePercent, Download, PieChart as PieIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { analyticsApi, type KpiKey, type Overview, type RankedRow } from '../../api/analytics';
import { useChartTheme } from '../../components/charts/chartTheme';
import { ChartTooltip } from '../../components/charts/ChartTooltip';
import { KpiCard } from '../../components/charts/KpiCard';
import { METRIC_META, SalesChart, type SalesMetric } from '../../components/charts/SalesChart';
import { statusLabel } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { DateRangePicker, describeRange, rangeFromPreset, type DateRange } from '../../components/ui/DateRangePicker';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Checkbox } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { Segmented, Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { apiGetPage } from '../../lib/apiClient';
import { downloadCsv } from '../../lib/csv';
import { formatCompactCurrency, formatCurrency, formatNumber, formatPercent } from '../../lib/format';

type Tab = 'sales' | 'orders' | 'customers' | 'products' | 'vendors' | 'marketing';

function kpi(o: Overview | undefined, key: KpiKey, kind: 'money' | 'count' | 'percent', label: string, opts: { invert?: boolean; series?: SalesMetric; to?: string } = {}) {
  const k = o?.kpis[key];
  const fmt = (v: number) => (kind === 'money' ? formatCompactCurrency(v) : kind === 'percent' ? formatPercent(v) : formatNumber(v));
  return (
    <KpiCard
      key={key}
      label={label}
      loading={!o}
      value={k ? fmt(k.value) : '—'}
      previous={k ? fmt(k.previous) : undefined}
      change={k?.change}
      invert={opts.invert}
      series={opts.series && o ? o.series.map((p) => p[opts.series!]) : undefined}
      to={opts.to}
    />
  );
}

function TrendCard({ title, overview, metric, defaultCompare = true }: { title: string; overview?: Overview; metric: SalesMetric; defaultCompare?: boolean }) {
  const [compare, setCompare] = useState(defaultCompare);
  return (
    <Card>
      <CardHeader
        title={title}
        description={METRIC_META[metric].description}
        action={<Checkbox checked={compare} onChange={setCompare} label={<span className="text-xs font-medium text-ink-2">Compare</span>} />}
      />
      <div className="p-5">
        {overview ? <SalesChart series={overview.series} previousSeries={overview.previousSeries} metric={metric} compare={compare} height={260} zoom /> : <Skeleton className="h-[260px] w-full" />}
      </div>
    </Card>
  );
}

function RankingTable({ rows, loading, error, onRetry, kind, showCommission }: { rows: RankedRow[]; loading: boolean; error: unknown; onRetry: () => void; kind: 'products' | 'categories' | 'vendors'; showCommission?: boolean }) {
  const total = rows.reduce((s, r) => s + r.revenue_minor, 0) || 1;
  const link = (r: RankedRow) => (kind === 'products' ? `/products/${r.id}` : kind === 'vendors' ? `/vendors/${r.id}` : `/products?categoryId=${r.id}`);
  return (
    <DataTable
      caption={`Top ${kind}`}
      rows={rows}
      rowKey={(r) => r.id}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={{ icon: PieIcon, title: 'No net sales in this period', message: 'Rankings use confirmed through delivered orders. Cancelled and refunded orders are excluded.' }}
      columns={[
        { id: 'rank', header: '#', hideable: false, cell: (r) => <span className="tabular text-faint">{rows.indexOf(r) + 1}</span>, mobile: 'hidden' },
        { id: 'name', header: kind === 'vendors' ? 'Vendor' : kind === 'categories' ? 'Category' : 'Product', mobile: 'primary', hideable: false, cell: (r) => <Link to={link(r)} className="link">{r.name}</Link> },
        { id: 'revenue', header: 'Net sales', align: 'right', cell: (r) => <span className="tabular font-medium text-ink">{formatCurrency(r.revenue_minor)}</span> },
        { id: 'share', header: 'Share', align: 'right', cell: (r) => <span className="tabular">{formatPercent((r.revenue_minor / total) * 100)}</span> },
        { id: 'units', header: 'Units', align: 'right', cell: (r) => <span className="tabular">{formatNumber(r.units)}</span> },
        { id: 'orders', header: 'Orders', align: 'right', cell: (r) => <span className="tabular">{formatNumber(r.orders)}</span> },
        ...(showCommission ? [{ id: 'commission', header: 'Commission', align: 'right' as const, cell: (r: RankedRow) => <span className="tabular">{formatCurrency(r.commission_minor ?? 0)}</span> }] : []),
      ]}
    />
  );
}

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const theme = useChartTheme();
  const reducedMotion = useReducedMotion();
  const tab = (params.get('tab') as Tab) || 'sales';
  const metricParam = params.get('metric') as SalesMetric | null;
  const [range, setRange] = useState<DateRange>(rangeFromPreset('30d'));
  const [salesMetric, setSalesMetric] = useState<SalesMetric>(metricParam && metricParam in METRIC_META ? metricParam : 'revenue');

  const overview = useQuery({ queryKey: ['admin-overview', range.from, range.to], queryFn: () => analyticsApi.overview(range), placeholderData: (p) => p });
  const breakdown = useQuery({ queryKey: ['admin-breakdown', range.from, range.to, 15], queryFn: () => analyticsApi.breakdown(range, 15) });
  const coupons = useQuery({
    queryKey: ['analytics-coupons'],
    queryFn: () => apiGetPage<{ id: string; code: string; title: string; redemptions: number; discount_given_minor: number; state: string }>('/admin/coupons', { limit: 100 }),
    enabled: tab === 'marketing',
  });

  const o = overview.data;
  const label = describeRange(range).toLowerCase();

  const setTab = (t: Tab) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', t); n.delete('metric'); return n; }, { replace: true });

  const exportCsv = () => {
    if (!o) return;
    downloadCsv(`sureshot-analytics-${o.range.from.slice(0, 10)}-to-${o.range.to.slice(0, 10)}.csv`, o.series, [
      { header: 'Date (UTC)', value: (p) => p.date },
      { header: 'GMV (INR)', value: (p) => (p.gmv / 100).toFixed(2) },
      { header: 'Net sales (INR)', value: (p) => (p.revenue / 100).toFixed(2) },
      { header: 'Orders', value: (p) => p.orders },
      { header: 'Net orders', value: (p) => p.netOrders },
      { header: 'AOV (INR)', value: (p) => (p.aov / 100).toFixed(2) },
      { header: 'New customers', value: (p) => p.customers },
    ]);
    toast.success('Report exported', `${o.series.length} days of data downloaded as CSV.`);
  };

  const statusData = useMemo(() => (breakdown.data?.statuses ?? []).map((s) => ({ name: statusLabel(s.status), value: s.count })), [breakdown.data]);
  const paymentData = useMemo(() => (breakdown.data?.payments ?? []).map((p) => ({ name: p.method.toUpperCase(), value: p.count, amount: p.amount_minor })), [breakdown.data]);

  return (
    <div>
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        description="Sales, orders, customers and marketplace performance — computed live from the database."
        actions={
          <>
            <DateRangePicker value={range} onChange={setRange} />
            <Button variant="outline" size="sm" className="h-9" disabled={!o} onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>
          </>
        }
      />

      <Tabs
        label="Analytics sections"
        value={tab}
        onChange={setTab}
        className="mb-6"
        tabs={[
          { key: 'sales', label: 'Sales' }, { key: 'orders', label: 'Orders' }, { key: 'customers', label: 'Customers' },
          { key: 'products', label: 'Products' }, { key: 'vendors', label: 'Vendors' }, { key: 'marketing', label: 'Marketing' },
        ]}
      />

      {overview.error && !o ? (
        <Card><ErrorState message="Analytics couldn’t load." error={overview.error} onRetry={() => void overview.refetch()} /></Card>
      ) : (
        <div className="space-y-4" role="tabpanel" aria-label={tab}>
          {tab === 'sales' && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {kpi(o, 'gmv', 'money', 'Gross merchandise value', { series: 'gmv' })}
                {kpi(o, 'netSales', 'money', 'Net sales', { series: 'revenue' })}
                {kpi(o, 'aov', 'money', 'Average order value', { series: 'aov' })}
                {kpi(o, 'refundRate', 'percent', 'Refund rate', { invert: true, to: '/returns' })}
              </div>
              <Card>
                <CardHeader
                  title="Revenue trend"
                  description={`${METRIC_META[salesMetric].description} · ${label}`}
                  action={<Segmented label="Revenue metric" value={salesMetric} onChange={setSalesMetric} options={[{ value: 'revenue', label: 'Net sales' }, { value: 'gmv', label: 'GMV' }, { value: 'aov', label: 'AOV' }]} />}
                />
                <div className="p-5">{o ? <SalesChart series={o.series} previousSeries={o.previousSeries} metric={salesMetric} compare height={320} zoom /> : <Skeleton className="h-[320px] w-full" />}</div>
              </Card>
            </>
          )}

          {tab === 'orders' && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {kpi(o, 'orders', 'count', 'Orders placed', { series: 'orders', to: '/orders' })}
                {kpi(o, 'aov', 'money', 'Average order value', { series: 'aov' })}
                {kpi(o, 'gmv', 'money', 'GMV', { series: 'gmv' })}
                {kpi(o, 'refundRate', 'percent', 'Refund rate', { invert: true, to: '/returns' })}
              </div>
              <TrendCard title="Order trend" overview={o} metric="orders" />
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Order status mix" description={`All orders created · ${label}`} />
                  <div className="p-5">
                    {breakdown.isLoading ? <Skeleton className="h-[240px] w-full" /> : statusData.length === 0 ? <EmptyState compact icon={PieIcon} title="No orders in this period" /> : (
                      <div className="h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={statusData} layout="vertical" margin={{ left: 10, right: 16 }}>
                            <CartesianGrid horizontal={false} stroke={theme.grid} />
                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: theme.axis }} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12, fill: theme.ink }} axisLine={false} tickLine={false} />
                            <Tooltip cursor={{ fill: theme.grid }} content={(p) => <ChartTooltip active={p.active} payload={p.payload as never} label={p.label as string} format={(v) => `${formatNumber(v)} orders`} />} />
                            <Bar dataKey="value" name="Orders" fill={theme.primary} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={!reducedMotion} animationDuration={450} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </Card>
                <Card>
                  <CardHeader title="Payment methods" description={`Placed orders by payment method · ${label}`} />
                  <div className="p-5">
                    {breakdown.isLoading ? <Skeleton className="h-[240px] w-full" /> : paymentData.length === 0 ? <EmptyState compact icon={PieIcon} title="No placed orders in this period" /> : (
                      <div className="flex flex-col items-center gap-6 sm:flex-row">
                        <div className="h-[200px] w-[200px] shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={paymentData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={90} paddingAngle={2} stroke={theme.surface} isAnimationActive={!reducedMotion} animationDuration={450}>
                                {paymentData.map((_, i) => <Cell key={i} fill={theme.series[i % theme.series.length]} />)}
                              </Pie>
                              <Tooltip content={(p) => <ChartTooltip active={p.active} payload={p.payload as never} label={(p.payload?.[0]?.name as string) ?? ''} format={(v) => `${formatNumber(v)} orders`} />} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <ul className="w-full space-y-2.5">
                          {paymentData.map((p, i) => (
                            <li key={p.name} className="flex items-center justify-between gap-3 text-[13px]">
                              <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: theme.series[i % theme.series.length] }} />{p.name}</span>
                              <span className="tabular text-muted">{formatNumber(p.value)} · <span className="font-medium text-ink">{formatCurrency(p.amount)}</span></span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </>
          )}

          {tab === 'customers' && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {kpi(o, 'newCustomers', 'count', 'New customers', { series: 'customers', to: '/customers' })}
                {kpi(o, 'repeatRate', 'percent', 'Repeat customer rate')}
                {kpi(o, 'aov', 'money', 'Average order value', { series: 'aov' })}
              </div>
              <TrendCard title="Customer growth" overview={o} metric="customers" />
              <p className="text-xs text-faint">Repeat customer rate = buyers in the period who had placed an order before it started, divided by all buyers in the period. Conversion rate isn’t shown because storefront sessions aren’t tracked yet.</p>
            </>
          )}

          {tab === 'products' && (
            <div className="grid gap-4 xl:grid-cols-2">
              <div><h2 className="mb-3 text-[15px] font-semibold">Top products</h2><RankingTable kind="products" rows={breakdown.data?.products ?? []} loading={breakdown.isLoading} error={breakdown.error} onRetry={() => void breakdown.refetch()} /></div>
              <div><h2 className="mb-3 text-[15px] font-semibold">Top categories</h2><RankingTable kind="categories" rows={breakdown.data?.categories ?? []} loading={breakdown.isLoading} error={breakdown.error} onRetry={() => void breakdown.refetch()} /></div>
            </div>
          )}

          {tab === 'vendors' && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {kpi(o, 'activeVendors', 'count', 'Active vendors', { to: '/vendors' })}
                {kpi(o, 'netSales', 'money', 'Marketplace net sales', { series: 'revenue' })}
                <KpiCard
                  label="Commission earned"
                  loading={breakdown.isLoading}
                  value={formatCompactCurrency((breakdown.data?.vendors ?? []).reduce((s, v) => s + (v.commission_minor ?? 0), 0))}
                  hint="Top vendors in this period"
                  to="/commissions"
                />
              </div>
              <h2 className="text-[15px] font-semibold">Top vendors</h2>
              <RankingTable kind="vendors" showCommission rows={breakdown.data?.vendors ?? []} loading={breakdown.isLoading} error={breakdown.error} onRetry={() => void breakdown.refetch()} />
            </>
          )}

          {tab === 'marketing' && (
            <>
              <h2 className="text-[15px] font-semibold">Coupon performance</h2>
              <DataTable
                caption="Coupon performance"
                rows={[...(coupons.data?.items ?? [])].sort((a, b) => b.redemptions - a.redemptions)}
                rowKey={(c) => c.id}
                loading={coupons.isLoading}
                error={coupons.error}
                onRetry={() => void coupons.refetch()}
                empty={{ icon: BadgePercent, title: 'No coupons yet', message: 'Create a coupon to start tracking redemptions.', action: <Link to="/coupons?new=1" className="text-sm font-medium text-sage hover:underline">Create coupon</Link> }}
                columns={[
                  { id: 'code', header: 'Code', mobile: 'primary', hideable: false, cell: (c) => <Link to={`/coupons?q=${c.code}`} className="link font-mono">{c.code}</Link> },
                  { id: 'title', header: 'Title', cell: (c) => c.title },
                  { id: 'state', header: 'Status', cell: (c) => statusLabel(c.state) },
                  { id: 'redemptions', header: 'Redemptions', align: 'right', cell: (c) => <span className="tabular">{formatNumber(c.redemptions)}</span> },
                  { id: 'discount', header: 'Discount given', align: 'right', cell: (c) => <span className="tabular font-medium text-ink">{formatCurrency(c.discount_given_minor)}</span> },
                ]}
              />
              <p className="text-xs text-faint">Coupon totals are all-time. Campaign and promotion attribution is not tracked yet.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
