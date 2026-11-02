import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { BadgeCheck, Check, Star, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Select } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/DataTable';
import { SearchInput } from '../../components/ui/SearchInput';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { useListState, usePagedQuery } from '../../hooks/useListState';
import { apiPost } from '../../lib/apiClient';
import { formatRelative } from '../../lib/format';

interface ReviewRow {
  id: string; rating: number; title: string | null; body: string | null; status: 'pending' | 'approved' | 'rejected'; helpful_count: number;
  created_at: string; verified_purchase: boolean; product_id: string; product_title: string; user_id: string; customer_name: string | null;
}

function Stars({ value }: { value: number }) {
  return <span className="tabular text-warning" aria-label={`${value} out of 5 stars`}>{'★'.repeat(value)}<span className="text-line-strong">{'★'.repeat(5 - value)}</span></span>;
}

export function ReviewsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useListState({ defaults: { status: 'pending', rating: '' }, pageSizeKey: 'reviews' });
  const reviews = usePagedQuery<ReviewRow>(['admin-reviews'], '/admin/reviews', { page: list.page, limit: list.pageSize, q: list.q, ...list.filters });
  const [busy, setBusy] = useState<string | null>(null);

  const moderate = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReviewRow['status'] }) => apiPost(`/admin/reviews/${id}/status`, { status }),
    onMutate: ({ id }) => setBusy(id),
    onSuccess: (_d, v) => {
      toast.success(v.status === 'approved' ? 'Review published' : v.status === 'rejected' ? 'Review hidden' : 'Review moved back to pending', 'The product rating was recalculated.');
      void queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
      void queryClient.invalidateQueries({ queryKey: ['shell-queues'] });
    },
    onError: (e) => toast.fromError(e),
    onSettled: () => setBusy(null),
  });

  return (
    <div>
      <PageHeader title="Reviews" description="Only approved reviews count toward a product’s public rating." />
      <Tabs label="Review status" className="mb-4" value={list.filters.status} onChange={(v) => list.setFilter('status', v)} tabs={[{ key: 'pending', label: 'Pending' }, { key: 'approved', label: 'Published' }, { key: 'rejected', label: 'Hidden' }, { key: '', label: 'All' }]} />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <SearchInput value={list.q} onChange={list.setQuery} placeholder="Product, customer or text…" />
          <Select aria-label="Rating" value={list.filters.rating} onChange={(e) => list.setFilter('rating', e.target.value)} className="w-36">
            <option value="">Any rating</option>{[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} star{r === 1 ? '' : 's'}</option>)}
          </Select>
        </div>
        {reviews.isLoading ? (
          <div className="space-y-4 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : reviews.error ? (
          <ErrorState message="Reviews couldn’t load." error={reviews.error} onRetry={() => void reviews.refetch()} />
        ) : reviews.items.length === 0 ? (
          <EmptyState icon={Star} title={list.filters.status === 'pending' ? 'No reviews waiting' : 'No reviews here'} message={list.filters.status === 'pending' ? 'New customer reviews will queue here for moderation.' : undefined} />
        ) : (
          <ul className={clsx('divide-y divide-line', reviews.isFetching && 'opacity-70')}>
            {reviews.items.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars value={r.rating} />
                    <p className="font-medium text-ink">{r.title || 'Untitled review'}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  {r.body && <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-ink-2">{r.body}</p>}
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <Link to={`/customers/${r.user_id}`} className="hover:text-ink hover:underline">{r.customer_name ?? 'Customer'}</Link>
                    {r.verified_purchase && <span className="inline-flex items-center gap-1 text-success"><BadgeCheck className="h-3.5 w-3.5" /> Verified purchase</span>}
                    <span>· on <Link to={`/products/${r.product_id}`} className="hover:text-ink hover:underline">{r.product_title}</Link></span>
                    <span>· {formatRelative(r.created_at)}</span>
                    {r.helpful_count > 0 && <span>· {r.helpful_count} found helpful</span>}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {r.status !== 'approved' && <Button size="xs" isLoading={busy === r.id && moderate.variables?.status === 'approved'} disabled={busy === r.id} onClick={() => moderate.mutate({ id: r.id, status: 'approved' })}><Check className="h-3.5 w-3.5" /> Publish</Button>}
                  {r.status !== 'rejected' && <Button size="xs" variant="outline" isLoading={busy === r.id && moderate.variables?.status === 'rejected'} disabled={busy === r.id} onClick={() => moderate.mutate({ id: r.id, status: 'rejected' })}><X className="h-3.5 w-3.5" /> Hide</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!reviews.error && reviews.items.length > 0 && <Pagination page={list.page} totalPages={reviews.totalPages} total={reviews.total} pageSize={list.pageSize} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />}
      </Card>
    </div>
  );
}
