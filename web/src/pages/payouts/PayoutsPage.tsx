import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, Check, PauseCircle, Plus, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { DataTable } from '../../components/ui/DataTable';
import { Field, Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { useListState, usePagedQuery } from '../../hooks/useListState';
import { apiPost } from '../../lib/apiClient';
import { formatCurrency, formatDate } from '../../lib/format';
import { useCatalogOptions } from '../catalog/catalogOptions';

interface PayoutRow {
  id: string; vendor_id: string; vendor_name: string; status: string; period_start: string; period_end: string;
  gross_minor: number | string; commission_minor: number | string; adjustments_minor: number | string; net_minor: number | string;
  utr_number: string | null; paid_at: string | null; created_at: string;
}

export function PayoutsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const list = useListState({ defaults: { status: '', vendorId: '', generate: '' }, pageSizeKey: 'payouts' });
  const payouts = usePagedQuery<PayoutRow>(['admin-payouts'], '/admin/payouts', { page: list.page, limit: list.pageSize, status: list.filters.status, vendorId: list.filters.vendorId });
  const { vendors } = useCatalogOptions();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [vendorId, setVendorId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [paying, setPaying] = useState<PayoutRow | null>(null);
  const [utr, setUtr] = useState('');

  useEffect(() => {
    if (list.filters.generate) { setVendorId(list.filters.generate); setGenerateOpen(true); list.setFilter('generate', ''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.filters.generate]);

  const invalidate = () => { void queryClient.invalidateQueries({ queryKey: ['admin-payouts'] }); void queryClient.invalidateQueries({ queryKey: ['shell-queues'] }); };

  const generate = useMutation({
    mutationFn: () => apiPost(`/admin/payouts/vendors/${vendorId}/generate`, { periodStart: new Date(`${periodStart}T00:00:00Z`).toISOString(), periodEnd: new Date(`${periodEnd}T23:59:59Z`).toISOString() }),
    onSuccess: () => { toast.success('Payout generated', 'It’s waiting for approval.'); setGenerateOpen(false); invalidate(); },
    onError: (e) => toast.fromError(e, 'Payout couldn’t be generated.'),
  });
  const approve = useMutation({
    mutationFn: (id: string) => apiPost(`/admin/payouts/${id}/approve`),
    onSuccess: () => { toast.success('Payout approved'); invalidate(); },
    onError: (e) => toast.fromError(e),
  });
  const markPaid = useMutation({
    mutationFn: () => apiPost(`/admin/payouts/${paying!.id}/mark-paid`, { utrNumber: utr.trim() }),
    onSuccess: () => { toast.success('Payout marked as paid', `UTR ${utr.trim()}`); setPaying(null); setUtr(''); invalidate(); },
    onError: (e) => toast.fromError(e),
  });

  const invalidRange = !vendorId || !periodStart || !periodEnd || periodStart > periodEnd;

  return (
    <div>
      <PageHeader
        title="Payouts"
        description="Settle delivered sales with vendors: generate a statement, approve it, then record the bank transfer."
        actions={<Button size="sm" className="h-9" onClick={() => { setVendorId(''); setPeriodStart(''); setPeriodEnd(''); setGenerateOpen(true); }}><Plus className="h-4 w-4" /> Generate payout</Button>}
      />
      <Tabs label="Payout status" className="mb-4" value={list.filters.status} onChange={(v) => list.setFilter('status', v)} tabs={[{ key: '', label: 'All' }, { key: 'pending', label: 'To approve' }, { key: 'approved', label: 'To pay' }, { key: 'paid', label: 'Paid' }, { key: 'on_hold', label: 'On hold' }, { key: 'failed', label: 'Failed' }]} />
      <DataTable
        caption="Payouts"
        storageKey="payouts"
        rows={payouts.items}
        rowKey={(p) => p.id}
        loading={payouts.isLoading}
        fetching={payouts.isFetching}
        error={payouts.error}
        onRetry={() => void payouts.refetch()}
        pagination={{ page: list.page, totalPages: payouts.totalPages, total: payouts.total, pageSize: list.pageSize, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
        empty={{ icon: Wallet, title: 'No payouts here', message: 'Generate a payout once a vendor has delivered orders in a period.' }}
        toolbar={
          <Select aria-label="Vendor" value={list.filters.vendorId} onChange={(e) => list.setFilter('vendorId', e.target.value)} className="w-52">
            <option value="">All vendors</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.store_name}</option>)}
          </Select>
        }
        columns={[
          { id: 'vendor', header: 'Vendor', mobile: 'primary', hideable: false, cell: (p) => <Link to={`/vendors/${p.vendor_id}`} className="font-medium text-ink hover:underline">{p.vendor_name}</Link> },
          { id: 'period', header: 'Period', cell: (p) => <span className="whitespace-nowrap text-xs">{formatDate(p.period_start)} – {formatDate(p.period_end)}</span> },
          { id: 'gross', header: 'Gross', align: 'right', cell: (p) => <span className="tabular">{formatCurrency(Number(p.gross_minor))}</span> },
          { id: 'commission', header: 'Commission', align: 'right', cell: (p) => <span className="tabular text-muted">−{formatCurrency(Number(p.commission_minor))}</span> },
          { id: 'net', header: 'Net payout', align: 'right', cell: (p) => <span className="tabular font-semibold text-ink">{formatCurrency(Number(p.net_minor))}</span> },
          { id: 'utr', header: 'UTR', defaultHidden: true, cell: (p) => <span className="font-mono text-xs">{p.utr_number ?? '—'}</span> },
          { id: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
          {
            id: 'action', header: 'Action', hideable: false, mobile: 'hidden',
            cell: (p) => (
              <div className="flex gap-1.5">
                {p.status === 'pending' && <Button size="xs" isLoading={approve.isPending && approve.variables === p.id} onClick={() => approve.mutate(p.id)}><Check className="h-3.5 w-3.5" /> Approve</Button>}
                {p.status === 'approved' && <Button size="xs" variant="outline" onClick={() => { setPaying(p); setUtr(''); }}><Banknote className="h-3.5 w-3.5" /> Mark paid</Button>}
                {['pending', 'approved'].includes(p.status) && (
                  <Button size="xs" variant="ghost" onClick={() => void confirm({
                    title: 'Put this payout on hold?', description: 'The vendor won’t be paid until it’s released.', confirmLabel: 'Hold',
                    reason: { label: 'Reason', required: true, minLength: 3 },
                    onConfirm: async (reason) => { await apiPost(`/admin/payouts/${p.id}/hold`, { reason }); toast.success('Payout on hold'); invalidate(); },
                  })}><PauseCircle className="h-3.5 w-3.5" /> Hold</Button>
                )}
              </div>
            ),
          },
        ]}
      />

      <Modal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        title="Generate payout"
        description="Totals delivered sales minus commission for the vendor and period."
        size="sm"
        footer={<><Button variant="outline" onClick={() => setGenerateOpen(false)}>Cancel</Button><Button disabled={invalidRange} isLoading={generate.isPending} onClick={() => generate.mutate()}>Generate</Button></>}
      >
        <div className="space-y-4">
          <Field label="Vendor" required>
            <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">Choose a vendor…</option>
              {vendors.filter((v) => v.status === 'approved').map((v) => <option key={v.id} value={v.id}>{v.store_name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" required><Input type="date" value={periodStart} max={periodEnd || undefined} onChange={(e) => setPeriodStart(e.target.value)} /></Field>
            <Field label="To" required error={periodStart && periodEnd && periodStart > periodEnd ? 'End before start' : null}><Input type="date" value={periodEnd} min={periodStart || undefined} onChange={(e) => setPeriodEnd(e.target.value)} /></Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(paying)}
        onClose={() => setPaying(null)}
        title="Record bank transfer"
        description={paying ? `${paying.vendor_name} · ${formatCurrency(Number(paying.net_minor))}` : undefined}
        size="sm"
        footer={<><Button variant="outline" onClick={() => setPaying(null)}>Cancel</Button><Button disabled={utr.trim().length < 4} isLoading={markPaid.isPending} onClick={() => markPaid.mutate()}>Mark paid</Button></>}
      >
        <Field label="UTR / reference number" required hint="From your bank’s transfer confirmation."><Input autoFocus value={utr} maxLength={60} onChange={(e) => setUtr(e.target.value)} placeholder="UTR123456789" /></Field>
      </Modal>
    </div>
  );
}
