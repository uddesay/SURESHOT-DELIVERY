import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CreditCard, LifeBuoy, Package, RotateCcw, ShoppingBag, Store, UserPlus, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { analyticsApi, type ActivityEvent } from '../../api/analytics';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency, formatRelative } from '../../lib/format';
import { getSocket } from '../../lib/socket';

const ICONS: Record<ActivityEvent['type'], { icon: LucideIcon; tone: string }> = {
  order: { icon: ShoppingBag, tone: 'bg-info-soft text-info' },
  customer: { icon: UserPlus, tone: 'bg-brand-soft text-sage' },
  vendor: { icon: Store, tone: 'bg-violet-soft text-violet' },
  product: { icon: Package, tone: 'bg-success-soft text-success' },
  refund: { icon: RotateCcw, tone: 'bg-warning-soft text-warning' },
  payment: { icon: CreditCard, tone: 'bg-success-soft text-success' },
  support: { icon: LifeBuoy, tone: 'bg-danger-soft text-danger' },
};

export function ActivityFeed({ limit = 12, className }: { limit?: number; className?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activity = useQuery({ queryKey: ['admin-activity', limit], queryFn: () => analyticsApi.activity(limit), refetchInterval: 30_000 });

  // Any realtime notification is a good moment to refresh the feed.
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin-activity'] });
    socket.on('notification', refresh);
    return () => { socket.off('notification', refresh); };
  }, [queryClient]);

  if (activity.isLoading) {
    return <div className={clsx('space-y-4 p-5', className)}>{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex gap-3"><Skeleton className="h-8 w-8 rounded-lg" /><div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-1/3" /></div></div>)}</div>;
  }
  if (activity.error) return <ErrorState compact message="Activity couldn’t load." error={activity.error} onRetry={() => void activity.refetch()} />;
  if (!activity.data?.length) return <EmptyState compact icon={ShoppingBag} title="Quiet for now" message="New orders, sign-ups and vendor updates will stream in here." />;

  return (
    <ol className={clsx('relative', className)} aria-label="Recent platform activity">
      {activity.data.map((e) => {
        const meta = ICONS[e.type];
        return (
          <li key={e.id}>
            <button
              onClick={() => navigate(e.link)}
              className="group flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2/70 focus-visible:bg-surface-2"
            >
              <span className={clsx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', meta.tone)}>
                <meta.icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-ink">{e.title}</span>
                  <time dateTime={e.at} className="shrink-0 text-2xs text-faint" title={new Date(e.at).toLocaleString('en-IN')}>{formatRelative(e.at)}</time>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className="truncate text-xs text-muted group-hover:text-ink-2">
                    {e.entity}{e.detail && e.detail !== e.entity ? ` · ${e.detail}` : ''}{e.amountMinor !== undefined ? ` · ${formatCurrency(e.amountMinor)}` : ''}
                  </span>
                  <StatusBadge status={e.status} className="ml-auto shrink-0 !px-1.5 !py-0 text-2xs" />
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
