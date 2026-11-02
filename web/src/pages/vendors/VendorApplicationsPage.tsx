import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { CheckCircle2, ClipboardCheck, MessageSquareMore, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { peopleApi, type VendorRow } from '../../api/people';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../components/ui/Avatar';
import { StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { usePagedQuery } from '../../hooks/useListState';
import { formatRelative } from '../../lib/format';
import { useVendorActions } from './useVendorActions';
import { VendorBusinessCard, VendorDocumentsCard, VendorOwnerCard } from './VendorDossier';

export function VendorApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const { hasPermission } = useAuth();
  const actions = useVendorActions();
  const apps = usePagedQuery<VendorRow>(['admin-vendors', 'applications'], '/admin/vendors', { status: 'pending,under_review', limit: 50 });
  const selectedId = params.get('id') ?? apps.items[0]?.id ?? null;
  const detail = useQuery({ queryKey: ['admin-vendor', selectedId], queryFn: () => peopleApi.vendor(selectedId!), enabled: Boolean(selectedId) });

  // Keep the URL pointing at a vendor that is still in the queue.
  useEffect(() => {
    if (!apps.isLoading && params.get('id') && !apps.items.some((a) => a.id === params.get('id')) && detail.data && !['pending', 'under_review'].includes(detail.data.status)) {
      setParams({}, { replace: true });
    }
  }, [apps.isLoading, apps.items, params, detail.data, setParams]);

  const v = detail.data;
  const canDecide = hasPermission('vendors:approve') && v && ['pending', 'under_review'].includes(v.status);
  const pendingDocs = v?.kycDocuments.filter((d) => d.status === 'pending').length ?? 0;

  return (
    <div>
      <PageHeader eyebrow="Marketplace" title="Vendor applications" description="Review business details, documents and bank accounts, then approve, reject or ask for more information." />
      {apps.error ? (
        <Card><ErrorState message="Applications couldn’t load." error={apps.error} onRetry={() => void apps.refetch()} /></Card>
      ) : !apps.isLoading && apps.items.length === 0 && !params.get('id') ? (
        <Card><EmptyState icon={ClipboardCheck} title="No applications waiting" message="New seller sign-ups land here for review. You’re all caught up." action={<Link to="/vendors" className="text-sm font-medium text-sage hover:underline">View all vendors</Link>} /></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="h-fit overflow-hidden lg:sticky lg:top-24">
            <div className="border-b border-line px-4 py-3 text-[13px] font-medium text-ink">{apps.total} waiting</div>
            {apps.isLoading ? (
              <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <ul role="listbox" aria-label="Applications" className="max-h-[70vh] divide-y divide-line overflow-y-auto">
                {apps.items.map((a) => (
                  <li key={a.id} role="option" aria-selected={a.id === selectedId}>
                    <button onClick={() => setParams({ id: a.id }, { replace: true })} className={clsx('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors', a.id === selectedId ? 'bg-brand-soft' : 'hover:bg-surface-2')}>
                      <Avatar name={a.store_name} src={a.logo_url} size="sm" square />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{a.store_name}</span>
                        <span className="block truncate text-xs text-muted">{a.owner_name} · {formatRelative(a.created_at)}</span>
                      </span>
                      <StatusBadge status={a.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="min-w-0 space-y-5">
            {detail.isLoading || (!v && selectedId) ? <PageSkeleton /> : detail.error ? (
              <Card><ErrorState message="This application couldn’t load." error={detail.error} onRetry={() => void detail.refetch()} /></Card>
            ) : v ? (
              <>
                <Card className="flex flex-wrap items-center gap-4 p-5">
                  <Avatar name={v.store_name} src={v.logo_url} size="lg" square />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold text-ink">{v.store_name}</h2><StatusBadge status={v.status} /></div>
                    <p className="text-sm text-muted">Applied {formatRelative(v.created_at)} · <Link to={`/vendors/${v.id}`} className="hover:underline">Open full profile</Link></p>
                  </div>
                  {canDecide && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="ghost" onClick={() => void actions.requestInfo(v)}><MessageSquareMore className="h-4 w-4" /> Request info</Button>
                      <Button size="sm" variant="outline" className="text-danger" onClick={() => void actions.reject(v)}><XCircle className="h-4 w-4" /> Reject</Button>
                      <Button size="sm" disabled={pendingDocs > 0} title={pendingDocs ? 'Review all KYC documents first' : undefined} isLoading={actions.approving} onClick={() => void actions.approve(v)}><CheckCircle2 className="h-4 w-4" /> Approve</Button>
                    </div>
                  )}
                </Card>
                {canDecide && pendingDocs > 0 && <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">Review the {pendingDocs} pending KYC document{pendingDocs === 1 ? '' : 's'} below before approving.</p>}
                <div className="grid gap-5 xl:grid-cols-2">
                  <VendorBusinessCard vendor={v} />
                  <div className="space-y-5">
                    <VendorOwnerCard vendor={v} />
                    {v.categories.length > 0 && (
                      <Card className="p-5">
                        <p className="mb-2 text-[13px] font-semibold text-ink">Categories they list in</p>
                        <div className="flex flex-wrap gap-1.5">{v.categories.map((c) => <span key={c.id} className="rounded-md bg-surface-2 px-2 py-1 text-xs">{c.name} · {c.products}</span>)}</div>
                      </Card>
                    )}
                  </div>
                </div>
                <VendorDocumentsCard vendor={v} onChanged={actions.invalidate} />
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
