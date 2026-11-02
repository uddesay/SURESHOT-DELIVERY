import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, Copy, MoreHorizontal, Pencil, Plus, Power } from 'lucide-react';
import { useEffect, useState } from 'react';

import { catalogApi, type ProductRow } from '../../api/catalog';
import { StatusBadge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { Dropdown, DropdownItem } from '../../components/ui/Dropdown';
import { Checkbox, Field, Input, Select, Switch, Textarea } from '../../components/ui/Input';
import { Drawer } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { useListState, usePagedQuery } from '../../hooks/useListState';
import { apiPatch, apiPost } from '../../lib/apiClient';
import { formatCurrency, formatDate, formatNumber, fromMinor, toMinor } from '../../lib/format';
import { useCatalogOptions } from './catalogOptions';

interface Coupon {
  id: string; code: string; title: string; description: string | null; discount_type: 'percent' | 'fixed'; discount_value: number;
  max_discount_minor: number | null; min_order_minor: number; usage_limit_total: number | null; usage_limit_per_user: number;
  applicable_scope: 'all' | 'category' | 'product' | 'vendor' | 'first_order'; scope_ids: string[] | null;
  starts_at: string; ends_at: string; is_active: boolean; redemptions: number; discount_given_minor: number; state: string;
}

type Scope = Coupon['applicable_scope'];

interface FormState {
  code: string; title: string; description: string; discountType: 'percent' | 'fixed'; value: string; maxDiscount: string;
  minOrder: string; usageTotal: string; perUser: string; startsAt: string; endsAt: string; scope: Scope; scopeIds: string[]; isActive: boolean;
}

const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const blank = (): FormState => ({
  code: '', title: '', description: '', discountType: 'percent', value: '', maxDiscount: '', minOrder: '0', usageTotal: '', perUser: '1',
  startsAt: local(new Date()), endsAt: local(new Date(Date.now() + 30 * 86400000)), scope: 'all', scopeIds: [], isActive: true,
});

const toForm = (c: Coupon): FormState => ({
  code: c.code, title: c.title, description: c.description ?? '', discountType: c.discount_type,
  value: c.discount_type === 'percent' ? String(c.discount_value / 100) : fromMinor(c.discount_value),
  maxDiscount: fromMinor(c.max_discount_minor), minOrder: fromMinor(c.min_order_minor), usageTotal: c.usage_limit_total ? String(c.usage_limit_total) : '',
  perUser: String(c.usage_limit_per_user), startsAt: local(new Date(c.starts_at)), endsAt: local(new Date(c.ends_at)),
  scope: c.applicable_scope, scopeIds: c.scope_ids ?? [], isActive: c.is_active,
});

const discountLabel = (c: Coupon) => (c.discount_type === 'percent'
  ? `${c.discount_value / 100}% off${c.max_discount_minor ? ` · max ${formatCurrency(c.max_discount_minor)}` : ''}`
  : `${formatCurrency(c.discount_value)} off`);

const SCOPE_LABELS: Record<Scope, string> = { all: 'Entire order', category: 'Specific categories', product: 'Specific products', vendor: 'Specific vendors', first_order: 'First order only' };

function ProductPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const results = useQuery({ queryKey: ['coupon-product-search', q], queryFn: () => catalogApi.products({ q, limit: 10, status: 'active' }) });
  return (
    <div className="space-y-2">
      <SearchInput value={q} onChange={setQ} placeholder="Search live products…" className="sm:w-full" />
      <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {(results.data?.items ?? []).map((p: ProductRow) => (
          <li key={p.id} className="px-3 py-2">
            <Checkbox checked={selected.includes(p.id)} onChange={(on) => onChange(on ? [...selected, p.id] : selected.filter((x) => x !== p.id))} label={p.title} description={p.sku ?? undefined} />
          </li>
        ))}
        {results.data && !results.data.items.length && <li className="px-3 py-4 text-center text-xs text-muted">No live products match.</li>}
      </ul>
      <p className="text-xs text-muted">{selected.length} product{selected.length === 1 ? '' : 's'} selected</p>
    </div>
  );
}

export function CouponsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useListState({ defaults: { state: '', new: '' }, pageSizeKey: 'coupons' });
  const coupons = usePagedQuery<Coupon>(['admin-coupons'], '/admin/coupons', { page: list.page, limit: list.pageSize, q: list.q, state: list.filters.state });
  const { categories, vendors } = useCatalogOptions();
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    if (list.filters.new) { setEditing('new'); setForm(blank()); setErrors({}); list.setFilter('new', ''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.filters.new]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const save = useMutation({
    mutationFn: () => {
      const value = form.discountType === 'percent' ? Math.round(Number(form.value) * 100) : toMinor(form.value);
      const body = {
        ...(editing === 'new' ? { code: form.code.trim().toUpperCase() } : {}),
        title: form.title.trim(),
        description: form.description,
        discountType: form.discountType,
        discountValue: value,
        maxDiscountMinor: form.discountType === 'percent' && form.maxDiscount ? toMinor(form.maxDiscount) : null,
        minOrderMinor: toMinor(form.minOrder || 0),
        usageLimitTotal: form.usageTotal ? Number(form.usageTotal) : null,
        usageLimitPerUser: Number(form.perUser) || 1,
        applicableScope: form.scope,
        scopeIds: ['category', 'product', 'vendor'].includes(form.scope) ? form.scopeIds : null,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        isActive: form.isActive,
      };
      return editing === 'new' ? apiPost('/admin/coupons', body) : apiPatch(`/admin/coupons/${(editing as Coupon).id}`, body);
    },
    onSuccess: () => { toast.success(editing === 'new' ? 'Coupon created' : 'Coupon saved'); setEditing(null); invalidate(); },
    onError: (e) => toast.fromError(e, 'The coupon couldn’t be saved.'),
  });

  const toggle = useMutation({
    mutationFn: (c: Coupon) => apiPatch(`/admin/coupons/${c.id}`, { isActive: !c.is_active }),
    onSuccess: (_d, c) => { toast.success(c.is_active ? `${c.code} disabled` : `${c.code} enabled`); invalidate(); },
    onError: (e) => toast.fromError(e),
  });

  const submit = () => {
    const e: typeof errors = {};
    if (editing === 'new' && !/^[A-Za-z0-9]{3,40}$/.test(form.code.trim())) e.code = 'Codes are 3–40 letters or digits.';
    if (!form.title.trim()) e.title = 'Add a short title customers will see.';
    const v = Number(form.value);
    if (!(v > 0)) e.value = 'Enter a discount greater than zero.';
    else if (form.discountType === 'percent' && v > 100) e.value = 'Percent discounts can’t exceed 100%.';
    if (form.minOrder && Number(form.minOrder) < 0) e.minOrder = 'Must be zero or more.';
    if (form.usageTotal && !(Number(form.usageTotal) >= 1)) e.usageTotal = 'Leave blank for unlimited, or enter 1+.';
    if (!(Number(form.perUser) >= 1)) e.perUser = 'At least 1 use per customer.';
    if (!form.startsAt || !form.endsAt || new Date(form.endsAt) <= new Date(form.startsAt)) e.endsAt = 'End must be after the start.';
    if (['category', 'product', 'vendor'].includes(form.scope) && !form.scopeIds.length) e.scope = 'Pick at least one.';
    setErrors(e);
    if (!Object.keys(e).length) save.mutate();
  };

  return (
    <div>
      <PageHeader title="Coupons" description="Codes customers apply at checkout. Status follows the schedule automatically." actions={<Button size="sm" className="h-9" onClick={() => { setEditing('new'); setForm(blank()); setErrors({}); }}><Plus className="h-4 w-4" /> Create coupon</Button>} />
      <Tabs label="Coupon status" className="mb-4" value={list.filters.state} onChange={(v) => list.setFilter('state', v)} tabs={[{ key: '', label: 'All' }, { key: 'active', label: 'Active' }, { key: 'scheduled', label: 'Scheduled' }, { key: 'expired', label: 'Expired' }, { key: 'disabled', label: 'Disabled' }]} />
      <DataTable
        caption="Coupons"
        storageKey="coupons"
        rows={coupons.items}
        rowKey={(c) => c.id}
        loading={coupons.isLoading}
        fetching={coupons.isFetching}
        error={coupons.error}
        onRetry={() => void coupons.refetch()}
        onRowClick={(c) => { setEditing(c); setForm(toForm(c)); setErrors({}); }}
        pagination={{ page: list.page, totalPages: coupons.totalPages, total: coupons.total, pageSize: list.pageSize, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
        empty={{ icon: BadgePercent, title: list.q || list.filters.state ? 'No coupons match' : 'No coupons yet', message: 'Create a code for a launch, a season or a loyal customer.' }}
        toolbar={<SearchInput value={list.q} onChange={list.setQuery} placeholder="Search code or title…" />}
        columns={[
          { id: 'code', header: 'Code', mobile: 'primary', hideable: false, cell: (c) => <div><p className="font-mono font-semibold text-ink">{c.code}</p><p className="text-xs text-faint">{c.title}</p></div> },
          { id: 'discount', header: 'Discount', cell: (c) => discountLabel(c) },
          { id: 'scope', header: 'Applies to', cell: (c) => `${SCOPE_LABELS[c.applicable_scope]}${c.scope_ids?.length ? ` (${c.scope_ids.length})` : ''}` },
          { id: 'min', header: 'Min. order', align: 'right', cell: (c) => <span className="tabular">{c.min_order_minor ? formatCurrency(c.min_order_minor) : '—'}</span> },
          { id: 'usage', header: 'Used', align: 'right', cell: (c) => <span className="tabular">{formatNumber(c.redemptions)}{c.usage_limit_total ? <span className="text-faint"> / {c.usage_limit_total}</span> : ''}</span> },
          { id: 'given', header: 'Discount given', align: 'right', defaultHidden: true, cell: (c) => <span className="tabular">{formatCurrency(c.discount_given_minor)}</span> },
          { id: 'window', header: 'Valid', cell: (c) => <span className="whitespace-nowrap text-xs">{formatDate(c.starts_at)} – {formatDate(c.ends_at)}</span> },
          { id: 'state', header: 'Status', cell: (c) => <StatusBadge status={c.state} /> },
        ]}
        rowActions={(c) => (
          <Dropdown align="end" trigger={(props) => <IconButton {...props} size="sm" label={`Actions for ${c.code}`}><MoreHorizontal className="h-4 w-4" /></IconButton>}>
            <DropdownItem icon={Pencil} onSelect={() => { setEditing(c); setForm(toForm(c)); setErrors({}); }}>Edit</DropdownItem>
            <DropdownItem icon={Copy} onSelect={() => void navigator.clipboard.writeText(c.code).then(() => toast.success(`Copied ${c.code}`), () => toast.error('Clipboard unavailable'))}>Copy code</DropdownItem>
            <DropdownItem icon={Power} onSelect={() => toggle.mutate(c)}>{c.is_active ? 'Disable' : 'Enable'}</DropdownItem>
          </Dropdown>
        )}
      />

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Create coupon' : `Edit ${(editing as Coupon | null)?.code ?? ''}`}
        description={editing && editing !== 'new' ? `${editing.redemptions} redemption${editing.redemptions === 1 ? '' : 's'} so far` : 'Customers enter the code at checkout.'}
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button isLoading={save.isPending} onClick={submit}>{editing === 'new' ? 'Create coupon' : 'Save coupon'}</Button></>}
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" required error={errors.code} hint={editing !== 'new' ? 'Codes can’t be changed.' : undefined}>
              <Input className="font-mono uppercase" value={form.code} disabled={editing !== 'new'} maxLength={40} onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="SUMMER20" />
            </Field>
            <Field label="Title" required error={errors.title}><Input value={form.title} maxLength={160} onChange={(e) => set('title', e.target.value)} placeholder="20% off summer edit" /></Field>
          </div>
          <Field label="Description"><Textarea rows={2} value={form.description} maxLength={1000} onChange={(e) => set('description', e.target.value)} /></Field>

          <fieldset className="space-y-4 rounded-xl border border-line p-4">
            <legend className="px-1 text-[13px] font-semibold">Discount</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type">
                <Select value={form.discountType} onChange={(e) => set('discountType', e.target.value as FormState['discountType'])}>
                  <option value="percent">Percentage</option><option value="fixed">Fixed amount (₹)</option>
                </Select>
              </Field>
              <Field label={form.discountType === 'percent' ? 'Value (%)' : 'Value (₹)'} required error={errors.value}><Input type="number" min={0} step="0.01" value={form.value} onChange={(e) => set('value', e.target.value)} /></Field>
              <Field label="Minimum order (₹)" error={errors.minOrder}><Input type="number" min={0} step="0.01" value={form.minOrder} onChange={(e) => set('minOrder', e.target.value)} /></Field>
              {form.discountType === 'percent' && <Field label="Maximum discount (₹)" hint="Optional cap."><Input type="number" min={0} step="0.01" value={form.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} /></Field>}
            </div>
          </fieldset>

          <fieldset className="space-y-4 rounded-xl border border-line p-4">
            <legend className="px-1 text-[13px] font-semibold">Limits & schedule</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Total uses" error={errors.usageTotal} hint="Blank = unlimited"><Input type="number" min={1} value={form.usageTotal} onChange={(e) => set('usageTotal', e.target.value)} /></Field>
              <Field label="Uses per customer" required error={errors.perUser}><Input type="number" min={1} value={form.perUser} onChange={(e) => set('perUser', e.target.value)} /></Field>
              <Field label="Starts" required><Input type="datetime-local" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></Field>
              <Field label="Ends" required error={errors.endsAt}><Input type="datetime-local" value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} /></Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4 rounded-xl border border-line p-4">
            <legend className="px-1 text-[13px] font-semibold">Eligibility</legend>
            <Field label="Applies to" error={errors.scope}>
              <Select value={form.scope} onChange={(e) => { set('scope', e.target.value as Scope); set('scopeIds', []); }}>
                {Object.entries(SCOPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            {form.scope === 'category' && (
              <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
                {categories.map((c) => <li key={c.id} style={{ paddingLeft: c.depth * 16 }}><Checkbox checked={form.scopeIds.includes(c.id)} onChange={(on) => set('scopeIds', on ? [...form.scopeIds, c.id] : form.scopeIds.filter((x) => x !== c.id))} label={c.label} /></li>)}
              </ul>
            )}
            {form.scope === 'vendor' && (
              <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
                {vendors.map((v) => <li key={v.id}><Checkbox checked={form.scopeIds.includes(v.id)} onChange={(on) => set('scopeIds', on ? [...form.scopeIds, v.id] : form.scopeIds.filter((x) => x !== v.id))} label={v.store_name} /></li>)}
              </ul>
            )}
            {form.scope === 'product' && <ProductPicker selected={form.scopeIds} onChange={(ids) => set('scopeIds', ids)} />}
            {form.scope === 'first_order' && <p className="text-xs text-muted">Only customers without a previous order can use this code.</p>}
          </fieldset>

          <div className="flex items-center justify-between rounded-xl border border-line p-4">
            <div><p className="text-sm font-medium">Enabled</p><p className="text-xs text-muted">Disabled codes are rejected at checkout regardless of dates.</p></div>
            <Switch label="Enabled" checked={form.isActive} onChange={(v) => set('isActive', v)} />
          </div>
        </div>
      </Drawer>
    </div>
  );
}
