import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, BadgePercent, Boxes, CheckCircle2, ClipboardCheck, LifeBuoy, Package, Plus, RefreshCw, Repeat, RotateCcw, ShoppingBag, Star, UserPlus, Wallet,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';

import { analyticsApi, type KpiKey } from '../../api/analytics';
import { ordersApi, type OrderRow } from '../../api/commerce';
import { useAuth } from '../../auth/AuthContext';
import { KpiCard } from '../../components/charts/KpiCard';
import { METRIC_META, SalesChart, type SalesMetric } from '../../components/charts/SalesChart';
import { StatusBadge } from '../../components/ui/Badge';
import { BlurFade, NumberTicker, ProgressRing } from '../../components/fx';
import { Card, CardHeader } from '../../components/ui/Card';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { DateRangePicker, describeRange, rangeFromPreset, type DateRange } from '../../components/ui/DateRangePicker';
import { ErrorState } from '../../components/ui/EmptyState';
import { Checkbox } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { Segmented } from '../../components/ui/Tabs';
import { formatCompactCurrency, formatCurrency, formatDate, formatNumber, formatPercent } from '../../lib/format';
import { storage } from '../../lib/storage';
import { getSocket } from '../../lib/socket';
import { useToast } from '../../components/ui/Toast';
import { OrderRowActions } from '../orders/OrderRowActions';
import { ActivityFeed } from './ActivityFeed';

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

// A card only links where the viewer may actually open the destination.
const KPI_PERMISSION: Record<KpiKey, string> = {
  gmv: 'analytics:read', netSales: 'analytics:read', orders: 'orders:read', aov: 'analytics:read',
  newCustomers: 'users:read', activeVendors: 'vendors:read', repeatRate: 'analytics:read', refundRate: 'returns:read',
};
const KPI_ICONS: Record<KpiKey, ReactNode> = {
  gmv: <ShoppingBag size={15} />, netSales: <Wallet size={15} />, orders: <Package size={15} />, aov: <BadgePercent size={15} />,
  newCustomers: <UserPlus size={15} />, activeVendors: <Boxes size={15} />, repeatRate: <Repeat size={15} />, refundRate: <RotateCcw size={15} />,
};

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
    refetchInterval: 60_000,
  });
  const breakdown = useQuery({
    queryKey: ['admin-breakdown', range.from, range.to],
    queryFn: () => analyticsApi.breakdown({ from: range.from, to: range.to }, 5),
  });
  const recent = useQuery({
    queryKey: ['admin-orders', 'recent'],
    queryFn: () => ordersApi.list({ limit: 8 }),
    enabled: hasPermission('orders:read'),
    refetchInterval: 60_000,
  });

  // Live updates: the backend already pushes `notification` and support events to staff over Socket.IO.
  // They only tell us *something changed*, so we refetch the real numbers (debounced) instead of patching values locally.
  const queryClient = useQueryClient();
  const toast = useToast();
  const seenTickets = useRef(new Set<string>());
  useEffect(() => {
    const socket = getSocket();
    let timer = 0;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        for (const key of ['admin-overview', 'admin-breakdown', 'admin-orders', 'admin-activity']) void queryClient.invalidateQueries({ queryKey: [key] });
      }, 600);
    };
    const onTicket = (p: { ticketId?: string; ticketNumber?: string; subject?: string }) => {
      refresh();
      if (p.ticketId && !seenTickets.current.has(p.ticketId)) {
        seenTickets.current.add(p.ticketId);
        if (hasPermission('support:manage')) toast.info('New support ticket', p.subject ? `${p.ticketNumber ?? ''} ${p.subject}`.trim() : undefined);
      }
    };
    socket.on('notification', refresh);
    socket.on('support:new_ticket', onTicket);
    socket.on('support:message', refresh);
    return () => { window.clearTimeout(timer); socket.off('notification', refresh); socket.off('support:new_ticket', onTicket); socket.off('support:message', refresh); };
  }, [queryClient, toast, hasPermission]);

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

  return (
    <div className="dashboard-composition space-y-6">
      <header className="ref-greet">
        <BlurFade className="ref-greet-copy">
          <p className="eyebrow">{new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date())}</p>
          <h1>{greeting()}, {firstName}!<span>What’s the plan for today?</span></h1>
          <p className="ref-greet-sub">Here’s what is happening across Sureshot {range.preset === 'today' ? 'today' : `over the ${rangeLabel}`}.</p>
          <div className="mt-3"><DateRangePicker value={range} onChange={setRange} /></div>
        </BlurFade>
        <div className="ref-tiles">
          {hasPermission('products:create') && (
            <BlurFade delay={0.05}><Link to="/products/new" className="ref-tile ref-tile-add" aria-label="Add product"><span className="ref-tile-plus"><Plus className="h-5 w-5" aria-hidden /></span><span>Add product</span></Link></BlurFade>
          )}
          {[
            hasPermission('vendors:read') && { to: '/vendors/applications', icon: ClipboardCheck, title: 'Review sellers', text: 'Approve new vendor applications' },
            hasPermission('coupons:manage') && { to: '/coupons?new=1', icon: BadgePercent, title: 'Run a promotion', text: 'Create a coupon in seconds' },
            hasPermission('orders:read') && { to: '/orders', icon: ShoppingBag, title: 'Fulfil orders', text: 'Everything placed, from checkout to door' },
          ].filter(Boolean).map((t, i) => {
            const tile = t as { to: string; icon: typeof Plus; title: string; text: string };
            return (
              <BlurFade key={tile.to} delay={0.1 + i * 0.06}>
                <motion.div whileHover={{ y: -5 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}>
                  <Link to={tile.to} className="ref-tile"><tile.icon className="h-6 w-6 text-ink-2" aria-hidden /><b>{tile.title}</b><small>{tile.text}</small></Link>
                </motion.div>
              </BlurFade>
            );
          })}
        </div>
      </header>

      {overview.error && !data ? (
        <Card><ErrorState message="We couldn’t load your platform overview." error={overview.error} onRetry={() => void overview.refetch()} /></Card>
      ) : (
        <section aria-label="Key metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {KPI_CONFIG.map((k) => {
            const kpi = data?.kpis[k.key];
            return (
              <KpiCard
                key={k.key}
                label={k.label}
                loading={!data}
                value={kpi ? kpiValue(k.key, kpi.value) : '—'}
                raw={kpi?.value}
                format={(n) => kpiValue(k.key, n)}
                icon={KPI_ICONS[k.key]}
                previous={kpi ? kpiValue(k.key, kpi.previous) : undefined}
                change={kpi?.change}
                invert={k.invert}
                series={k.series && data ? data.series.map((p) => p[k.series!]) : undefined}
                to={hasPermission(KPI_PERMISSION[k.key]) ? k.to : undefined}
                hint={k.hint}
              />
            );
          })}
        </section>
      )}

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
            {overview.error && !data ? (
              <ErrorState compact message="The sales chart couldn’t load." error={overview.error} onRetry={() => void overview.refetch()} />
            ) : !data ? (
              <Skeleton className="h-[300px] w-full" />
            ) : data.series.every((p) => !p[metric]) ? (
              <div className="chart-empty" style={{ height: 300 }}>
                <p><b>No {METRIC_META[metric].label.toLowerCase()} in this period</b></p>
                <span>Nothing was recorded for {rangeLabel}. Try a longer range{metric !== 'revenue' ? ' or another metric' : ''}.</span>
              </div>
            ) : (
              <div key={`${metric}-${range.from}-${range.to}`} className="chart-swap">
                <SalesChart series={data.series} previousSeries={data.previousSeries} metric={metric} compare={compare} zoom />
              </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-2xs text-faint">Live from orders in the database. Drag the handles below the chart to zoom on long ranges.</p>
              <button type="button" className="chart-refresh" onClick={() => void overview.refetch()} disabled={overview.isFetching} aria-label="Refresh dashboard data">
                <RefreshCw className={`h-3.5 w-3.5 ${overview.isFetching ? 'animate-spin' : ''}`} aria-hidden />
                <span>{overview.isFetching ? 'Refreshing…' : overview.dataUpdatedAt ? `Updated ${new Date(overview.dataUpdatedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : 'Refresh'}</span>
              </button>
            </div>
          </div>
        </Card>

        <Card>
          {(() => {
            // Reference focal card: the single most urgent queue, one action.
            const top = data ? [...queues].sort((a, b) => data.queues[b.key] - data.queues[a.key])[0] : undefined;
            const topCount = top && data ? data.queues[top.key] : 0;
            return (
              <div className="focus-card" aria-live="polite">
                <span className="focus-card-icon">{top ? <top.icon className="h-5 w-5" aria-hidden /> : <CheckCircle2 className="h-5 w-5" aria-hidden />}</span>
                <p className="focus-card-title">{!data ? 'Checking queues…' : topCount ? <><NumberTicker value={topCount} className="text-white" /> {top!.label.toLowerCase()}</> : 'All caught up'}</p>
                <p className="focus-card-text">{!data ? 'Counting what needs the team.' : pending ? `${pending} item${pending === 1 ? '' : 's'} waiting across ${queues.filter((q) => data.queues[q.key] > 0).length} queue${queues.filter((q) => data.queues[q.key] > 0).length === 1 ? '' : 's'}.` : 'Nothing is waiting on you right now.'}</p>
                {data && topCount > 0 && <Link to={top!.to} className="focus-card-cta">Review now <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>}
              </div>
            );
          })()}
          {data && (
            <div className="ref-rings">
              <div><ProgressRing value={data.kpis.repeatRate.value} tone="mint" label={`Repeat customer rate ${formatPercent(data.kpis.repeatRate.value)}`} /><span><small>CUSTOMERS</small><b>Repeat rate</b><em>Buyers who came back</em></span></div>
              <div><ProgressRing value={data.kpis.refundRate.value} tone="coral" label={`Refund rate ${formatPercent(data.kpis.refundRate.value)}`} /><span><small>RETURNS</small><b>Refund rate</b><em>Returned or refunded</em></span></div>
            </div>
          )}
          <CardHeader title="Needs attention" description={data ? (pending ? `${pending} item${pending === 1 ? '' : 's'} waiting on the team` : 'Nothing is waiting on you') : 'Checking queues…'} />
          <ul className="divide-y divide-line">
            {queues.map((q) => {
              const count = data?.queues[q.key];
              return (
                <li key={q.key}>
                  <Link to={q.to} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/70">
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

      <div className="grid gap-4 xl:grid-cols-3">
        {hasPermission('orders:read') && (
          <div className="xl:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold tracking-tight">Recent orders</h2>
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
    </div>
  );
}
