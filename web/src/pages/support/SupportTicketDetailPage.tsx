import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Send, UserCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import { useBreadcrumb } from '../../components/layout/ShellContext';
import { StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, DescriptionList } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/EmptyState';
import { Field, Select, Textarea } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { apiGet, apiPost } from '../../lib/apiClient';
import { formatDateTime, humanize } from '../../lib/format';
import { getSocket } from '../../lib/socket';

interface TicketDetail {
  id: string; ticket_number: string; user_id: string; order_id: string | null; subject: string; category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent'; status: string; assigned_to: string | null; created_at: string;
  messages: { id: string; sender_id: string; body: string; attachments: string[]; created_at: string }[];
}

const STATUSES = ['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'];

export function SupportTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [reply, setReply] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const ticket = useQuery({ queryKey: ['admin-support-ticket', id], queryFn: () => apiGet<TicketDetail>(`/admin/support/tickets/${id}`) });
  useBreadcrumb(ticket.data?.ticket_number);

  useEffect(() => {
    const socket = getSocket();
    const onMessage = (payload: { ticketId: string }) => { if (payload.ticketId === id) void queryClient.invalidateQueries({ queryKey: ['admin-support-ticket', id] }); };
    socket.on('support:message', onMessage);
    return () => { socket.off('support:message', onMessage); };
  }, [id, queryClient]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [ticket.data?.messages.length]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-support-ticket', id] });
    void queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
    void queryClient.invalidateQueries({ queryKey: ['shell-queues'] });
  };
  const send = useMutation({
    mutationFn: () => apiPost(`/admin/support/tickets/${id}/messages`, { body: reply.trim() }),
    onSuccess: () => { setReply(''); toast.success('Reply sent', 'The customer is notified.'); invalidate(); },
    onError: (e) => toast.fromError(e, 'Your reply wasn’t sent.'),
  });
  const assign = useMutation({
    mutationFn: () => apiPost(`/admin/support/tickets/${id}/assign`, { assigneeId: user?.id }),
    onSuccess: () => { toast.success('Ticket assigned to you'); invalidate(); },
    onError: (e) => toast.fromError(e),
  });
  const setStatus = useMutation({
    mutationFn: (status: string) => apiPost(`/admin/support/tickets/${id}/status`, { status }),
    onSuccess: (_d, s) => { toast.success(`Ticket marked ${humanize(s).toLowerCase()}`); invalidate(); },
    onError: (e) => toast.fromError(e),
  });

  if (ticket.isLoading) return <PageSkeleton />;
  if (ticket.error || !ticket.data) return <Card><ErrorState message="This ticket couldn’t be loaded." error={ticket.error} onRetry={() => void ticket.refetch()} /></Card>;

  const t = ticket.data;
  const closed = ['resolved', 'closed'].includes(t.status);

  return (
    <div>
      <PageHeader
        back={{ to: '/support/tickets', label: 'Support' }}
        title={t.subject}
        meta={<><StatusBadge status={t.status} /><StatusBadge status={t.priority} label={`${humanize(t.priority)} priority`} /></>}
        description={`${t.ticket_number} · ${humanize(t.category)} · opened ${formatDateTime(t.created_at)}`}
        actions={t.assigned_to !== user?.id ? <Button size="sm" variant="outline" className="h-9" isLoading={assign.isPending} onClick={() => assign.mutate()}><UserCheck className="h-4 w-4" /> Assign to me</Button> : undefined}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="flex min-h-[420px] flex-col">
          <div className="max-h-[60vh] flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
            {t.messages.map((m) => {
              const fromCustomer = m.sender_id === t.user_id;
              return (
                <div key={m.id} className={clsx('flex', fromCustomer ? 'justify-start' : 'justify-end')}>
                  <div className={clsx('max-w-[80%] rounded-2xl px-4 py-2.5 text-sm', fromCustomer ? 'rounded-bl-md bg-surface-2 text-ink' : 'rounded-br-md bg-brand text-brand-ink')}>
                    <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                    {m.attachments?.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{m.attachments.map((a, i) => <a key={a} href={a} target="_blank" rel="noreferrer" className="text-xs underline">Attachment {i + 1}</a>)}</div>}
                    <p className={clsx('mt-1 text-2xs', fromCustomer ? 'text-faint' : 'opacity-70')}>{fromCustomer ? 'Customer' : m.sender_id === user?.id ? 'You' : 'Support'} · {formatDateTime(m.created_at)}</p>
                  </div>
                </div>
              );
            })}
            <div ref={bottom} />
          </div>
          {closed ? (
            <p className="border-t border-line px-5 py-4 text-center text-sm text-muted">This ticket is {humanize(t.status).toLowerCase()}. Reopen it to keep the conversation going.</p>
          ) : (
            <form className="border-t border-line p-4" onSubmit={(e) => { e.preventDefault(); if (reply.trim()) send.mutate(); }}>
              <Textarea aria-label="Reply" rows={3} placeholder="Write a reply… (Ctrl+Enter to send)" value={reply} onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && reply.trim()) send.mutate(); }} />
              <div className="mt-2 flex justify-end"><Button type="submit" size="sm" disabled={!reply.trim()} isLoading={send.isPending}><Send className="h-4 w-4" /> Send reply</Button></div>
            </form>
          )}
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Ticket" />
            <div className="space-y-4 p-5">
              <Field label="Status">
                <Select value={t.status} disabled={setStatus.isPending} onChange={(e) => setStatus.mutate(e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
                </Select>
              </Field>
              <DescriptionList items={[
                { label: 'Assignee', value: t.assigned_to ? (t.assigned_to === user?.id ? 'You' : 'Teammate') : 'Unassigned' },
                { label: 'Customer', value: <Link to={`/customers/${t.user_id}`} className="hover:underline">View profile</Link> },
                { label: 'Order', value: t.order_id ? <Link to={`/orders/${t.order_id}`} className="hover:underline">Open order</Link> : '—' },
              ]} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
