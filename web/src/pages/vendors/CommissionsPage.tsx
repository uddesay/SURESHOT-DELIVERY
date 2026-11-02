import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Percent, Store } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { catalogApi, categoryOptions, type CategoryRow } from '../../api/catalog';
import { peopleApi, type VendorRow } from '../../api/people';
import { useAuth } from '../../auth/AuthContext';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Field, Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../components/ui/Toast';
import { apiPatch } from '../../lib/apiClient';
import { formatCurrency, formatPercent } from '../../lib/format';
import { commissionLabel } from './vendorFormat';

function RateCell({ category }: { category: CategoryRow }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const initial = String(category.commission_rate_bp / 100);
  const [value, setValue] = useState(initial);
  const save = useMutation({
    mutationFn: () => apiPatch(`/admin/categories/${category.id}`, { commissionRateBp: Math.round(Number(value) * 100) }),
    onSuccess: () => { toast.success(`${category.name}: ${value}% commission`); void queryClient.invalidateQueries({ queryKey: ['admin-categories'] }); },
    onError: (e) => { toast.fromError(e); setValue(initial); },
  });
  const valid = value !== '' && Number(value) >= 0 && Number(value) <= 50;
  const changed = value !== initial;
  return (
    <form className="flex items-center justify-end gap-1.5" onSubmit={(e) => { e.preventDefault(); if (valid && changed) save.mutate(); }}>
      <Input aria-label={`Commission for ${category.name}`} type="number" min={0} max={50} step="0.1" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!valid} className="h-8 w-20 text-right" />
      <span className="text-xs text-muted">%</span>
      <IconButton type="submit" size="sm" label="Save rate" disabled={!valid || !changed || save.isPending} className={changed ? 'text-sage' : 'invisible'}><Check className="h-4 w-4" /></IconButton>
    </form>
  );
}

export function CommissionsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: ['admin-categories'], queryFn: catalogApi.categories });
  const vendors = useQuery({ queryKey: ['admin-vendors', 'commission'], queryFn: () => peopleApi.vendors({ limit: 100, status: 'approved,suspended' }) });
  const [editing, setEditing] = useState<VendorRow | null>(null);
  const [rate, setRate] = useState('');
  const options = useMemo(() => categoryOptions(categories.data ?? []), [categories.data]);

  const saveVendor = useMutation({
    mutationFn: (bp: number | null) => peopleApi.setCommission(editing!.id, bp),
    onSuccess: () => { toast.success(`${editing!.store_name}: commission updated`); setEditing(null); void queryClient.invalidateQueries({ queryKey: ['admin-vendors'] }); },
    onError: (e) => toast.fromError(e),
  });

  const vendorRows = vendors.data?.items ?? [];
  const totalCommission = vendorRows.reduce((s, v) => s + v.commission_minor, 0);
  const totalSales = vendorRows.reduce((s, v) => s + v.revenue_minor, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Marketplace"
        title="Commissions"
        description="Sureshot’s take rate. A vendor override wins over the category rate, and rates are locked onto each order line at checkout."
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-[13px] text-muted">Commission earned (all time)</p><p className="tabular mt-1 font-display text-2xl font-semibold">{formatCurrency(totalCommission)}</p></Card>
        <Card className="p-4"><p className="text-[13px] text-muted">Effective take rate</p><p className="tabular mt-1 font-display text-2xl font-semibold">{totalSales ? formatPercent((totalCommission / totalSales) * 100) : '—'}</p></Card>
        <Card className="p-4"><p className="text-[13px] text-muted">Vendors with an override</p><p className="tabular mt-1 font-display text-2xl font-semibold">{vendorRows.filter((v) => v.commission_rate_bp != null).length}</p></Card>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div>
          <h2 className="mb-3 text-[15px] font-semibold">Category rates</h2>
          <DataTable
            caption="Category commission rates"
            rows={options}
            rowKey={(o) => o.id}
            loading={categories.isLoading}
            error={categories.error}
            onRetry={() => void categories.refetch()}
            empty={{ icon: Percent, title: 'No categories yet', action: <Link to="/categories" className="text-sm font-medium text-sage hover:underline">Create categories</Link> }}
            columns={[
              { id: 'name', header: 'Category', mobile: 'primary', hideable: false, cell: (o) => <span style={{ paddingLeft: o.depth * 16 }} className="text-ink">{o.label}{!o.row.is_active && <Badge className="ml-2">Hidden</Badge>}</span> },
              { id: 'products', header: 'Products', align: 'right', cell: (o) => <span className="tabular">{o.row.product_count}</span> },
              { id: 'rate', header: 'Rate', align: 'right', hideable: false, cell: (o) => <RateCell key={`${o.id}-${o.row.commission_rate_bp}`} category={o.row} /> },
            ]}
          />
        </div>
        <div>
          <h2 className="mb-3 text-[15px] font-semibold">Vendor overrides</h2>
          <DataTable
            caption="Vendor commission"
            rows={vendorRows}
            rowKey={(v) => v.id}
            loading={vendors.isLoading}
            error={vendors.error}
            onRetry={() => void vendors.refetch()}
            empty={{ icon: Store, title: 'No active vendors yet' }}
            columns={[
              { id: 'store', header: 'Vendor', mobile: 'primary', hideable: false, cell: (v) => <Link to={`/vendors/${v.id}`} className="font-medium text-ink hover:underline">{v.store_name}</Link> },
              { id: 'rate', header: 'Rate', cell: (v) => (v.commission_rate_bp == null ? <span className="text-muted">Category default</span> : <Badge tone="brand">{commissionLabel(v.commission_rate_bp)}</Badge>) },
              { id: 'earned', header: 'Earned', align: 'right', cell: (v) => <span className="tabular">{formatCurrency(v.commission_minor)}</span> },
              { id: 'edit', header: '', hideable: false, align: 'right', cell: (v) => hasPermission('vendors:update') && <Button size="xs" variant="outline" onClick={() => { setEditing(v); setRate(v.commission_rate_bp == null ? '' : String(v.commission_rate_bp / 100)); }}>Edit</Button> },
            ]}
          />
        </div>
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`Commission for ${editing?.store_name ?? ''}`}
        size="sm"
        footer={
          <>
            {editing?.commission_rate_bp != null && <Button variant="ghost" className="mr-auto" onClick={() => saveVendor.mutate(null)}>Use category default</Button>}
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={rate === '' || !(Number(rate) >= 0 && Number(rate) <= 50)} isLoading={saveVendor.isPending} onClick={() => saveVendor.mutate(Math.round(Number(rate) * 100))}>Save</Button>
          </>
        }
      >
        <Field label="Commission (%)" hint="0–50%. Applies to new orders."><Input type="number" min={0} max={50} step="0.1" autoFocus value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
