import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, BadgePercent, Boxes, CheckCircle2, ClipboardCheck, LifeBuoy, Package, Plus, RotateCcw, ShoppingBag, Star, Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { analyticsApi, type KpiKey } from '../../api/analytics';
import { ordersApi, type OrderRow } from '../../api/commerce';
import { useAuth } from '../../auth/AuthContext';
import { KpiCard } from '../../components/charts/KpiCard';
import { METRIC_META, SalesChart, type SalesMetric } from '../../components/charts/SalesChart';
import { StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { DateRangePicker, describeRange, rangeFromPreset, type DateRange } from '../../components/ui/DateRangePicker';
import { ErrorState } from '../../components/ui/EmptyState';
import { Checkbox } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { Segmented } from '../../components/ui/Tabs';
import { formatCompactCurrency, formatCurrency, formatDate, formatNumber, formatPercent } from '../../lib/format';
import { storage } from '../../lib/storage';
import { OrderRowActions } from '../orders/OrderRowActions';
import { ActivityFeed } from './ActivityFeed';
import { OrderStatusSummary } from './OrderStatusSummary';

const RANGE_KEY = 'sureshot.admin.dashboardRange';

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const KPI_CONFIG: { key: KpiKey; label: string; money?: boolean; percent?: boolean; invert?: boolean; series?: 'gmv' | 'revenue' | 'orders' | 'aov' | 'customers'; to: string; hint: string }[] = [
  { key: 'gmv', label: 'Gross merchandise value', money: true, series: 'gmv', to: '/analytics?metric=gmv', hint: 'All placed orders' },
  { key: 'netSales', label: 'Net sales', money: true, series: 'revenue', to: '/analytics?metric=revenue', hint: 'Excludes cancelled & refunded' },
  { key: 'orders', label: 'Orders', series: 'orders', to: '/orders', hint: 'Placed orders' },
  { key: 'aov', label: 'Average order value', money: true, series: 'aov', to: '/analytics?metric=aov', hint: 'Net sales per net order' },
  { key: 'newCustomers', label: 'New customers', series: 'customers', to: '/customers', hint: 'Accounts registered' },
  { key: 'activeVendors', label: 'Active vendors', to: '/vendors', hint: 'Approved marketplace stores' },
  { key: 'repeatRate', label: 'Repeat customer rate', percent: true, to: '/analytics?tab=customers', hint: 'Buyers who had ordered before' },
  { key: 'refundRate', label: 'Refund rate', percent: true, invert: true, to: '/returns', hint: 'Returned or refunded orders' },
];

const QUEUE_CONFIG = [
  { key: 'products', label: 'Products awaiting review', icon: Package, to: '/products?status=pending_approval', permission: 'products:read' },
  { key: 'vendors', label: 'Vendor applications', icon: ClipboardCheck, to: '/vendors/applications', permission: 'vendors:read' },
  { key: 'returns', label: 'Return requests', icon: RotateCcw, to: '/returns?status=requested', permission: 'returns:read' },
  { key: 'payouts', label: 'Payouts to approve', icon: Wallet, to: '/payouts?status=pending', permission: 'payouts:approve' },
  { key: 'lowStock', label: 'Low or out of stock', icon: Boxes, to: '/inventory?stock=low', permission: 'inventory:manage' },
  { key: 'tickets', label: 'Open support tickets', icon: LifeBuoy, to: '/support/tickets?status=open', permission: 'support:manage' },
  { key: 'reviews', label: 'Reviews to moderate', icon: Star, to: '/reviews?status=pending', permission: 'reviews:moderate' },
] as const;

export function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [range, setRangeState] = useState<DateRange>(() => {
    const saved = storage.get<DateRange | null>(RANGE_KEY, null);
    return saved && saved.preset !== 'custom' ? rangeFromPreset(saved.preset) : saved ?? rangeFromPreset('30d');
  });
  const [metric, setMetric] = useState<SalesMetric>('revenue');
  const [compare, setCompare] = useState(true);

  const setRange = (r: DateRange) => { setRangeState(r); storage.set(RANGE_KEY, r); };

  const overview = useQuery({
    queryKey: ['admin-overview', range.from, range.to],
    queryFn: () => analyticsApi.overview({ from: range.from, to: range.to }),
    placeholderData: (prev) => prev,
  });
  const breakdown = useQuery({
    queryKey: ['admin-breakdown', range.from, range.to],
    queryFn: () => analyticsApi.breakdown({ from: range.from, to: range.to }, 5),
  });
  const recent = useQuery({
    queryKey: ['admin-orders', 'recent'],
    queryFn: () => ordersApi.list({ limit: 8 }),
    enabled: hasPermission('orders:read'),
  });

  const firstName = user?.fullName.split(' ')[0] || 'there';
  const data = overview.data;
  const rangeLabel = describeRange(range).toLowerCase();

  const kpiValue = (key: KpiKey, value: number) => {
    const cfg = KPI_CONFIG.find((k) => k.key === key)!;
    if (cfg.money) return formatCompactCurrency(value);
    if (cfg.percent) return formatPercent(value);
    return formatNumber(value);
  };

  const periodTotal = useMemo(() => {
    if (!data) return null;
    if (metric === 'aov') return formatCurrency(data.kpis.aov.value);
    const total = data.series.reduce((s, p) => s + p[metric], 0);
    return METRIC_META[metric].money ? formatCurrency(total) : formatNumber(total);
  }, [data, metric]);

  const orderColumns: Column<OrderRow>[] = [
    {
      id: 'order', header: 'Order', mobile: 'primary', hideable: false,
      cell: (o) => <div><Link to={`/orders/${o.id}`} className="link font-mono text-[13px]" onClick={(e) => e.stopPropagation()}>{o.order_number}</Link><p className="whitespace-nowrap text-xs text-faint">{formatDate(o.created_at)}</p></div>,
    },
    { id: 'customer', header: 'Customer', cell: (o) => <div className="min-w-0"><p className="truncate text-ink">{o.customer_name || 'Customer'}</p><p className="truncate text-xs text-faint">{o.customer_email}</p></div> },
    { id: 'vendor', header: 'Vendor', defaultHidden: true, cell: (o) => <span className="block max-w-[160px] truncate">{o.vendor_names || '—'}</span> },
    { id: 'items', header: 'Items', align: 'right', defaultHidden: true, cell: (o) => <span className="tabular">{o.item_count}</span> },
    { id: 'amount', header: 'Amount', align: 'right', cell: (o) => <span className="tabular font-medium text-ink">{formatCurrency(o.total_minor)}</span> },
    { id: 'payment', header: 'Payment', cell: (o) => <span className="text-xs"><span className="font-medium uppercase text-ink-2">{o.payment_method}</span>{o.payment_status && <span className="text-faint"> · {o.payment_status}</span>}</span> },
    { id: 'status', header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
  ];

  const queues = QUEUE_CONFIG.filter((q) => hasPermission(q.permission));
  const pending = data ? queues.reduce((s, q) => s + data.queues[q.key], 0) : 0;

  const renderKpi = (k: (typeof KPI_CONFIG)[number]) => {
    const kpi = data?.kpis[k.key];
    const MetricIcon = ({ gmv: ShoppingBag, netSales: Wallet, orders: Package, aov: BadgePercent, newCustomers: Plus, activeVendors: Boxes, repeatRate: RotateCcw, refundRate: ArrowRight })[k.key];
    return (
      <KpiCard
        key={k.key}
        label={k.label}
        icon={<MetricIcon size={17} />}
        loading={!data}
        value={kpi ? kpiValue(k.key, kpi.value) : '—'}
        previous={kpi ? kpiValue(k.key, kpi.previous) : undefined}
        change={kpi?.change}
        invert={k.invert}
        series={k.series && data ? data.series.map((p) => p[k.series!]) : undefined}
        to={k.to}
        hint={k.hint}
      />
    );
  };

  return (
    <div className="commerce-dashboard space-y-6">
      {/* Command band: who/when, period, primary actions and the four money metrics. */}
      <section className="commerce-command" aria-label="Overview">
        <header className="commerce-command-head">
          <div>
            <p className="commerce-command-date">{new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date())}</p>
            <h1>{greeting()}, <em>{firstName}</em></h1>
            <p className="commerce-command-sub">Here’s what is happening across Sureshot {range.preset === 'today' ? 'today' : `over the ${rangeLabel}`}.</p>
          </div>
          <div className="commerce-command-actions">
            <DateRangePicker value={range} onChange={setRange} />
            {hasPermission('products:create') && <Button size="sm" className="h-9" onClick={() => navigate('/products/new')}><Plus className="h-4 w-4" /> Add product</Button>}
            {hasPermission('vendors:read') && <Button size="sm" variant="outline" className="h-9" onClick={() => navigate('/vendors/applications')}><ClipboardCheck className="h-4 w-4" /> Vendor applications</Button>}
            {hasPermission('coupons:manage') && <Button size="sm" variant="outline" className="h-9" onClick={() => navigate('/coupons?new=1')}><BadgePercent className="h-4 w-4" /> Create coupon</Button>}
            {hasPermission('orders:read') && <Button size="sm" variant="ghost" className="h-9" onClick={() => navigate('/orders')}>View orders <ArrowRight className="h-4 w-4" /></Button>}
          </div>
        </header>
        {overview.error && !data ? (
          <div className="commerce-command-error"><ErrorState message="We couldn’t load your platform overview." error={overview.error} onRetry={() => void overview.refetch()} /></div>
        ) : (
          <div aria-label="Key metrics" role="group" className="commerce-ledger">{KPI_CONFIG.slice(0, 4).map(renderKpi)}</div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Sales performance"
            description={METRIC_META[metric].description}
            action={
              <Segmented
                label="Chart metric"
                value={metric}
                onChange={setMetric}
                options={[{ value: 'revenue', label: 'Revenue' }, { value: 'orders', label: 'Orders' }, { value: 'customers', label: 'Customers' }, { value: 'aov', label: 'AOV' }]}
              />
            }
          />
          <div className="px-5 pb-4 pt-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs text-muted">{METRIC_META[metric].label} · {rangeLabel}</p>
                {data ? <p className="tabular font-display text-2xl font-semibold tracking-tight text-ink">{periodTotal}</p> : <Skeleton className="mt-1 h-7 w-32" />}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Checkbox checked={compare} onChange={setCompare} label={<span className="text-xs font-medium text-ink-2">Compare to previous period</span>} />
                <Segmented
                  label="Chart range"
                  size="xs"
                  value={range.preset}
                  onChange={(p) => p !== 'custom' && setRange(rangeFromPreset(p))}
                  options={[{ value: '7d', label: '7D' }, { value: '30d', label: '30D' }, { value: '90d', label: '90D' }, { value: '12m', label: '12M' }]}
                />
              </div>
            </div>
            {overview.error && !data ? null : !data ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <SalesChart series={data.series} previousSeries={data.previousSeries} metric={metric} compare={compare} zoom />
            )}
            <p className="mt-3 text-2xs text-faint">Drag the chart handles to explore a specific period.</p>
          </div>
        </Card>

        <Card className="commerce-queue">
          <CardHeader title="Needs attention" description={data ? (pending ? `${pending} item${pending === 1 ? '' : 's'} waiting on the team` : 'Nothing is waiting on you') : 'Checking queues…'} />
          <ul className="divide-y divide-line">
            {queues.map((q) => {
              const count = data?.queues[q.key];
              return (
                <li key={q.key}>
                  <Link to={q.to} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/70" data-hot={count ? 'true' : undefined}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted group-hover:text-ink"><q.icon className="h-4 w-4" aria-hidden /></span>
                    <span className="flex-1 text-[13px] font-medium text-ink">{q.label}</span>
                    {count === undefined ? <Skeleton className="h-5 w-7" /> : (
                      <span className={`tabular rounded-md px-2 py-0.5 text-xs font-semibold ${count ? 'bg-warning-soft text-warning' : 'bg-surface-3 text-faint'}`}>{count}</span>
                    )}
                    <ArrowRight className="h-3.5 w-3.5 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
          {data && pending === 0 && (
            <p className="flex items-center gap-2 border-t border-line px-5 py-3 text-xs text-success"><CheckCircle2 className="h-4 w-4" /> All caught up. Nice work.</p>
          )}
        </Card>
      </div>

      {!(overview.error && !data) && (
        <section aria-label="Marketplace health" className="commerce-health">
          <h2 className="commerce-section-title">Marketplace health</h2>
          <div className="commerce-health-grid">{KPI_CONFIG.slice(4).map(renderKpi)}</div>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        {hasPermission('orders:read') && (
          <div className="xl:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="commerce-section-title">Recent orders</h2>
              <Link to="/orders" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">All orders <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
            <DataTable
              caption="Recent orders"
              storageKey="dashboard-orders-v2"
              columns={orderColumns}
              rows={recent.data?.items ?? []}
              rowKey={(o) => o.id}
              loading={recent.isLoading}
              error={recent.error}
              onRetry={() => void recent.refetch()}
              onRowClick={(o) => navigate(`/orders/${o.id}`)}
              rowActions={(o) => <OrderRowActions order={o} />}
              empty={{ icon: ShoppingBag, title: 'No orders yet', message: 'Orders appear here the moment customers check out.' }}
            />
          </div>
        )}
        <Card>
          <CardHeader title="Order status" description={`Placed orders · ${rangeLabel}`} />
          {breakdown.isLoading ? <div className="p-5"><Skeleton className="h-72 w-full" /></div> : breakdown.error ? <ErrorState compact message="Could not load order status." error={breakdown.error} onRetry={() => void breakdown.refetch()} /> : <OrderStatusSummary rows={breakdown.data?.statuses ?? []} />}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {(['products', 'categories', 'vendors'] as const).map((group) => {
          const rows = breakdown.data?.[group] ?? [];
          const max = Math.max(1, ...rows.map((r) => r.revenue_minor));
          const title = { products: 'Top products', categories: 'Top categories', vendors: 'Top vendors' }[group];
          const link = { products: (id: string) => `/products/${id}`, categories: () => '/analytics?tab=products', vendors: (id: string) => `/vendors/${id}` }[group];
          return (
            <Card key={group}>
              <CardHeader title={title} description={`By net sales · ${rangeLabel}`} action={<Link to="/analytics" className="text-xs font-medium text-muted hover:text-ink">Analytics</Link>} />
              <div className="p-5">
                {breakdown.isLoading ? (
                  <div className="space-y-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : breakdown.error ? (
                  <ErrorState compact message="Couldn’t load rankings." error={breakdown.error} onRetry={() => void breakdown.refetch()} />
                ) : rows.length === 0 ? (
                  <div className="flex items-center gap-3 rounded-lg bg-surface-2 px-4 py-6 text-[13px] text-muted">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-faint" /> No net sales in this period yet. Cancelled and refunded orders aren’t counted.
                  </div>
                ) : (
                  <ol className="space-y-3.5">
                    {rows.map((r, i) => (
                      <li key={r.id}>
                        <Link to={link(r.id)} className="group block">
                          <div className="flex items-baseline justify-between gap-3 text-[13px]">
                            <span className="flex min-w-0 items-baseline gap-2">
                              <span className="tabular text-2xs text-faint">{String(i + 1).padStart(2, '0')}</span>
                              <span className="truncate font-medium text-ink group-hover:underline">{r.name}</span>
                            </span>
                            <span className="tabular shrink-0 font-medium text-ink">{formatCompactCurrency(r.revenue_minor)}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                            <div className="h-full rounded-full bg-sage transition-[width] duration-500" style={{ width: `${(r.revenue_minor / max) * 100}%` }} />
                          </div>
                          <p className="mt-1 text-2xs text-faint">{formatNumber(r.units)} units · {formatNumber(r.orders)} orders</p>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </Card>
          );
        })}
      </div>
        <Card className="flex flex-col">
          <CardHeader
            title="Live activity"
            description="Updates every 30 seconds"
            action={<span className="relative flex h-2.5 w-2.5" aria-hidden><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" /></span>}
          />
          <div className="max-h-[460px] flex-1 overflow-y-auto">
            <ActivityFeed limit={14} />
          </div>
        </Card>
    </div>
  );
}
