import clsx from 'clsx';
import { Bell, CheckCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { notificationRoute, useNotifications } from '../../hooks/useNotifications';
import { formatRelative } from '../../lib/format';
import { Skeleton } from '../ui/Skeleton';
import { useToast } from '../ui/Toast';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, markRead, markAllRead, markingAll, isLoading, error } = useNotifications({ limit: 8 });
  const navigate = useNavigate();
  const toast = useToast();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="tabular absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white ring-2 ring-surface">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-line bg-surface shadow-pop animate-pop-in">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-xs text-muted">{unreadCount ? `${unreadCount} unread` : 'You’re all caught up'}</p>
            </div>
            {unreadCount > 0 && (
              <button
                disabled={markingAll}
                onClick={() => markAllRead().then(() => toast.success('All notifications marked as read')).catch((e) => toast.fromError(e))}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sage hover:bg-surface-2 disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : error ? (
              <p className="p-6 text-center text-sm text-danger">Notifications couldn’t load.</p>
            ) : notifications.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <Bell className="mx-auto h-6 w-6 text-faint" aria-hidden />
                <p className="mt-2 text-sm font-medium">No notifications yet</p>
                <p className="mt-1 text-xs text-muted">Updates about orders, vendors and support appear here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {notifications.map((n) => {
                  const route = notificationRoute(n);
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => {
                          if (!n.is_read) markRead(n.id);
                          if (route) { setOpen(false); navigate(route); }
                        }}
                        className={clsx('flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2', !n.is_read && 'bg-brand-soft/40')}
                      >
                        <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-sage')} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-ink">{n.title}</span>
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>
                          <span className="mt-1 block text-2xs text-faint">{formatRelative(n.created_at)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-[13px] font-medium text-ink hover:bg-surface-2">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
