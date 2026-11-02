import clsx from 'clsx';
import { Bell, CheckCheck, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Pagination } from '../../components/ui/DataTable';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import {
  NOTIFICATION_CATEGORIES, notificationCategory, notificationRoute, useNotifications, type NotificationCategory,
} from '../../hooks/useNotifications';
import { formatDateTime, formatRelative } from '../../lib/format';

export function NotificationsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<'' | 'unread' | NotificationCategory>('');
  const { notifications, unreadCount, totalPages, total, isLoading, error, refetch, markRead, markAllRead, markingAll } = useNotifications({ page, limit: 50 });

  // Category filtering is applied to the loaded page (the API pages by recency only).
  const rows = notifications.filter((n) => !filter || (filter === 'unread' ? !n.is_read : notificationCategory(n.notification_type) === filter));
  const counts = Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c.key, notifications.filter((n) => notificationCategory(n.notification_type) === c.key).length]));

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={unreadCount ? `${unreadCount} unread` : 'You’re all caught up.'}
        actions={unreadCount > 0 && <Button size="sm" variant="outline" className="h-9" isLoading={markingAll} onClick={() => markAllRead().then(() => toast.success('All marked as read')).catch((e) => toast.fromError(e))}><CheckCheck className="h-4 w-4" /> Mark all read</Button>}
      />
      <Tabs label="Notification type" className="mb-4" value={filter} onChange={setFilter}
        tabs={[{ key: '', label: 'All', count: notifications.length }, { key: 'unread', label: 'Unread', count: unreadCount }, ...NOTIFICATION_CATEGORIES.map((c) => ({ key: c.key, label: c.label, count: counts[c.key] }))]} />
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : error ? (
          <ErrorState message="Notifications couldn’t load." error={error} onRetry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Bell} title={filter ? 'Nothing here' : 'No notifications yet'} message="Updates about orders, payments, vendors and support show up here and in the bell." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((n) => {
              const route = notificationRoute(n);
              return (
                <li key={n.id}>
                  <button
                    onClick={() => { if (!n.is_read) markRead(n.id); if (route) navigate(route); }}
                    className={clsx('flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2/70', !n.is_read && 'bg-brand-soft/40')}
                  >
                    <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.is_read ? 'bg-line-strong' : 'bg-sage')} aria-label={n.is_read ? 'Read' : 'Unread'} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink">{n.title}</span>
                        <Badge>{NOTIFICATION_CATEGORIES.find((c) => c.key === notificationCategory(n.notification_type))?.label}</Badge>
                      </span>
                      <span className="mt-0.5 block text-[13px] text-muted">{n.body}</span>
                      <time className="mt-1 block text-2xs text-faint" dateTime={n.created_at} title={formatDateTime(n.created_at)}>{formatRelative(n.created_at)}</time>
                    </span>
                    {route && <ChevronRight className="mt-1 h-4 w-4 text-faint" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!error && totalPages > 1 && <Pagination page={page} totalPages={totalPages} total={total} pageSize={50} onPageChange={setPage} />}
      </Card>
    </div>
  );
}
