import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { BrandRow } from '../../api/catalog';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { DataTable } from '../../components/ui/DataTable';
import { Dropdown, DropdownItem, DropdownSeparator } from '../../components/ui/Dropdown';
import { Field, Input, Select, Switch, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { useToast } from '../../components/ui/Toast';
import { useListState, usePagedQuery } from '../../hooks/useListState';
import { apiDelete, apiPatch, apiPost } from '../../lib/apiClient';

const blank = { name: '', slug: '', logoUrl: '', description: '', isActive: true };

export function BrandsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const list = useListState({ defaults: { active: '' }, pageSizeKey: 'brands' });
  const brands = usePagedQuery<BrandRow>(['admin-brands'], '/admin/brands', { page: list.page, limit: list.pageSize, q: list.q, active: list.filters.active });
  const [editing, setEditing] = useState<BrandRow | 'new' | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-brands'] });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
        ...(form.logoUrl.trim() ? { logoUrl: form.logoUrl.trim() } : {}),
        description: form.description,
        isActive: form.isActive,
      };
      return editing === 'new' ? apiPost('/admin/brands', body) : apiPatch(`/admin/brands/${(editing as BrandRow).id}`, body);
    },
    onSuccess: () => { toast.success(editing === 'new' ? 'Brand created' : 'Brand saved'); setEditing(null); invalidate(); },
    onError: (e) => toast.fromError(e, 'The brand couldn’t be saved.'),
  });

  const toggle = useMutation({
    mutationFn: (b: BrandRow) => apiPatch(`/admin/brands/${b.id}`, { isActive: !b.is_active }),
    onSuccess: (_d, b) => { toast.success(b.is_active ? `${b.name} deactivated` : `${b.name} activated`); invalidate(); },
    onError: (e) => toast.fromError(e),
  });

  const open = (b: BrandRow | 'new') => {
    setEditing(b);
    setError(null);
    setForm(b === 'new' ? blank : { name: b.name, slug: b.slug, logoUrl: b.logo_url ?? '', description: b.description ?? '', isActive: b.is_active });
  };

  const submit = () => {
    if (!form.name.trim()) return setError('Give the brand a name.');
    if (form.slug && !/^[a-z0-9-]+$/.test(form.slug)) return setError('Slugs use lowercase letters, numbers and dashes.');
    if (form.logoUrl && !/^https?:\/\//.test(form.logoUrl)) return setError('Logo must be a full http(s) URL.');
    setError(null);
    save.mutate();
  };

  return (
    <div>
      <PageHeader title="Brands" description="Brands help customers filter and trust what they buy." actions={<Button size="sm" className="h-9" onClick={() => open('new')}><Plus className="h-4 w-4" /> Add brand</Button>} />
      <DataTable
        caption="Brands"
        storageKey="brands"
        rows={brands.items}
        rowKey={(b) => b.id}
        loading={brands.isLoading}
        fetching={brands.isFetching}
        error={brands.error}
        onRetry={() => void brands.refetch()}
        onRowClick={open}
        pagination={{ page: list.page, totalPages: brands.totalPages, total: brands.total, pageSize: list.pageSize, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
        empty={{ icon: Tags, title: list.q ? 'No brands match' : 'No brands yet', action: !list.q && <Button size="sm" onClick={() => open('new')}><Plus className="h-4 w-4" /> Add brand</Button> }}
        toolbar={
          <>
            <SearchInput value={list.q} onChange={list.setQuery} placeholder="Search brands…" />
            <Select aria-label="Status" value={list.filters.active} onChange={(e) => list.setFilter('active', e.target.value)} className="w-36">
              <option value="">All brands</option><option value="true">Active</option><option value="false">Inactive</option>
            </Select>
          </>
        }
        columns={[
          { id: 'brand', header: 'Brand', mobile: 'primary', hideable: false, cell: (b) => <div className="flex items-center gap-3"><Avatar name={b.name} src={b.logo_url} size="sm" square /><div><p className="font-medium text-ink">{b.name}</p><p className="font-mono text-2xs text-faint">/{b.slug}</p></div></div> },
          { id: 'products', header: 'Products', align: 'right', cell: (b) => <Link to={`/products?brandId=${b.id}`} onClick={(e) => e.stopPropagation()} className="tabular hover:underline">{b.product_count}</Link> },
          { id: 'status', header: 'Status', cell: (b) => <Badge tone={b.is_active ? 'success' : 'neutral'} dot>{b.is_active ? 'Active' : 'Inactive'}</Badge> },
          { id: 'visible', header: 'Visible', cell: (b) => <span onClick={(e) => e.stopPropagation()}><Switch label={`Toggle ${b.name}`} checked={b.is_active} onChange={() => toggle.mutate(b)} /></span> },
        ]}
        rowActions={(b) => (
          <Dropdown align="end" trigger={(props) => <IconButton {...props} size="sm" label={`Actions for ${b.name}`}><MoreHorizontal className="h-4 w-4" /></IconButton>}>
            <DropdownItem icon={Pencil} onSelect={() => open(b)}>Edit</DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={Trash2} tone="danger" onSelect={() => void confirm({
              title: `Delete ${b.name}?`,
              description: b.product_count ? `${b.product_count} product(s) use this brand and will show no brand.` : 'This brand will be removed.',
              tone: 'danger', confirmLabel: 'Delete',
              onConfirm: async () => { await apiDelete(`/admin/brands/${b.id}`); toast.success('Brand deleted'); invalidate(); },
            })}>Delete</DropdownItem>
          </Dropdown>
        )}
      />
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New brand' : 'Edit brand'}
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button isLoading={save.isPending} onClick={submit}>Save brand</Button></>}
      >
        <div className="space-y-4">
          <Field label="Name" required><Input autoFocus value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="URL slug" hint="Leave blank to generate from the name."><Input className="font-mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} /></Field>
          <Field label="Logo URL"><Input value={form.logoUrl} placeholder="https://" onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} /></Field>
          <Field label="Description"><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="flex items-center justify-between rounded-lg border border-line p-3"><span className="text-sm font-medium">Active</span><Switch label="Active" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} /></div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
