import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronRight, FolderTree, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { catalogApi, categoryOptions, type CategoryRow } from '../../api/catalog';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Dropdown, DropdownItem, DropdownSeparator } from '../../components/ui/Dropdown';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Field, Input, Select, Switch, Textarea } from '../../components/ui/Input';
import { Drawer } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { apiDelete, apiPatch, apiPost } from '../../lib/apiClient';

interface FormState {
  name: string; slug: string; parentId: string; description: string; imageUrl: string;
  commission: string; sortOrder: string; isActive: boolean; seoTitle: string; seoDescription: string;
}

const blank: FormState = { name: '', slug: '', parentId: '', description: '', imageUrl: '', commission: '10', sortOrder: '0', isActive: true, seoTitle: '', seoDescription: '' };

const toForm = (c: CategoryRow): FormState => ({
  name: c.name, slug: c.slug, parentId: c.parent_id ?? '', description: c.description ?? '', imageUrl: c.image_url ?? '',
  commission: String(c.commission_rate_bp / 100), sortOrder: String(c.sort_order), isActive: c.is_active,
  seoTitle: c.seo_title ?? '', seoDescription: c.seo_description ?? '',
});

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<CategoryRow | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const categories = useQuery({ queryKey: ['admin-categories'], queryFn: catalogApi.categories });
  const options = useMemo(() => categoryOptions(categories.data ?? []), [categories.data]);
  const focus = params.get('focus');

  useEffect(() => {
    if (!focus || !categories.data) return;
    const row = categories.data.find((c) => c.id === focus);
    if (row) { setEditing(row); setForm(toForm(row)); }
    setParams((p) => { const n = new URLSearchParams(p); n.delete('focus'); return n; }, { replace: true });
  }, [focus, categories.data, setParams]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-categories'] });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
        parentId: form.parentId || null,
        description: form.description,
        ...(form.imageUrl.trim() ? { imageUrl: form.imageUrl.trim() } : {}),
        commissionRateBp: Math.round(Number(form.commission) * 100),
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
        ...(form.seoTitle.trim() ? { seoTitle: form.seoTitle.trim() } : {}),
        ...(form.seoDescription.trim() ? { seoDescription: form.seoDescription.trim() } : {}),
      };
      return editing === 'new' ? apiPost('/admin/categories', body) : apiPatch(`/admin/categories/${(editing as CategoryRow).id}`, body);
    },
    onSuccess: () => { toast.success(editing === 'new' ? 'Category created' : 'Category saved'); setEditing(null); invalidate(); },
    onError: (e) => toast.fromError(e, 'The category couldn’t be saved.'),
  });

  const toggle = useMutation({
    mutationFn: (c: CategoryRow) => apiPatch(`/admin/categories/${c.id}`, { isActive: !c.is_active }),
    onMutate: async (c) => {
      await queryClient.cancelQueries({ queryKey: ['admin-categories'] });
      const prev = queryClient.getQueryData<CategoryRow[]>(['admin-categories']);
      queryClient.setQueryData<CategoryRow[]>(['admin-categories'], (rows) => rows?.map((r) => (r.id === c.id ? { ...r, is_active: !c.is_active } : r)));
      return { prev };
    },
    onError: (e, _c, ctx) => { queryClient.setQueryData(['admin-categories'], ctx?.prev); toast.fromError(e); },
    onSuccess: (_d, c) => toast.success(c.is_active ? `${c.name} hidden from the storefront` : `${c.name} is visible again`),
    onSettled: invalidate,
  });

  const open = (target: CategoryRow | 'new', parentId = '') => {
    setEditing(target);
    setForm(target === 'new' ? { ...blank, parentId } : toForm(target));
    setErrors({});
  };

  const submit = () => {
    const e: typeof errors = {};
    if (form.name.trim().length < 2) e.name = 'Name must be at least 2 characters.';
    if (form.slug && !/^[a-z0-9-]+$/.test(form.slug)) e.slug = 'Use lowercase letters, numbers and dashes.';
    const c = Number(form.commission);
    if (!Number.isFinite(c) || c < 0 || c > 50) e.commission = 'Commission must be 0–50%.';
    if (form.imageUrl && !/^https?:\/\//.test(form.imageUrl)) e.imageUrl = 'Use a full http(s) URL.';
    setErrors(e);
    if (!Object.keys(e).length) save.mutate();
  };

  const remove = (c: CategoryRow) => void confirm({
    title: `Delete “${c.name}”?`,
    description: c.product_count ? `It still has ${c.product_count} product(s). Move them to another category first.` : 'This removes the category from the storefront navigation.',
    tone: 'danger',
    confirmLabel: 'Delete',
    onConfirm: async () => { await apiDelete(`/admin/categories/${c.id}`); toast.success('Category deleted'); invalidate(); },
  });

  const term = q.toLowerCase();
  const hiddenByCollapse = (row: CategoryRow): boolean => {
    let parent = row.parent_id;
    while (parent) {
      if (collapsed.has(parent)) return true;
      parent = categories.data?.find((c) => c.id === parent)?.parent_id ?? null;
    }
    return false;
  };
  const visible = options.filter((o) => (term ? o.label.toLowerCase().includes(term) || o.row.slug.includes(term) : !hiddenByCollapse(o.row)));
  const hasChildren = (id: string) => (categories.data ?? []).some((c) => c.parent_id === id);

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Shape how customers browse. Hidden categories stay off the storefront but keep their products."
        actions={<Button size="sm" className="h-9" onClick={() => open('new')}><Plus className="h-4 w-4" /> Add category</Button>}
      />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search categories…" delay={100} />
          <span className="ml-auto text-xs text-muted">{categories.data?.length ?? 0} categories · {categories.data?.filter((c) => !c.is_active).length ?? 0} hidden</span>
        </div>
        {categories.isLoading ? (
          <div className="space-y-3 p-5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : categories.error ? (
          <ErrorState message="Categories couldn’t load." error={categories.error} onRetry={() => void categories.refetch()} />
        ) : visible.length === 0 ? (
          <EmptyState icon={FolderTree} title={q ? 'No categories match' : 'No categories yet'} message={q ? undefined : 'Create your first category to start organising products.'} action={!q && <Button size="sm" onClick={() => open('new')}><Plus className="h-4 w-4" /> Add category</Button>} />
        ) : (
          <ul role="tree" aria-label="Categories" className="divide-y divide-line">
            {visible.map(({ row: c, depth }) => (
              <li key={c.id} role="treeitem" aria-level={depth + 1} aria-expanded={hasChildren(c.id) ? !collapsed.has(c.id) : undefined} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
                <div className="flex min-w-0 flex-1 items-center gap-2" style={{ paddingLeft: term ? 0 : depth * 22 }}>
                  {hasChildren(c.id) && !term ? (
                    <IconButton size="sm" label={collapsed.has(c.id) ? `Expand ${c.name}` : `Collapse ${c.name}`} onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}>
                      <ChevronRight className={clsx('h-4 w-4 transition-transform', !collapsed.has(c.id) && 'rotate-90')} />
                    </IconButton>
                  ) : <span className="w-7" />}
                  {c.image_url ? <img src={c.image_url} alt="" className="h-8 w-8 rounded-md object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-2 text-faint"><FolderTree className="h-4 w-4" /></span>}
                  <div className="min-w-0">
                    <button onClick={() => open(c)} className={clsx('truncate text-left text-sm font-medium hover:underline', c.is_active ? 'text-ink' : 'text-muted')}>{c.name}</button>
                    <p className="truncate font-mono text-2xs text-faint">/{c.slug}</p>
                  </div>
                  {!c.is_active && <Badge>Hidden</Badge>}
                </div>
                <Link to={`/products?categoryId=${c.id}`} className="tabular hidden w-24 text-right text-[13px] text-muted hover:text-ink sm:block">{c.product_count} product{c.product_count === 1 ? '' : 's'}</Link>
                <span className="tabular hidden w-20 text-right text-[13px] text-muted md:block" title="Commission">{(c.commission_rate_bp / 100).toFixed(1).replace(/\.0$/, '')}%</span>
                <Switch label={c.is_active ? `Hide ${c.name}` : `Show ${c.name}`} checked={c.is_active} onChange={() => toggle.mutate(c)} />
                <Dropdown align="end" trigger={(props) => <IconButton {...props} size="sm" label={`Actions for ${c.name}`}><MoreHorizontal className="h-4 w-4" /></IconButton>}>
                  <DropdownItem icon={Pencil} onSelect={() => open(c)}>Edit</DropdownItem>
                  <DropdownItem icon={Plus} onSelect={() => open('new', c.id)}>Add subcategory</DropdownItem>
                  <DropdownSeparator />
                  <DropdownItem icon={Trash2} tone="danger" onSelect={() => remove(c)}>Delete</DropdownItem>
                </Dropdown>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New category' : `Edit ${editing?.name ?? ''}`}
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button isLoading={save.isPending} onClick={submit}>Save category</Button></>}
      >
        <div className="space-y-4">
          <Field label="Name" required error={errors.name}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
          <Field label="URL slug" error={errors.slug} hint="Leave blank to generate from the name."><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} className="font-mono" /></Field>
          <Field label="Parent category">
            <Select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
              <option value="">None — top level</option>
              {options.filter((o) => editing === 'new' || o.id !== (editing as CategoryRow | null)?.id).map((o) => <option key={o.id} value={o.id}>{'  '.repeat(o.depth)}{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Description"><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Image URL" error={errors.imageUrl}><Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Commission (%)" error={errors.commission} hint="Default for vendors selling here."><Input type="number" min={0} max={50} step="0.1" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })} /></Field>
            <Field label="Sort order"><Input type="number" min={0} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line p-3">
            <div><p className="text-sm font-medium">Visible on storefront</p><p className="text-xs text-muted">Hidden categories keep their products.</p></div>
            <Switch label="Visible on storefront" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
          </div>
          <Field label="SEO title"><Input value={form.seoTitle} maxLength={160} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} /></Field>
          <Field label="SEO description"><Textarea rows={2} value={form.seoDescription} maxLength={320} onChange={(e) => setForm({ ...form, seoDescription: e.target.value })} /></Field>
        </div>
      </Drawer>
    </div>
  );
}
