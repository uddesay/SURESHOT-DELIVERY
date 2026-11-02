import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, MessageSquareMore, Package, PauseCircle, Percent, PlayCircle, ScrollText, ShoppingBag, Star, Wallet, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { OrderRow } from '../../api/commerce';
import type { ProductRow } from '../../api/catalog';
import { peopleApi } from '../../api/people';
import { useAuth } from '../../auth/AuthContext';
import { KpiCard } from '../../components/charts/KpiCard';
import { useBreadcrumb } from '../../components/layout/ShellContext';
import { Avatar } from '../../components/ui/Avatar';
import { StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Field, Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { usePagedQuery } from '../../hooks/useListState';
import { formatCompactCurrency, formatCurrency, formatDate, formatDateTime, formatNumber, humanize } from '../../lib/format';
import { useVendorActions } from './useVendorActions';
import { VendorBusinessCard, VendorDocumentsCard, VendorOwnerCard } from './VendorDossier';
import { commissionLabel } from './vendorFormat';

type Tab = 'overview' | 'products' | 'orders' | 'payouts' | 'reviews' | 'documents' | 'activity';

interface AuditRow { id: string; action: string; actor_name: string | null; created_at: string }

export function VendorDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const actions = useVendorActions();
  const [tab, setTab] = useState<Tab>('overview');
  const [page, setPage] = useState(1);
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [commission, setCommission] = useState('');
  const vendor = useQuery({ queryKey: ['admin-vendor', id], queryFn: () => peopleApi.vendor(id!) });
  useBreadcrumb(vendor.data?.store_name);

  const products = usePagedQuery<ProductRow>(['admin-products', 'vendor', id], '/admin/products', { vendorId: id, page, limit: 10 }, tab === 'products');
  const orders = usePagedQuery<OrderRow>(['admin-orders', 'vendor', id], '/admin/orders', { vendorId: id, page, limit: 10 }, tab === 'orders');
  const activity = usePagedQuery<AuditRow>(['audit-logs', 'vendor', id], '/admin/audit-logs', { entityType: 'vendor', entityId: id, page, limit: 20 }, tab === 'activity' && hasPermission('audit_logs:read'));

  const saveCommission = useMutation({
    mutationFn: (bp: number | null) => peopleApi.setCommission(id!, bp),
    onSuccess: () => { toast.success('Commission updated', 'Applies to new orders from this vendor.'); setCommissionOpen(false); actions.invalidate(); },
    onError: (e) => toast.fromError(e),
  });

  if (vendor.isLoading) return <PageSkeleton />;
  if (vendor.error || !vendor.data) return <Card><ErrorState message="This vendor couldn’t be loaded." error={vendor.error} onRetry={() => void vendor.refetch()} /></Card>;

  const v = vendor.data;
  const productTotal = Object.values(v.stats.products).reduce((s, n) => s + n, 0);
  const pendingReview = ['pending', 'under_review'].includes(v.status) && hasPermission('vendors:approve');
  const changeTab = (t: Tab) => { setTab(t); setPage(1); };

  return (
    <div>
      <PageHeader
        back={{ to: '/vendors', label: 'Vendors' }}
        title={<span className="flex items-center gap-3"><Avatar name={v.store_name} src={v.logo_url} size="md" square />{v.store_name}</span>}
        meta={<StatusBadge status={v.status} />}
        description={`/${v.store_slug} · joined ${formatDate(v.created_at)}${v.rating_count ? ` · ★ ${Number(v.rating_avg).toFixed(1)} from ${v.rating_count} ratings` : ''}`}
        actions={
          <>
            {hasPermission('vendors:update') && <Button size="sm" variant="outline" className="h-9" onClick={() => { setCommission(v.commission_rate_bp == null ? '' : String(v.commission_rate_bp / 100)); setCommissionOpen(true); }}><Percent className="h-4 w-4" /> Commission</Button>}
            {pendingReview && (
              <>
                <Button size="sm" variant="ghost" className="h-9" onClick={() => void actions.requestInfo(v)}><MessageSquareMore className="h-4 w-4" /> Request info</Button>
                <Button size="sm" variant="outline" className="h-9 text-danger" onClick={() => void actions.reject(v)}><XCircle className="h-4 w-4" /> Reject</Button>
                <Button size="sm" className="h-9" onClick={() => void actions.approve(v)}><CheckCircle2 className="h-4 w-4" /> Approve</Button>
              </>
            )}
            {v.status === 'approved' && hasPermission('vendors:suspend') && <Button size="sm" variant="outline" className="h-9 text-danger" onClick={() => void actions.suspend(v)}><PauseCircle className="h-4 w-4" /> Suspend</Button>}
            {v.status === 'suspended' && hasPermission('vendors:suspend') && <Button size="sm" className="h-9" onClick={() => void actions.reactivate(v)}><PlayCircle className="h-4 w-4" /> Reactivate</Button>}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <KpiCard label="Net sales" value={formatCompactCurrency(v.stats.revenueMinor)} hint="Confirmed to delivered" />
        <KpiCard label="Orders" value={formatNumber(v.stats.orders)} hint="Containing their items" to={`/orders?vendorId=${v.id}`} />
        <KpiCard label="Customers" value={formatNumber(v.stats.customers)} hint="Unique buyers" />
        <KpiCard label="Commission earned" value={formatCompactCurrency(v.stats.commissionMinor)} hint={`Rate: ${commissionLabel(v.commission_rate_bp)}`} />
        <KpiCard label="Products" value={formatNumber(productTotal)} hint={`${v.stats.products.active ?? 0} live · ${v.stats.products.pending_approval ?? 0} in review`} to={`/products?vendorId=${v.id}`} />
      </div>

      <Tabs label="Vendor sections" className="mb-5" value={tab} onChange={changeTab} tabs={[
        { key: 'overview', label: 'Overview' }, { key: 'products', label: 'Products', count: productTotal }, { key: 'orders', label: 'Orders', count: v.stats.orders },
        { key: 'payouts', label: 'Payouts' }, { key: 'reviews', label: 'Reviews' }, { key: 'documents', label: 'Documents', count: v.kycDocuments.length }, { key: 'activity', label: 'Activity' },
      ]} />

      {tab === 'overview' && (
        <div className="grid gap-5 xl:grid-cols-2">
          <VendorBusinessCard vendor={v} />
          <div className="space-y-5">
            <VendorOwnerCard vendor={v} />
            <Card>
              <CardHeader title="Categories" description="Where their products are listed" />
              <div className="flex flex-wrap gap-1.5 p-5">
                {v.categories.length ? v.categories.map((c) => <Link key={c.id} to={`/products?vendorId=${v.id}&categoryId=${c.id}`} className="rounded-md bg-surface-2 px-2 py-1 text-xs hover:bg-surface-3">{c.name} · {c.products}</Link>) : <p className="text-sm text-muted">No products listed yet.</p>}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'products' && (
        <DataTable caption="Vendor products" rows={products.items} rowKey={(p) => p.id} loading={products.isLoading} error={products.error} onRetry={() => void products.refetch()}
          onRowClick={(p) => navigate(`/products/${p.id}`)}
          pagination={{ page, totalPages: products.totalPages, total: products.total, onPageChange: setPage }}
          empty={{ icon: Package, title: 'No products yet' }}
          columns={[
            { id: 'title', header: 'Product', mobile: 'primary', hideable: false, cell: (p) => <span className="font-medium text-ink">{p.title}</span> },
            { id: 'sku', header: 'SKU', cell: (p) => <span className="font-mono text-xs">{p.sku ?? '—'}</span> },
            { id: 'price', header: 'Price', align: 'right', cell: (p) => <span className="tabular">{p.price_minor == null ? '—' : formatCurrency(p.price_minor)}</span> },
            { id: 'stock', header: 'Stock', align: 'right', cell: (p) => <span className="tabular">{p.stock}</span> },
            { id: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
          ]} />
      )}

      {tab === 'orders' && (
        <DataTable caption="Vendor orders" rows={orders.items} rowKey={(o) => o.id} loading={orders.isLoading} error={orders.error} onRetry={() => void orders.refetch()}
          onRowClick={(o) => navigate(`/orders/${o.id}`)}
          pagination={{ page, totalPages: orders.totalPages, total: orders.total, onPageChange: setPage }}
          empty={{ icon: ShoppingBag, title: 'No orders yet' }}
          columns={[
            { id: 'order', header: 'Order', mobile: 'primary', hideable: false, cell: (o) => <span className="font-mono text-[13px] font-medium text-ink">{o.order_number}</span> },
            { id: 'customer', header: 'Customer', cell: (o) => o.customer_name ?? '—' },
            { id: 'date', header: 'Placed', cell: (o) => formatDate(o.created_at) },
            { id: 'total', header: 'Order total', align: 'right', cell: (o) => <span className="tabular">{formatCurrency(o.total_minor)}</span> },
            { id: 'status', header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
          ]} />
      )}

      {tab === 'payouts' && (
        <Card>
          <CardHeader title="Payouts" description="Most recent 10" action={hasPermission('payouts:approve') && <Link to={`/payouts?vendorId=${v.id}`} className="text-xs font-medium text-sage hover:underline">Manage payouts</Link>} />
          {v.payouts.length === 0 ? <EmptyState compact icon={Wallet} title="No payouts yet" action={hasPermission('payouts:approve') && v.status === 'approved' ? <Button size="sm" variant="outline" onClick={() => navigate(`/payouts?generate=${v.id}`)}>Generate payout</Button> : undefined} /> : (
            <ul className="divide-y divide-line">
              {v.payouts.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <span className="flex-1 text-ink-2">{formatDate(p.period_start)} – {formatDate(p.period_end)}</span>
                  <span className="tabular font-medium text-ink">{formatCurrency(p.net_minor)}</span>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'reviews' && (
        <Card>
          <CardHeader title="Recent product reviews" action={hasPermission('reviews:moderate') && <Link to="/reviews" className="text-xs font-medium text-sage hover:underline">Moderate reviews</Link>} />
          {v.reviews.length === 0 ? <EmptyState compact icon={Star} title="No reviews yet" /> : (
            <ul className="divide-y divide-line">
              {v.reviews.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <span className="tabular text-warning">{'★'.repeat(r.rating)}<span className="text-faint">{'★'.repeat(5 - r.rating)}</span></span>
                  <span className="min-w-0 flex-1"><span className="font-medium text-ink">{r.title || 'Untitled review'}</span><span className="text-muted"> · {r.product_title}</span></span>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'documents' && <div className="grid gap-5 xl:grid-cols-2"><VendorDocumentsCard vendor={v} onChanged={actions.invalidate} /></div>}

      {tab === 'activity' && (
        hasPermission('audit_logs:read') ? (
          <DataTable caption="Vendor activity" rows={activity.items} rowKey={(a) => a.id} loading={activity.isLoading} error={activity.error} onRetry={() => void activity.refetch()}
            pagination={{ page, totalPages: activity.totalPages, total: activity.total, onPageChange: setPage }}
            empty={{ icon: ScrollText, title: 'No recorded staff actions yet', message: 'Approvals, suspensions and commission changes are logged here.' }}
            columns={[
              { id: 'action', header: 'Action', mobile: 'primary', hideable: false, cell: (a) => <span className="font-medium text-ink">{humanize(a.action.split(':')[1] ?? a.action)}</span> },
              { id: 'actor', header: 'By', cell: (a) => a.actor_name ?? 'System' },
              { id: 'at', header: 'When', cell: (a) => formatDateTime(a.created_at) },
            ]} />
        ) : <Card><EmptyState compact icon={ScrollText} title="Activity requires audit log access" /></Card>
      )}

      <Modal
        open={commissionOpen}
        onClose={() => setCommissionOpen(false)}
        title="Commission rate"
        description="Overrides category commission for this vendor’s new orders."
        size="sm"
        footer={
          <>
            {v.commission_rate_bp != null && <Button variant="ghost" className="mr-auto" isLoading={saveCommission.isPending && saveCommission.variables === null} onClick={() => saveCommission.mutate(null)}>Use category default</Button>}
            <Button variant="outline" onClick={() => setCommissionOpen(false)}>Cancel</Button>
            <Button disabled={commission === '' || !(Number(commission) >= 0 && Number(commission) <= 50)} isLoading={saveCommission.isPending && saveCommission.variables !== null} onClick={() => saveCommission.mutate(Math.round(Number(commission) * 100))}>Save</Button>
          </>
        }
      >
        <Field label="Commission (%)" hint="0–50%. Leave the category default to vary by category." error={commission !== '' && !(Number(commission) >= 0 && Number(commission) <= 50) ? 'Enter 0–50.' : null}>
          <Input type="number" min={0} max={50} step="0.1" autoFocus value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="Category default" />
        </Field>
      </Modal>
    </div>
  );
}
