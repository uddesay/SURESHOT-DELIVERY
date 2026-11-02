import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, MapPin, PackageCheck, Phone, Plus, Truck, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Field, Input, Select, Switch } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { apiGet, apiGetPage, apiPatch, apiPost } from '../../lib/apiClient';
import { formatCurrency, formatRelative, humanize } from '../../lib/format';

export interface Partner {
  id: string; full_name: string; phone: string; email: string | null; vehicle_type: string; vehicle_number: string | null; city: string | null;
  status: 'active' | 'inactive'; is_online: boolean; active_jobs: number; delivered_today: number; delivered_total: number; cod_today_minor: string | number;
}
interface DispatchRow {
  id: string; status: string; order_id: string; order_number: string; payment_method: string; placed_at: string; assigned_at: string | null; delivered_at: string | null;
  customer_name: string | null; store_name: string; pickup_line1: string | null; pickup_city: string | null;
  shipping_address: { recipientName?: string; line1?: string; city?: string; postalCode?: string; recipientPhone?: string } | null;
  partner_name: string | null; partner_phone: string | null; item_count: number; cod_due_minor: number; cod_collected_minor: string | null;
}
type State = 'unassigned' | 'active' | 'delivered';

const usePartners = (q = '') => useQuery({ queryKey: ['delivery-partners', q], queryFn: () => apiGet<Partner[]>('/admin/delivery/partners', { q: q || undefined }) });

/** Dispatch board: assign packed parcels to riders and watch them through delivery. */
export function DispatchPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [state, setState] = useState<State>('unassigned');
  const [picking, setPicking] = useState<DispatchRow | null>(null);
  const rows = useQuery({ queryKey: ['dispatch', state], queryFn: () => apiGetPage<DispatchRow>('/admin/delivery/dispatch', { state, limit: 100 }), refetchInterval: 20000 });
  const counts = useQuery({
    queryKey: ['dispatch-counts'],
    queryFn: async () => Object.fromEntries(await Promise.all((['unassigned', 'active', 'delivered'] as State[]).map(async (s) => [s, (await apiGetPage<DispatchRow>('/admin/delivery/dispatch', { state: s, limit: 1 })).total]))),
    refetchInterval: 20000,
  });
  const partners = usePartners();
  const assign = useMutation({
    mutationFn: ({ id, partnerId }: { id: string; partnerId: string }) => apiPost(`/admin/delivery/shipments/${id}/assign`, { partnerId }),
    onSuccess: () => { toast.success('Delivery partner assigned'); setPicking(null); void qc.invalidateQueries({ queryKey: ['dispatch'] }); void qc.invalidateQueries({ queryKey: ['dispatch-counts'] }); void qc.invalidateQueries({ queryKey: ['delivery-partners'] }); },
    onError: (e) => toast.fromError(e),
  });
  const active = (partners.data ?? []).filter((p) => p.status === 'active');

  return (
    <div>
      <PageHeader title="Dispatch" description="Sureshot’s own delivery fleet — assign every parcel to a delivery partner and track it to the door."
        actions={<Link to="/delivery/partners"><Button size="sm" variant="outline" className="h-9"><Bike className="h-4 w-4" /> Delivery partners</Button></Link>} />
      <Tabs label="Dispatch state" value={state} onChange={setState} className="mb-4" tabs={[
        { key: 'unassigned', label: 'Waiting for a rider', count: counts.data?.unassigned },
        { key: 'active', label: 'On the way', count: counts.data?.active },
        { key: 'delivered', label: 'Delivered', count: counts.data?.delivered },
      ]} />
      {rows.isLoading ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
        : rows.error ? <Card><ErrorState message="Dispatch couldn’t load." error={rows.error} onRetry={() => void rows.refetch()} /></Card>
          : !rows.data?.items.length ? <Card><EmptyState icon={PackageCheck} title={state === 'unassigned' ? 'Every parcel has a rider' : state === 'active' ? 'Nothing on the road right now' : 'No deliveries yet'} /></Card>
            : (
              <div className="grid gap-3 lg:grid-cols-2">
                {rows.data.items.map((r) => (
                  <Card key={r.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <Link to={`/orders/${r.order_id}`} className="font-semibold text-ink hover:underline">{r.order_number}</Link>
                        <p className="text-xs text-muted">{r.store_name} · {r.item_count} item{r.item_count === 1 ? '' : 's'} · placed {formatRelative(r.placed_at)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.payment_method === 'cod' ? <Badge tone="warning">COD {formatCurrency(r.cod_due_minor)}</Badge> : <Badge tone="success">Prepaid</Badge>}
                        <StatusBadge status={r.status} />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <p className="flex gap-2"><Truck className="mt-0.5 h-4 w-4 shrink-0 text-faint" /><span><span className="block text-xs text-muted">Pickup</span>{[r.pickup_line1, r.pickup_city].filter(Boolean).join(', ') || '—'}</span></p>
                      <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-faint" /><span><span className="block text-xs text-muted">Drop · {r.shipping_address?.recipientName ?? r.customer_name}</span>{[r.shipping_address?.line1, r.shipping_address?.city, r.shipping_address?.postalCode].filter(Boolean).join(', ')}</span></p>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                      {r.partner_name
                        ? <span className="flex items-center gap-2 text-sm"><Bike className="h-4 w-4 text-brand" /> <b>{r.partner_name}</b> <a className="text-muted hover:underline" href={`tel:${r.partner_phone}`}>{r.partner_phone}</a>{r.delivered_at && <span className="text-xs text-muted">· delivered {formatRelative(r.delivered_at)}{r.cod_collected_minor ? ` · collected ${formatCurrency(Number(r.cod_collected_minor))}` : ''}</span>}</span>
                        : <span className="text-sm text-muted">No rider yet</span>}
                      {r.status !== 'delivered' && (state === 'unassigned' || !['out_for_delivery'].includes(r.status)) && (
                        <Button size="sm" className="h-8" onClick={() => setPicking(r)}>{r.partner_name ? 'Reassign' : 'Assign rider'}</Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}

      <Modal open={picking !== null} onClose={() => setPicking(null)} title={`Assign ${picking?.order_number ?? ''}`} description="Online riders are listed first. A rider can be changed until they pick the parcel up.">
        {active.length === 0 ? <EmptyState icon={Bike} title="No active delivery partners" action={<Link to="/delivery/partners"><Button size="sm"><UserPlus className="h-4 w-4" /> Add a rider</Button></Link>} />
          : (
            <div className="divide-y divide-line rounded-lg border border-line">
              {[...active].sort((a, b) => Number(b.is_online) - Number(a.is_online) || a.active_jobs - b.active_jobs).map((p) => (
                <button key={p.id} disabled={assign.isPending} onClick={() => picking && assign.mutate({ id: picking.id, partnerId: p.id })}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2/70 disabled:opacity-60">
                  <span>
                    <span className="flex items-center gap-2 font-medium text-ink"><span className={`h-2 w-2 rounded-full ${p.is_online ? 'bg-success' : 'bg-faint'}`} />{p.full_name}</span>
                    <span className="text-xs text-muted">{humanize(p.vehicle_type)}{p.vehicle_number ? ` · ${p.vehicle_number}` : ''} · {p.is_online ? 'Online' : 'Offline'}</span>
                  </span>
                  <Badge tone={p.active_jobs > 3 ? 'warning' : 'neutral'}>{p.active_jobs} active</Badge>
                </button>
              ))}
            </div>
          )}
      </Modal>
    </div>
  );
}

const blank = { fullName: '', phone: '', email: '', password: '', vehicleType: 'bike', vehicleNumber: '', city: '' };

/** The fleet: add riders, see their live load and today's COD cash, switch them on/off. */
export function DeliveryPartnersPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blank);
  const partners = usePartners(q);
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['delivery-partners'] });
  const create = useMutation({
    mutationFn: () => apiPost('/admin/delivery/partners', { ...form, email: form.email || undefined, vehicleNumber: form.vehicleNumber || undefined, city: form.city || undefined }),
    onSuccess: () => { toast.success('Delivery partner added — they can sign in at /rider'); setAdding(false); setForm(blank); invalidate(); },
    onError: (e) => toast.fromError(e),
  });
  const toggle = useMutation({
    mutationFn: (p: Partner) => apiPatch(`/admin/delivery/partners/${p.id}`, { status: p.status === 'active' ? 'inactive' : 'active' }),
    onSuccess: (_d, p) => { toast.success(p.status === 'active' ? 'Rider deactivated' : 'Rider activated'); invalidate(); },
    onError: (e) => toast.fromError(e),
  });
  const rows = partners.data ?? [];
  const codToday = rows.reduce((s, p) => s + Number(p.cod_today_minor || 0), 0);

  return (
    <div>
      <PageHeader title="Delivery partners" description="Your own riders. They sign in to the Sureshot app at /rider to pick up and deliver."
        back={{ to: '/delivery', label: 'Dispatch' }}
        actions={<Button size="sm" className="h-9" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add delivery partner</Button>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {[['Riders', rows.length], ['Online now', rows.filter((p) => p.is_online).length], ['Delivered today', rows.reduce((s, p) => s + p.delivered_today, 0)], ['COD collected today', formatCurrency(codToday)]].map(([label, value]) => (
          <Card key={label as string} className="p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-xl font-semibold text-ink">{value}</p></Card>
        ))}
      </div>
      <div className="mb-4"><SearchInput value={q} onChange={setQ} placeholder="Search by name, phone or vehicle number…" /></div>
      {partners.isLoading ? <Skeleton className="h-40 w-full rounded-xl" />
        : partners.error ? <Card><ErrorState message="Delivery partners couldn’t load." error={partners.error} onRetry={() => void partners.refetch()} /></Card>
          : !rows.length ? <Card><EmptyState icon={Bike} title={q ? 'No riders match' : 'No delivery partners yet'} action={!q && <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add delivery partner</Button>} /></Card>
            : (
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-surface-2/60 text-left text-xs text-muted"><tr>{['Rider', 'Vehicle', 'Status', 'Active jobs', 'Delivered today', 'COD today', 'Total delivered', ''].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((p) => (
                      <tr key={p.id} className={p.status === 'inactive' ? 'opacity-60' : ''}>
                        <td className="px-4 py-3"><span className="flex items-center gap-2 font-medium text-ink"><span className={`h-2 w-2 rounded-full ${p.is_online ? 'bg-success' : 'bg-faint'}`} title={p.is_online ? 'Online' : 'Offline'} />{p.full_name}</span><a href={`tel:${p.phone}`} className="flex items-center gap-1 text-xs text-muted hover:underline"><Phone className="h-3 w-3" />{p.phone}</a></td>
                        <td className="px-4 py-3">{humanize(p.vehicle_type)}<span className="block text-xs text-muted">{p.vehicle_number ?? '—'}</span></td>
                        <td className="px-4 py-3"><Badge tone={p.status === 'active' ? (p.is_online ? 'success' : 'neutral') : 'danger'}>{p.status === 'active' ? (p.is_online ? 'Online' : 'Offline') : 'Inactive'}</Badge></td>
                        <td className="px-4 py-3">{p.active_jobs}</td>
                        <td className="px-4 py-3">{p.delivered_today}</td>
                        <td className="px-4 py-3">{formatCurrency(Number(p.cod_today_minor || 0))}</td>
                        <td className="px-4 py-3">{p.delivered_total}</td>
                        <td className="px-4 py-3 text-right"><Switch label={p.status === 'active' ? 'Deactivate rider' : 'Activate rider'} checked={p.status === 'active'} onChange={() => toggle.mutate(p)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add delivery partner" description="Creates the rider’s login. Share the phone number and password with them."
        footer={<><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button isLoading={create.isPending} onClick={() => create.mutate()}>Add rider</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" required><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
          <Field label="Mobile number" required hint="Used to sign in"><Input type="tel" placeholder="+919876543210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email" hint="Optional"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Password" required hint="8+ chars, upper & lower case, a number"><Input type="text" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Vehicle"><Select value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>{['bike', 'scooter', 'cycle', 'car', 'van'].map((v) => <option key={v} value={v}>{humanize(v)}</option>)}</Select></Field>
          <Field label="Vehicle number"><Input value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value.toUpperCase() })} /></Field>
          <Field label="City" className="sm:col-span-2"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
