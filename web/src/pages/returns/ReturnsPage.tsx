import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Lock, MoreHorizontal, RotateCcw, X } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import { StatusBadge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { DataTable } from '../../components/ui/DataTable';
import { Dropdown, DropdownItem } from '../../components/ui/Dropdown';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { useListState, usePagedQuery } from '../../hooks/useListState';
import { apiPost } from '../../lib/apiClient';
import { formatCurrency, formatDate, humanize } from '../../lib/format';

interface ReturnRow {
  id: string; order_id: string; order_number: string | null; customer_name: string | null; title: string; sku: string; image_url: string | null;
  vendor_name: string; request_type: string; reason: string; description: string | null; quantity: number; unit_price_minor: number;
  refund_amount_minor: number | null; status: string; created_at: string;
}

const NEXT: Record<string, string> = { approved: 'Mark pickup scheduled', pickup_scheduled: 'Mark picked up', picked: 'Mark received & settle' };

export function ReturnsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const list = useListState({ defaults: { status: '' }, pageSizeKey: 'returns' });
  const returns = usePagedQuery<ReturnRow>(['admin-returns'], '/admin/returns', { page: list.page, limit: list.pageSize, status: list.filters.status });
  const canAct = hasPermission('returns:approve');

  const invalidate = () => {
    for (const k of ['admin-returns', 'shell-queues', 'admin-overview', 'admin-order', 'admin-orders']) void queryClient.invalidateQueries({ queryKey: [k] });
  };
  const act = useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: 'approve' | 'advance' | 'close' | 'reject'; body?: unknown }) => apiPost(`/admin/returns/${id}/${action}`, body),
    onSuccess: (_d, v) => {
      toast.success({ approve: 'Return approved', advance: 'Return updated', close: 'Return closed', reject: 'Return rejected' }[v.action]);
      invalidate();
    },
    onError: (e) => toast.fromError(e),
  });

  return (
    <div>
      <PageHeader title="Returns" description="Approve requests, track reverse pickup, and settle refunds or exchanges. Receiving a return restocks it and refunds the customer." />
      <Tabs
        label="Return status"
        className="mb-4"
        value={list.filters.status}
        onChange={(v) => list.setFilter('status', v)}
        tabs={[{ key: '', label: 'All' }, { key: 'requested', label: 'New' }, { key: 'approved', label: 'Approved' }, { key: 'pickup_scheduled', label: 'Pickup' }, { key: 'picked', label: 'In transit' }, { key: 'refunded', label: 'Refunded' }, { key: 'rejected', label: 'Rejected' }, { key: 'closed', label: 'Closed' }]}
      />
      <DataTable
        caption="Return requests"
        storageKey="returns"
        rows={returns.items}
        rowKey={(r) => r.id}
        loading={returns.isLoading}
        fetching={returns.isFetching}
        error={returns.error}
        onRetry={() => void returns.refetch()}
        pagination={{ page: list.page, totalPages: returns.totalPages, total: returns.total, pageSize: list.pageSize, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
        empty={{ icon: RotateCcw, title: list.filters.status ? 'Nothing in this stage' : 'No return requests', message: 'Customers can request returns within the product’s return window.' }}
        columns={[
          { id: 'item', header: 'Item', mobile: 'primary', hideable: false, cell: (r) => <div className="flex items-center gap-3">{r.image_url && <img src={r.image_url} alt="" className="h-9 w-9 rounded-md object-cover" />}<div className="min-w-0"><p className="line-clamp-1 font-medium text-ink">{r.title}</p><p className="font-mono text-2xs text-faint">{r.sku} × {r.quantity}</p></div></div> },
          { id: 'order', header: 'Order', cell: (r) => (r.order_number ? <Link to={`/orders/${r.order_id}`} className="link font-mono text-xs">{r.order_number}</Link> : '—') },
          { id: 'customer', header: 'Customer', cell: (r) => r.customer_name ?? '—' },
          { id: 'vendor', header: 'Vendor', cell: (r) => r.vendor_name },
          { id: 'type', header: 'Type', cell: (r) => <div><p className="text-ink">{humanize(r.request_type)}</p><p className="text-xs text-faint" title={r.description ?? undefined}>{humanize(r.reason)}</p></div> },
          { id: 'amount', header: 'Value', align: 'right', cell: (r) => <span className="tabular">{formatCurrency(r.refund_amount_minor ?? r.unit_price_minor * r.quantity)}</span> },
          { id: 'date', header: 'Requested', cell: (r) => <span className="whitespace-nowrap text-xs">{formatDate(r.created_at)}</span> },
          { id: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
          {
            id: 'actions', header: 'Next step', hideable: false, mobile: 'hidden',
            cell: (r) => !canAct ? null : r.status === 'requested' ? (
              <div className="flex gap-1.5">
                <Button size="xs" onClick={() => act.mutate({ id: r.id, action: 'approve' })}><Check className="h-3.5 w-3.5" /> Approve</Button>
                <Button size="xs" variant="outline" onClick={() => void confirm({ title: 'Reject this return?', description: 'The customer is notified with your reason.', tone: 'danger', confirmLabel: 'Reject', reason: { label: 'Reason', required: true, minLength: 3 }, onConfirm: (reason) => act.mutateAsync({ id: r.id, action: 'reject', body: { reason } }) })}><X className="h-3.5 w-3.5" /> Reject</Button>
              </div>
            ) : NEXT[r.status] ? (
              <Button size="xs" variant="outline" onClick={() => (r.status === 'picked'
                ? void confirm({ title: 'Receive this return?', description: r.request_type === 'return' ? 'Stock is restocked and the customer is refunded. This can’t be undone.' : 'Stock is restocked and the exchange is marked complete.', confirmLabel: 'Receive & settle', onConfirm: () => act.mutateAsync({ id: r.id, action: 'advance' }) })
                : act.mutate({ id: r.id, action: 'advance' }))}
              >
                {NEXT[r.status]} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : null,
          },
        ]}
        rowActions={(r) => (['refunded', 'exchanged', 'rejected'].includes(r.status) && canAct ? (
          <Dropdown align="end" trigger={(props) => <IconButton {...props} size="sm" label="More actions"><MoreHorizontal className="h-4 w-4" /></IconButton>}>
            <DropdownItem icon={Lock} onSelect={() => act.mutate({ id: r.id, action: 'close' })}>Close request</DropdownItem>
          </Dropdown>
        ) : null)}
      />
    </div>
  );
}
