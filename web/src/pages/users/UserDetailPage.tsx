import { useQuery } from '@tanstack/react-query';
import { Heart, Home, Mail, PauseCircle, Phone, PlayCircle, ScrollText, ShoppingBag, Star, Store } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import type { OrderRow } from '../../api/commerce';
import { peopleApi } from '../../api/people';
import { useAuth } from '../../auth/AuthContext';
import { KpiCard } from '../../components/charts/KpiCard';
import { useBreadcrumb } from '../../components/layout/ShellContext';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { Tabs } from '../../components/ui/Tabs';
import { usePagedQuery } from '../../hooks/useListState';
import { formatCurrency, formatDate, formatDateTime, formatRelative, humanize } from '../../lib/format';
import { useUserStatusActions } from './UsersPage';

type Tab = 'orders' | 'addresses' | 'wishlist' | 'reviews' | 'activity';

interface AuditRow { id: string; action: string; actor_name: string | null; entity_type: string; created_at: string }

export function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isStaffView = pathname.startsWith('/staff');
  const { user: me, hasPermission } = useAuth();
  const actions = useUserStatusActions();
  const [tab, setTab] = useState<Tab>(isStaffView ? 'activity' : 'orders');
  const [page, setPage] = useState(1);
  const profile = useQuery({ queryKey: ['admin-user', id], queryFn: () => peopleApi.user(id!) });
  useBreadcrumb(profile.data?.full_name ?? profile.data?.email);

  const orders = usePagedQuery<OrderRow>(['admin-orders', 'user', id], '/admin/orders', { userId: id, page, limit: 10 }, tab === 'orders' && hasPermission('orders:read'));
  // Staff: what they did. Customers: what staff did to the account.
  const activity = usePagedQuery<AuditRow>(['audit-logs', 'user', id, isStaffView], '/admin/audit-logs', isStaffView ? { actorId: id, page, limit: 20 } : { entityType: 'user', entityId: id, page, limit: 20 }, tab === 'activity' && hasPermission('audit_logs:read'));

  if (profile.isLoading) return <PageSkeleton />;
  if (profile.error || !profile.data) return <Card><ErrorState message="This account couldn’t be loaded." error={profile.error} onRetry={() => void profile.refetch()} /></Card>;

  const u = profile.data;
  const aov = u.totalOrders ? Math.round(u.lifetimeValueMinor / u.totalOrders) : 0;
  const changeTab = (t: Tab) => { setTab(t); setPage(1); };

  return (
    <div>
      <PageHeader
        back={isStaffView ? { to: '/staff', label: 'Staff & roles' } : { to: '/customers', label: 'Customers' }}
        title={<span className="flex items-center gap-3"><Avatar name={u.full_name ?? u.email} size="md" />{u.full_name ?? 'Unnamed account'}</span>}
        meta={<><StatusBadge status={u.status} />{u.roles.filter((r) => r !== 'customer').map((r) => <Badge key={r} tone="brand">{humanize(r)}</Badge>)}</>}
        description={`Joined ${formatDate(u.created_at)} · last sign-in ${u.last_login_at ? formatRelative(u.last_login_at) : 'never'}`}
        actions={
          <>
            {u.email && <Button size="sm" variant="outline" className="h-9" onClick={() => { window.location.href = `mailto:${u.email}`; }}><Mail className="h-4 w-4" /> Email</Button>}
            {hasPermission('users:suspend') && u.id !== me?.id && u.status === 'active' && <Button size="sm" variant="outline" className="h-9 text-danger" onClick={() => void actions.suspend(u)}><PauseCircle className="h-4 w-4" /> Suspend</Button>}
            {hasPermission('users:suspend') && u.status === 'suspended' && <Button size="sm" className="h-9" onClick={() => void actions.reactivate(u)}><PlayCircle className="h-4 w-4" /> Reactivate</Button>}
          </>
        }
      />

      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard label="Orders" value={String(u.totalOrders)} hint="All time" />
          <KpiCard label="Lifetime value" value={formatCurrency(u.lifetimeValueMinor)} hint="Total of all orders" />
          <KpiCard label="Average order" value={aov ? formatCurrency(aov) : '—'} hint="Lifetime value ÷ orders" />
        </div>
        <Card className="space-y-2 p-5 text-sm">
          {u.email && <p className="flex items-center gap-2 text-ink-2"><Mail className="h-4 w-4 text-faint" /> {u.email} {u.is_email_verified && <Badge tone="success">Verified</Badge>}</p>}
          {u.phone && <p className="flex items-center gap-2 text-ink-2"><Phone className="h-4 w-4 text-faint" /> {u.phone} {u.is_phone_verified && <Badge tone="success">Verified</Badge>}</p>}
          {u.vendor && <Link to={`/vendors/${u.vendor.id}`} className="flex items-center gap-2 text-ink-2 hover:text-ink"><Store className="h-4 w-4 text-faint" /> Owns {u.vendor.store_name} <StatusBadge status={u.vendor.status} /></Link>}
        </Card>
      </div>

      <Tabs label="Account sections" className="mb-5" value={tab} onChange={changeTab} tabs={[
        { key: 'orders', label: 'Orders', count: u.totalOrders }, { key: 'addresses', label: 'Addresses', count: u.addresses.length },
        { key: 'wishlist', label: 'Wishlist', count: u.wishlist.length }, { key: 'reviews', label: 'Reviews', count: u.reviews.length }, { key: 'activity', label: 'Activity' },
      ]} />

      {tab === 'orders' && (
        <DataTable caption="Customer orders" rows={orders.items} rowKey={(o) => o.id} loading={orders.isLoading} error={orders.error} onRetry={() => void orders.refetch()}
          onRowClick={(o) => navigate(`/orders/${o.id}`)}
          pagination={{ page, totalPages: orders.totalPages, total: orders.total, onPageChange: setPage }}
          empty={{ icon: ShoppingBag, title: 'No orders yet' }}
          columns={[
            { id: 'order', header: 'Order', mobile: 'primary', hideable: false, cell: (o) => <span className="font-mono text-[13px] font-medium text-ink">{o.order_number}</span> },
            { id: 'date', header: 'Placed', cell: (o) => formatDateTime(o.created_at) },
            { id: 'items', header: 'Items', align: 'right', cell: (o) => o.item_count },
            { id: 'payment', header: 'Payment', cell: (o) => <span className="text-xs uppercase">{o.payment_method}{o.payment_status ? ` · ${o.payment_status}` : ''}</span> },
            { id: 'total', header: 'Total', align: 'right', cell: (o) => <span className="tabular font-medium">{formatCurrency(o.total_minor)}</span> },
            { id: 'status', header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
          ]} />
      )}

      {tab === 'addresses' && (
        u.addresses.length === 0 ? <Card><EmptyState icon={Home} title="No saved addresses" /></Card> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {u.addresses.map((a) => (
              <Card key={a.id} className="p-5 text-sm">
                <div className="mb-2 flex items-center gap-2"><Badge>{humanize(a.label)}</Badge>{a.is_default && <Badge tone="brand">Default</Badge>}</div>
                <p className="font-medium text-ink">{a.recipient_name}</p>
                <p className="text-ink-2">{[a.line1, a.line2].filter(Boolean).join(', ')}</p>
                <p className="text-ink-2">{a.city}, {a.state} {a.postal_code}</p>
                <p className="mt-1 text-muted">{a.recipient_phone}</p>
              </Card>
            ))}
          </div>
        )
      )}

      {tab === 'wishlist' && (
        <Card>
          {u.wishlist.length === 0 ? <EmptyState icon={Heart} title="Wishlist is empty" /> : (
            <ul className="divide-y divide-line">
              {u.wishlist.map((w) => <li key={w.id} className="flex items-center justify-between px-5 py-3 text-sm"><Link to={`/products/${w.id}`} className="font-medium text-ink hover:underline">{w.title}</Link><span className="text-xs text-faint">Saved {formatRelative(w.created_at)}</span></li>)}
            </ul>
          )}
        </Card>
      )}

      {tab === 'reviews' && (
        <Card>
          {u.reviews.length === 0 ? <EmptyState icon={Star} title="No reviews written" /> : (
            <ul className="divide-y divide-line">
              {u.reviews.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <span className="text-warning">{'★'.repeat(r.rating)}<span className="text-faint">{'★'.repeat(5 - r.rating)}</span></span>
                  <span className="min-w-0 flex-1"><span className="font-medium text-ink">{r.title ?? 'Untitled'}</span> · <Link to={`/products/${r.product_id}`} className="text-muted hover:underline">{r.product_title}</Link></span>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'activity' && (hasPermission('audit_logs:read') ? (
        <DataTable caption="Account activity" rows={activity.items} rowKey={(a) => a.id} loading={activity.isLoading} error={activity.error} onRetry={() => void activity.refetch()}
          pagination={{ page, totalPages: activity.totalPages, total: activity.total, onPageChange: setPage }}
          empty={{ icon: ScrollText, title: isStaffView ? 'No recorded actions yet' : 'No staff actions on this account', message: isStaffView ? 'Changes this person makes in the admin are logged here.' : 'Suspensions and other staff changes are logged here.' }}
          columns={[
            { id: 'action', header: 'Action', mobile: 'primary', hideable: false, cell: (a) => <span className="font-medium text-ink">{humanize(a.action.replace(':', ' · '))}</span> },
            { id: 'entity', header: 'On', cell: (a) => humanize(a.entity_type) },
            { id: 'actor', header: 'By', cell: (a) => a.actor_name ?? 'System' },
            { id: 'when', header: 'When', cell: (a) => formatDateTime(a.created_at) },
          ]} />
      ) : <Card><EmptyState compact icon={ScrollText} title="Activity requires audit log access" /></Card>)}
    </div>
  );
}
