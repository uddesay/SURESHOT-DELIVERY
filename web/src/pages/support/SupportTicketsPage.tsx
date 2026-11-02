import { useQueryClient } from '@tanstack/react-query';
import { LifeBuoy } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { DataTable } from '../../components/ui/DataTable';
import { Select } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tabs } from '../../components/ui/Tabs';
import { useListState, usePagedQuery } from '../../hooks/useListState';
import { formatRelative, humanize } from '../../lib/format';
import { getSocket } from '../../lib/socket';

interface TicketRow {
  id: string; ticket_number: string; subject: string; category: string; priority: 'low' | 'medium' | 'high' | 'urgent';
  status: string; assigned_to: string | null; customer_name: string; customer_email: string | null; updated_at: string;
}

export function SupportTicketsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useListState({ defaults: { status: '', priority: '', assignedTo: '' }, pageSizeKey: 'tickets' });
  const tickets = usePagedQuery<TicketRow>(['admin-support-tickets'], '/admin/support/tickets', {
    page: list.page, limit: list.pageSize, status: list.filters.status, priority: list.filters.priority,
    assignedTo: list.filters.assignedTo === 'me' ? user?.id : '',
  });

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] }); void queryClient.invalidateQueries({ queryKey: ['shell-queues'] }); };
    socket.on('support:new_ticket', refresh);
    socket.on('support:message', refresh);
    return () => { socket.off('support:new_ticket', refresh); socket.off('support:message', refresh); };
  }, [queryClient]);

  return (
    <div>
      <PageHeader title="Support" description="Customer conversations. New tickets and replies appear here in real time." />
      <Tabs label="Ticket status" className="mb-4" value={list.filters.status} onChange={(v) => list.setFilter('status', v)}
        tabs={[{ key: '', label: 'All' }, { key: 'open', label: 'Open' }, { key: 'in_progress', label: 'In progress' }, { key: 'waiting_on_customer', label: 'Waiting on customer' }, { key: 'resolved', label: 'Resolved' }, { key: 'closed', label: 'Closed' }]} />
      <DataTable
        caption="Support tickets"
        storageKey="tickets"
        rows={tickets.items}
        rowKey={(t) => t.id}
        loading={tickets.isLoading}
        fetching={tickets.isFetching}
        error={tickets.error}
        onRetry={() => void tickets.refetch()}
        onRowClick={(t) => navigate(`/support/tickets/${t.id}`)}
        pagination={{ page: list.page, totalPages: tickets.totalPages, total: tickets.total, pageSize: list.pageSize, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
        empty={{ icon: LifeBuoy, title: 'No tickets here', message: 'When customers contact support, their tickets appear in this inbox.' }}
        toolbar={
          <>
            <Select aria-label="Priority" value={list.filters.priority} onChange={(e) => list.setFilter('priority', e.target.value)} className="w-40">
              <option value="">Any priority</option>{['urgent', 'high', 'medium', 'low'].map((p) => <option key={p} value={p}>{humanize(p)}</option>)}
            </Select>
            <Select aria-label="Assignee" value={list.filters.assignedTo} onChange={(e) => list.setFilter('assignedTo', e.target.value)} className="w-40">
              <option value="">Everyone</option><option value="me">Assigned to me</option>
            </Select>
          </>
        }
        columns={[
          { id: 'subject', header: 'Ticket', mobile: 'primary', hideable: false, cell: (t) => <div className="min-w-0 max-w-[340px]"><p className="truncate font-medium text-ink">{t.subject}</p><p className="font-mono text-2xs text-faint">{t.ticket_number} · {humanize(t.category)}</p></div> },
          { id: 'customer', header: 'Customer', cell: (t) => <div className="min-w-0"><p className="truncate text-ink">{t.customer_name}</p><p className="truncate text-xs text-faint">{t.customer_email}</p></div> },
          { id: 'priority', header: 'Priority', cell: (t) => <StatusBadge status={t.priority} label={humanize(t.priority)} /> },
          { id: 'status', header: 'Status', cell: (t) => <StatusBadge status={t.status} /> },
          { id: 'assignee', header: 'Assignee', cell: (t) => (t.assigned_to ? (t.assigned_to === user?.id ? <Badge tone="brand">You</Badge> : 'Teammate') : <span className="text-faint">Unassigned</span>) },
          { id: 'updated', header: 'Updated', cell: (t) => <span className="whitespace-nowrap text-xs">{formatRelative(t.updated_at)}</span> },
        ]}
      />
    </div>
  );
}
