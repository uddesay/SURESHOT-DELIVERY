import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, CalendarClock, Image as ImageIcon, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Field, Input, Select, Switch } from '../../components/ui/Input';
import { Drawer } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/apiClient';
import { formatDate, humanize } from '../../lib/format';

interface Banner {
  id: string; title: string; image_url: string; placement: string; target_type: string | null; target_value: string | null;
  sort_order: number; starts_at: string | null; ends_at: string | null; is_active: boolean; created_at: string;
}

const PLACEMENTS = ['home_hero', 'home_secondary', 'category_top', 'checkout'];

const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

function liveState(b: Banner): { label: string; tone: 'success' | 'info' | 'neutral' } {
  const now = Date.now();
  if (!b.is_active) return { label: 'Off', tone: 'neutral' };
  if (b.starts_at && new Date(b.starts_at).getTime() > now) return { label: 'Scheduled', tone: 'info' };
  if (b.ends_at && new Date(b.ends_at).getTime() <= now) return { label: 'Ended', tone: 'neutral' };
  return { label: 'Live', tone: 'success' };
}

const blank = { title: '', imageUrl: '', placement: 'home_hero', targetType: 'none', targetValue: '', sortOrder: '0', startsAt: '', endsAt: '', isActive: true };

export function BannersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [placement, setPlacement] = useState('');
  const [editing, setEditing] = useState<Banner | 'new' | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const banners = useQuery({ queryKey: ['admin-banners'], queryFn: () => apiGet<Banner[]>('/admin/cms/banners') });

  useEffect(() => {
    if (params.get('new')) { open('new'); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-banners'] });

  const rows = useMemo(() => (banners.data ?? [])
    .filter((b) => !placement || b.placement === placement)
    .sort((a, b) => a.placement.localeCompare(b.placement) || a.sort_order - b.sort_order), [banners.data, placement]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: form.title.trim(), imageUrl: form.imageUrl.trim(), placement: form.placement,
        targetType: form.targetType, targetValue: form.targetType === 'none' ? null : form.targetValue.trim(),
        sortOrder: Number(form.sortOrder) || 0, isActive: form.isActive,
        ...(form.startsAt ? { startsAt: new Date(form.startsAt).toISOString() } : editing !== 'new' ? { startsAt: null } : {}),
        ...(form.endsAt ? { endsAt: new Date(form.endsAt).toISOString() } : editing !== 'new' ? { endsAt: null } : {}),
      };
      return editing === 'new' ? apiPost('/admin/cms/banners', body) : apiPatch(`/admin/cms/banners/${(editing as Banner).id}`, body);
    },
    onSuccess: () => { toast.success(editing === 'new' ? 'Banner created' : 'Banner saved'); setEditing(null); invalidate(); },
    onError: (e) => toast.fromError(e, 'The banner couldn’t be saved.'),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiPatch(`/admin/cms/banners/${id}`, body),
    onSuccess: invalidate,
    onError: (e) => toast.fromError(e),
  });

  /** Swap sort order with the neighbour in the same placement. */
  const reorder = async (b: Banner, dir: -1 | 1) => {
    const group = (banners.data ?? []).filter((x) => x.placement === b.placement).sort((a, c) => a.sort_order - c.sort_order);
    const i = group.findIndex((x) => x.id === b.id);
    const other = group[i + dir];
    if (!other) return;
    // Normalise to unique sequential orders, then swap the pair.
    const orders = group.map((_, idx) => idx);
    [orders[i], orders[i + dir]] = [orders[i + dir]!, orders[i]!];
    try {
      await Promise.all(group.map((x, idx) => (x.sort_order !== orders[idx] ? apiPatch(`/admin/cms/banners/${x.id}`, { sortOrder: orders[idx] }) : null)));
      toast.success('Order updated');
    } catch (e) {
      toast.fromError(e);
    } finally {
      invalidate();
    }
  };

  function open(b: Banner | 'new') {
    setEditing(b);
    setError(null);
    setForm(b === 'new' ? blank : {
      title: b.title, imageUrl: b.image_url, placement: b.placement, targetType: b.target_type ?? 'none', targetValue: b.target_value ?? '',
      sortOrder: String(b.sort_order), startsAt: local(b.starts_at), endsAt: local(b.ends_at), isActive: b.is_active,
    });
  }

  const submit = () => {
    if (!form.title.trim()) return setError('Give the banner a title.');
    if (!/^https?:\/\//.test(form.imageUrl.trim())) return setError('Image must be a full http(s) URL.');
    if (form.targetType !== 'none' && !form.targetValue.trim()) return setError('Add where the banner links to.');
    if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) return setError('End must be after start.');
    setError(null);
    save.mutate();
  };

  const placementsInUse = [...new Set([...PLACEMENTS, ...(banners.data ?? []).map((b) => b.placement)])];

  return (
    <div>
      <PageHeader title="Banners" description="Hero and promotional imagery across the storefront. Schedule them ahead and they go live on their own." actions={<Button size="sm" className="h-9" onClick={() => open('new')}><Plus className="h-4 w-4" /> Add banner</Button>} />
      <Tabs label="Placement" className="mb-4" value={placement} onChange={setPlacement} tabs={[{ key: '', label: 'All placements' }, ...placementsInUse.map((p) => ({ key: p, label: humanize(p), count: (banners.data ?? []).filter((b) => b.placement === p).length }))]} />
      {banners.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}</div>
      ) : banners.error ? (
        <Card><ErrorState message="Banners couldn’t load." error={banners.error} onRetry={() => void banners.refetch()} /></Card>
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={ImageIcon} title="No banners here yet" message="Add a hero banner to set the tone of the storefront." action={<Button size="sm" onClick={() => open('new')}><Plus className="h-4 w-4" /> Add banner</Button>} /></Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((b) => {
            const state = liveState(b);
            const group = rows.filter((x) => x.placement === b.placement);
            const idx = group.indexOf(b);
            return (
              <li key={b.id} className="card group overflow-hidden">
                <button onClick={() => open(b)} className="relative block aspect-[16/7] w-full overflow-hidden bg-surface-2" aria-label={`Edit ${b.title}`}>
                  <img src={b.image_url} alt="" className={clsx('h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]', !b.is_active && 'opacity-50 grayscale')} />
                  <span className="absolute left-3 top-3"><Badge tone={state.tone} dot className="shadow-card">{state.label}</Badge></span>
                </button>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{b.title}</p>
                      <p className="text-xs text-muted">{humanize(b.placement)} · position {idx + 1}{b.target_type && b.target_type !== 'none' ? ` · links to ${b.target_type}` : ''}</p>
                    </div>
                    <Switch label={b.is_active ? `Turn off ${b.title}` : `Turn on ${b.title}`} checked={b.is_active} onChange={(v) => patch.mutate({ id: b.id, body: { isActive: v } }, { onSuccess: () => toast.success(v ? 'Banner switched on' : 'Banner switched off') })} />
                  </div>
                  {(b.starts_at || b.ends_at) && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><CalendarClock className="h-3.5 w-3.5" /> {b.starts_at ? formatDate(b.starts_at) : 'Now'} – {b.ends_at ? formatDate(b.ends_at) : 'no end'}</p>}
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                    <div className="flex">
                      <IconButton size="sm" label="Move earlier" disabled={idx === 0} onClick={() => void reorder(b, -1)}><ArrowUp className="h-3.5 w-3.5" /></IconButton>
                      <IconButton size="sm" label="Move later" disabled={idx === group.length - 1} onClick={() => void reorder(b, 1)}><ArrowDown className="h-3.5 w-3.5" /></IconButton>
                    </div>
                    <div className="flex">
                      <IconButton size="sm" label="Edit banner" onClick={() => open(b)}><Pencil className="h-3.5 w-3.5" /></IconButton>
                      <IconButton size="sm" tone="danger" label="Delete banner" onClick={() => void confirm({ title: `Delete “${b.title}”?`, tone: 'danger', confirmLabel: 'Delete', onConfirm: async () => { await apiDelete(`/admin/cms/banners/${b.id}`); toast.success('Banner deleted'); invalidate(); } })}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New banner' : 'Edit banner'}
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button isLoading={save.isPending} onClick={submit}>{editing === 'new' ? 'Create banner' : 'Save banner'}</Button></>}
      >
        <div className="space-y-4">
          <div className="aspect-[16/7] overflow-hidden rounded-xl border border-line bg-surface-2">
            {/^https?:\/\//.test(form.imageUrl) ? <img src={form.imageUrl} alt="Banner preview" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-faint">Image preview</div>}
          </div>
          <Field label="Title" required><Input value={form.title} maxLength={160} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Image URL" required hint="Wide images (around 16:7) look best."><Input value={form.imageUrl} placeholder="https://" onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Placement">
              <Select value={form.placement} onChange={(e) => setForm({ ...form, placement: e.target.value })}>{placementsInUse.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}</Select>
            </Field>
            <Field label="Position"><Input type="number" min={0} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Links to">
              <Select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })}>
                <option value="none">Nothing</option><option value="url">URL</option><option value="category">Category slug</option><option value="product">Product slug</option><option value="flash_sale">Flash sale</option>
              </Select>
            </Field>
            {form.targetType !== 'none' && <Field label={form.targetType === 'url' ? 'URL' : 'Slug or ID'}><Input value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })} /></Field>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start showing" hint="Blank = immediately"><Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></Field>
            <Field label="Stop showing" hint="Blank = no end"><Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></Field>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line p-3"><div><p className="text-sm font-medium">Published</p><p className="text-xs text-muted">Shown during its schedule.</p></div><Switch label="Published" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} /></div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
      </Drawer>
    </div>
  );
}
