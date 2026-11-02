import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api, apiPost } from '../lib/apiClient';
import { getSocket } from '../lib/socket';

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  notification_type: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

export type NotificationCategory = 'orders' | 'payments' | 'vendors' | 'inventory' | 'system' | 'marketing';

export const NOTIFICATION_CATEGORIES: { key: NotificationCategory; label: string }[] = [
  { key: 'orders', label: 'Orders' },
  { key: 'payments', label: 'Payments' },
  { key: 'vendors', label: 'Vendors' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'system', label: 'System' },
  { key: 'marketing', label: 'Marketing' },
];

export function notificationCategory(type: string): NotificationCategory {
  if (/^(order|return|support)/.test(type)) return 'orders';
  if (/^(payment|payout|refund|wallet)/.test(type)) return 'payments';
  if (/^(vendor|product)/.test(type)) return 'vendors';
  if (/(stock|inventory)/.test(type)) return 'inventory';
  if (/^(promo|campaign|marketing|coupon)/.test(type)) return 'marketing';
  return 'system';
}

/** Where clicking a notification should take staff, based on the ids it carries. */
export function notificationRoute(n: NotificationRow): string | null {
  const d = n.data ?? {};
  if (typeof d.ticketId === 'string') return `/support/tickets/${d.ticketId}`;
  if (typeof d.orderId === 'string') return `/orders/${d.orderId}`;
  if (typeof d.productId === 'string') return `/products/${d.productId}`;
  if (typeof d.vendorId === 'string') return `/vendors/${d.vendorId}`;
  if (typeof d.payoutId === 'string') return '/payouts';
  if (typeof d.returnId === 'string') return '/returns';
  return null;
}

const KEY = ['admin-notifications'];

/**
 * The backend nests `{ rows, unreadCount }` inside `data` for this endpoint,
 * with pagination in `meta`, so it is fetched directly rather than via apiGetPage.
 */
export function useNotifications({ page = 1, limit = 20 }: { page?: number; limit?: number } = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...KEY, page, limit],
    queryFn: async () => {
      const { data } = await api.get('/notifications', { params: { page, limit } });
      return {
        rows: (data.data?.rows ?? []) as NotificationRow[],
        unreadCount: Number(data.data?.unreadCount ?? 0),
        totalPages: Number(data.meta?.totalPages ?? 1),
        total: Number(data.meta?.total ?? 0),
      };
    },
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const socket = getSocket();
    const onNotification = () => void queryClient.invalidateQueries({ queryKey: KEY });
    socket.on('notification', onNotification);
    return () => { socket.off('notification', onNotification); };
  }, [queryClient]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: KEY });

  const markRead = useMutation({ mutationFn: (id: string) => apiPost(`/notifications/${id}/read`), onSuccess: invalidate });
  const markAllRead = useMutation({ mutationFn: () => apiPost('/notifications/read-all'), onSuccess: invalidate });

  return {
    notifications: query.data?.rows ?? [],
    unreadCount: query.data?.unreadCount ?? 0,
    totalPages: query.data?.totalPages ?? 1,
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    markRead: markRead.mutate,
    markAllRead: markAllRead.mutateAsync,
    markingAll: markAllRead.isPending,
  };
}
