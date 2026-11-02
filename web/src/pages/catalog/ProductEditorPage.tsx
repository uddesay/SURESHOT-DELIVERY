import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertCircle, ArrowDown, ArrowUp, Check, CheckCircle2, Eye, GripVertical, History, ImagePlus, Loader2, Plus, Save, Send, Trash2, Upload, X, XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { catalogApi } from '../../api/catalog';
import { useAuth } from '../../auth/AuthContext';
import { useBreadcrumb } from '../../components/layout/ShellContext';
import { StatusBadge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { ErrorState } from '../../components/ui/EmptyState';
import { Field, Input, Select, Switch, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { ApiException, apiPost } from '../../lib/apiClient';
import { formatCurrency, formatDateTime, formatRelative, toMinor } from '../../lib/format';
import { storage } from '../../lib/storage';
import { useCatalogOptions } from './catalogOptions';
import {
  blankProduct, blankVariant, fromDetail, sectionOf, slugPreview, toPayload, uid, validate, variantSignature,
  type Errors, type ProductForm, type Section, type VariantForm,
} from './productForm';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'media', label: 'Media' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'variants', label: 'Variants' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'seo', label: 'SEO' },
  { key: 'advanced', label: 'Advanced' },
];

interface Draft { form: ProductForm; savedAt: string }

function Section({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} action={action} />
      <div className="space-y-5 p-5">{children}</div>
    </Card>
  );
}

export function ProductEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { categories, brands, vendors } = useCatalogOptions();
  const draftKey = `sureshot.admin.productDraft.${id ?? 'new'}`;

  const product = useQuery({ queryKey: ['admin-product', id], queryFn: () => catalogApi.product(id!), enabled: !isNew });
  const [form, setForm] = useState<ProductForm | null>(isNew ? blankProduct() : null);
  const [baseline, setBaseline] = useState<string>(isNew ? JSON.stringify(blankProduct()) : '');
  const [section, setSection] = useState<Section>('general');
  const [errors, setErrors] = useState<Errors>({});
  const [restorable, setRestorable] = useState<Draft | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [autosavedAt, setAutosavedAt] = useState<string | null>(null);
  const originalVariants = useRef<string>('');

  useBreadcrumb(isNew ? 'New product' : product.data?.title ?? null);

  // Load server data once, then offer to restore a newer local draft.
  useEffect(() => {
    if (isNew) {
      const draft = storage.get<Draft | null>(draftKey, null);
      if (draft && JSON.stringify(draft.form) !== JSON.stringify(blankProduct())) setRestorable(draft);
      return;
    }
    if (!product.data || form) return;
    const loaded = fromDetail(product.data);
    setForm(loaded);
    setBaseline(JSON.stringify(loaded));
    originalVariants.current = variantSignature(loaded.variants);
    const draft = storage.get<Draft | null>(draftKey, null);
    if (draft && new Date(draft.savedAt) > new Date(product.data.updated_at) && JSON.stringify(draft.form) !== JSON.stringify(loaded)) setRestorable(draft);
  }, [isNew, product.data, form, draftKey]);

  const dirty = Boolean(form) && JSON.stringify(form) !== baseline;

  // Autosave a local draft while editing.
  useEffect(() => {
    if (!form || !dirty) return;
    const t = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      storage.set(draftKey, { form, savedAt });
      setAutosavedAt(savedAt);
    }, 800);
    return () => window.clearTimeout(t);
  }, [form, dirty, draftKey]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const update = useCallback(<K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setErrors((e) => { if (!e[key as string]) return e; const n = { ...e }; delete n[key as string]; return n; });
  }, []);

  const updateVariant = (index: number, patch: Partial<VariantForm>) => {
    setForm((f) => (f ? { ...f, variants: f.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)) } : f));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(patch)) delete n[`variant.${index}.${k}`];
      return n;
    });
  };

  const save = useMutation({
    mutationFn: async (status: ProductForm['status']) => {
      const next = { ...form!, status };
      if (isNew) return catalogApi.createProduct(toPayload(next, { create: true }));
      const variantsChanged = variantSignature(next.variants) !== originalVariants.current;
      return catalogApi.updateProduct(id!, toPayload(next, { create: false, includeVariants: variantsChanged }));
    },
    onSuccess: (saved, status) => {
      storage.remove(draftKey);
      setAutosavedAt(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      void queryClient.invalidateQueries({ queryKey: ['shell-queues'] });
      const loaded = fromDetail(saved);
      queryClient.setQueryData(['admin-product', saved.id], saved);
      setForm(loaded);
      setBaseline(JSON.stringify(loaded));
      originalVariants.current = variantSignature(loaded.variants);
      toast.success(
        status === 'active' ? 'Product published' : isNew ? 'Draft saved' : 'Changes saved',
        status === 'active' ? 'It’s live on the storefront now.' : undefined,
      );
      if (isNew) navigate(`/products/${saved.id}`, { replace: true });
    },
    onError: (e) => {
      if (e instanceof ApiException && e.errors.length) {
        const mapped: Errors = {};
        for (const err of e.errors) {
          const m = err.field.match(/^variants\.(\d+)\.(\w+)/);
          if (m) mapped[`variant.${m[1]}.${({ salePriceMinor: 'price', mrpMinor: 'mrp', sku: 'sku' } as Record<string, string>)[m[2]!] ?? m[2]}`] = err.message;
          else mapped[err.field] = err.message;
        }
        setErrors(mapped);
      }
      toast.fromError(e, 'The product couldn’t be saved.');
    },
  });

  const submit = (status: ProductForm['status']) => {
    if (!form) return;
    const found = validate(form, { create: isNew, publishing: status === 'active' });
    setErrors(found);
    const keys = Object.keys(found);
    if (keys.length) {
      setSection(sectionOf(keys[0]!));
      toast.error(`Fix ${keys.length} field${keys.length === 1 ? '' : 's'} before saving`, found[keys[0]!]);
      return;
    }
    save.mutate(status);
  };

  // Ctrl/⌘+S saves without changing status.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (form && !save.isPending) submit(form.status);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const leave = async () => {
    if (dirty && await confirm({ title: 'Leave without saving?', description: 'Your changes are kept as a local draft on this device, and you can restore them next time you open this product.', confirmLabel: 'Leave' }) === false) return;
    navigate('/products');
  };

  const approve = useMutation({
    mutationFn: () => catalogApi.approve(id!),
    onSuccess: () => { toast.success('Approved and published'); void product.refetch().then((r) => r.data && (setForm(fromDetail(r.data)), setBaseline(JSON.stringify(fromDetail(r.data))))); void queryClient.invalidateQueries({ queryKey: ['shell-queues'] }); },
    onError: (e) => toast.fromError(e),
  });

  const sectionErrors = useMemo(() => {
    const set = new Set<Section>();
    for (const k of Object.keys(errors)) set.add(sectionOf(k));
    return set;
  }, [errors]);

  if (!isNew && product.isLoading) return <PageSkeleton />;
  if (!isNew && product.error) return <Card><ErrorState message="This product couldn’t be loaded." error={product.error} onRetry={() => void product.refetch()} /></Card>;
  if (!form) return <PageSkeleton />;

  const p = product.data;
  const canEdit = isNew ? hasPermission('products:create') : hasPermission('products:update');
  const live = p?.status === 'active';
  const err = (k: string) => errors[k] ?? null;
  const cover = form.media[0]?.url;
  const primary = form.variants[0];

  const checklist = [
    { label: 'Title and category', done: form.title.trim().length >= 3 && Boolean(form.categoryId) },
    { label: 'At least one image', done: form.media.length > 0 },
    { label: 'Description', done: form.description.trim().length >= 40 },
    { label: 'Price and SKU', done: form.variants.every((v) => v.sku.trim() && v.price.trim()) },
    { label: 'SEO title & description', done: Boolean(form.seoTitle.trim() && form.seoDescription.trim()) },
  ];

  return (
    <div>
      <PageHeader
        back={{ to: '/products', label: 'Products' }}
        title={isNew ? 'New product' : form.title || 'Untitled product'}
        meta={
          <>
            {p && <StatusBadge status={p.status} />}
            {dirty && <span className="rounded-md bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">Unsaved changes</span>}
          </>
        }
        description={
          autosavedAt ? <span className="inline-flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Draft autosaved on this device {formatRelative(autosavedAt)}</span>
            : p ? `Last updated ${formatDateTime(p.updated_at)} · ${p.vendor_name}` : 'Create a listing on behalf of a vendor. Staff can publish directly.'
        }
        actions={
          canEdit ? (
            <>
              <Button variant="ghost" size="sm" className="h-9" onClick={() => void leave()}>Cancel</Button>
              <Button variant="outline" size="sm" className="h-9" onClick={() => setPreviewOpen(true)}><Eye className="h-4 w-4" /> Preview</Button>
              {isNew || !live ? (
                <>
                  <Button variant="outline" size="sm" className="h-9" isLoading={save.isPending && save.variables !== 'active'} disabled={save.isPending} onClick={() => submit(isNew ? 'draft' : form.status)}>
                    <Save className="h-4 w-4" /> {isNew ? 'Save draft' : 'Save'}
                  </Button>
                  {hasPermission('products:update') || isNew ? (
                    <Button size="sm" className="h-9" isLoading={save.isPending && save.variables === 'active'} disabled={save.isPending} onClick={() => submit('active')}>
                      <Send className="h-4 w-4" /> Publish
                    </Button>
                  ) : null}
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" className="h-9" disabled={save.isPending} onClick={() => void confirm({ title: 'Unpublish this product?', description: 'It disappears from the storefront and search until published again.', confirmLabel: 'Unpublish', onConfirm: () => save.mutateAsync('inactive') })}>
                    Unpublish
                  </Button>
                  <Button size="sm" className="h-9" isLoading={save.isPending} disabled={!dirty} onClick={() => submit('active')}><Save className="h-4 w-4" /> Save changes</Button>
                </>
              )}
            </>
          ) : undefined
        }
      />

      {restorable && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm">
          <History className="h-4 w-4 text-warning" />
          <span className="flex-1 text-ink">You have an unsaved draft from {formatRelative(restorable.savedAt)}.</span>
          <Button size="xs" onClick={() => { setForm(restorable.form); setRestorable(null); toast.info('Draft restored', 'Review and save when ready.'); }}>Restore draft</Button>
          <Button size="xs" variant="ghost" onClick={() => { storage.remove(draftKey); setRestorable(null); }}>Discard</Button>
        </div>
      )}

      {p?.status === 'pending_approval' && hasPermission('products:approve') && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-info/30 bg-info-soft px-4 py-3 text-sm">
          <AlertCircle className="h-4 w-4 text-info" />
          <span className="flex-1 text-ink"><b className="font-semibold">{p.vendor_name}</b> submitted this product for review.</span>
          <Button size="xs" isLoading={approve.isPending} onClick={() => approve.mutate()}><CheckCircle2 className="h-3.5 w-3.5" /> Approve & publish</Button>
          <Button size="xs" variant="outline" onClick={() => void confirm({
            title: 'Reject this product?', description: 'The vendor is notified with your reason.', tone: 'danger', confirmLabel: 'Reject',
            reason: { label: 'Reason for the vendor', required: true, minLength: 5 },
            onConfirm: async (reason) => { await catalogApi.reject(id!, reason); toast.success('Product rejected'); const r = await product.refetch(); if (r.data) { const l = fromDetail(r.data); setForm(l); setBaseline(JSON.stringify(l)); } },
          })}><XCircle className="h-3.5 w-3.5" /> Reject</Button>
        </div>
      )}
      {p?.status === 'rejected' && p.rejection_reason && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm">
          <XCircle className="mt-0.5 h-4 w-4 text-danger" />
          <span className="text-ink"><b className="font-semibold">Rejected:</b> {p.rejection_reason}</span>
        </div>
      )}

      <Tabs
        label="Product sections"
        className="mb-5"
        value={section}
        onChange={setSection}
        tabs={SECTIONS.map((s) => ({ key: s.key, label: s.label, error: sectionErrors.has(s.key) }))}
      />

      <fieldset disabled={!canEdit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5" role="tabpanel">
          {section === 'general' && (
            <Section title="General" description="What customers see first.">
              <Field label="Title" required error={err('title')} hint={`/${slugPreview(form.title)}`}>
                <Input value={form.title} maxLength={255} onChange={(e) => update('title', e.target.value)} placeholder="e.g. Linen relaxed-fit shirt" />
              </Field>
              <Field label="Description" error={err('description')} hint={`${form.description.length.toLocaleString('en-IN')} characters`}>
                <Textarea rows={8} value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="Materials, fit, care, what's in the box…" />
              </Field>
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-ink-2">Highlights</p>
                <div className="space-y-2">
                  {form.highlights.map((h, i) => (
                    <div key={i} className="flex gap-2">
                      <Input aria-label={`Highlight ${i + 1}`} value={h} maxLength={300} onChange={(e) => update('highlights', form.highlights.map((x, j) => (j === i ? e.target.value : x)))} />
                      <IconButton label="Remove highlight" tone="danger" onClick={() => update('highlights', form.highlights.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></IconButton>
                    </div>
                  ))}
                  <Button size="xs" variant="outline" disabled={form.highlights.length >= 20} onClick={() => update('highlights', [...form.highlights, ''])}><Plus className="h-3.5 w-3.5" /> Add highlight</Button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Vendor" required={isNew} error={err('vendorId')} hint={isNew ? undefined : 'A product’s vendor can’t be changed after creation.'}>
                  <Select value={form.vendorId} disabled={!isNew} onChange={(e) => update('vendorId', e.target.value)}>
                    <option value="">Choose a vendor…</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.store_name}{v.status !== 'approved' ? ` (${v.status})` : ''}</option>)}
                    {!isNew && p && !vendors.some((v) => v.id === p.vendor_id) && <option value={p.vendor_id}>{p.vendor_name}</option>}
                  </Select>
                </Field>
                <Field label="Category" required error={err('categoryId')}>
                  <Select value={form.categoryId} onChange={(e) => update('categoryId', e.target.value)}>
                    <option value="">Choose a category…</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{'  '.repeat(c.depth)}{c.label}{c.row.is_active ? '' : ' (hidden)'}</option>)}
                  </Select>
                </Field>
                <Field label="Brand">
                  <Select value={form.brandId} onChange={(e) => update('brandId', e.target.value)}>
                    <option value="">No brand</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
                <Field label="Status" hint="Publishing makes it live immediately.">
                  <Select value={form.status} onChange={(e) => update('status', e.target.value as ProductForm['status'])}>
                    <option value="draft">Draft</option>
                    <option value="pending_approval">In review</option>
                    <option value="active">Live</option>
                    <option value="inactive">Unpublished</option>
                  </Select>
                </Field>
              </div>
            </Section>
          )}

          {section === 'media' && <MediaSection form={form} errors={errors} onChange={(media) => update('media', media)} />}

          {section === 'pricing' && (
            <Section title="Pricing" description="Selling price and MRP per variant, in rupees. Discount is computed from MRP.">
              {form.variants.map((v, i) => {
                const price = Number(v.price);
                const mrp = Number(v.mrp || v.price);
                const discount = mrp > 0 && price < mrp ? Math.round(((mrp - price) / mrp) * 100) : 0;
                return (
                  <div key={v.key} className="rounded-xl border border-line p-4">
                    <p className="mb-3 text-[13px] font-medium text-ink">{v.sku || `Variant ${i + 1}`}{v.options.length ? <span className="text-muted"> · {v.options.map((o) => o.value).filter(Boolean).join(' / ')}</span> : null}</p>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Selling price (₹)" required error={err(`variant.${i}.price`)}>
                        <Input type="number" min={0} step="0.01" inputMode="decimal" value={v.price} onChange={(e) => updateVariant(i, { price: e.target.value })} />
                      </Field>
                      <Field label="MRP (₹)" error={err(`variant.${i}.mrp`)} hint="Leave blank to match the price.">
                        <Input type="number" min={0} step="0.01" inputMode="decimal" value={v.mrp} onChange={(e) => updateVariant(i, { mrp: e.target.value })} />
                      </Field>
                      <div>
                        <p className="mb-1.5 text-[13px] font-medium text-ink-2">Discount</p>
                        <p className="flex h-9 items-center rounded-lg bg-surface-2 px-3 text-sm">
                          {discount ? <span className="font-semibold text-success">{discount}% off</span> : <span className="text-muted">No discount</span>}
                          {v.price && <span className="ml-auto text-xs text-muted">{formatCurrency(toMinor(v.price))}</span>}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="GST rate (%)" error={err('taxRate')} hint="Included in the price shown to customers.">
                  <Select value={form.taxRate} onChange={(e) => update('taxRate', e.target.value)}>
                    {['0', '5', '12', '18', '28'].map((r) => <option key={r} value={r}>{r}%</option>)}
                    {!['0', '5', '12', '18', '28'].includes(form.taxRate) && <option value={form.taxRate}>{form.taxRate}%</option>}
                  </Select>
                </Field>
              </div>
            </Section>
          )}

          {section === 'inventory' && (
            <Section title="Inventory" description={isNew ? 'Opening stock goes to the vendor’s first active warehouse.' : 'Live availability across warehouses. Adjust stock from Inventory so every change is logged.'}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-2 pr-4 font-medium">Variant</th><th className="py-2 pr-4 font-medium">SKU</th><th className="py-2 text-right font-medium">{isNew ? 'Opening stock' : 'Available'}</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {form.variants.map((v, i) => (
                      <tr key={v.key}>
                        <td className="py-3 pr-4 text-ink">{v.options.map((o) => o.value).filter(Boolean).join(' / ') || `Variant ${i + 1}`}</td>
                        <td className="py-3 pr-4 font-mono text-xs">{v.sku || '—'}</td>
                        <td className="py-2 text-right">
                          {isNew || v.available === undefined ? (
                            <div className="ml-auto w-28">
                              <Input aria-label={`Opening stock for variant ${i + 1}`} type="number" min={0} step={1} value={v.stock} onChange={(e) => updateVariant(i, { stock: e.target.value })} aria-invalid={Boolean(err(`variant.${i}.stock`))} className="text-right" />
                              {err(`variant.${i}.stock`) && <p className="mt-1 text-xs text-danger">{err(`variant.${i}.stock`)}</p>}
                            </div>
                          ) : (
                            <span className={clsx('tabular font-semibold', v.available <= 0 ? 'text-danger' : v.available <= 5 ? 'text-warning' : 'text-ink')}>{v.available}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!isNew && <Link to={`/inventory?q=${encodeURIComponent(primary?.sku ?? '')}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-sage hover:underline">Adjust or transfer stock in Inventory →</Link>}
              {!isNew && <p className="text-xs text-muted">New variants added here start at zero stock; add units from Inventory after saving.</p>}
            </Section>
          )}

          {section === 'variants' && (
            <Section
              title="Variants"
              description="Each variant has its own SKU, price and stock. Use options like Size or Colour to tell them apart."
              action={<Button size="xs" variant="outline" disabled={form.variants.length >= 100} onClick={() => update('variants', [...form.variants, { ...blankVariant(), options: (form.variants[0]?.options ?? []).map((o) => ({ name: o.name, value: '' })), price: form.variants[0]?.price ?? '', mrp: form.variants[0]?.mrp ?? '' }])}><Plus className="h-3.5 w-3.5" /> Add variant</Button>}
            >
              {form.variants.map((v, i) => (
                <div key={v.key} className="rounded-xl border border-line p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[13px] font-semibold text-ink">Variant {i + 1}{i === 0 && <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-2xs font-medium text-sage">Default</span>}</p>
                    <div className="flex gap-1">
                      <IconButton size="sm" label="Move up" disabled={i === 0} onClick={() => update('variants', move(form.variants, i, i - 1))}><ArrowUp className="h-3.5 w-3.5" /></IconButton>
                      <IconButton size="sm" label="Move down" disabled={i === form.variants.length - 1} onClick={() => update('variants', move(form.variants, i, i + 1))}><ArrowDown className="h-3.5 w-3.5" /></IconButton>
                      <IconButton size="sm" label="Remove variant" tone="danger" disabled={form.variants.length === 1} onClick={() => void confirm({ title: 'Remove this variant?', description: v.id ? 'It stops being sold once you save. Order history is kept.' : undefined, tone: 'danger', confirmLabel: 'Remove' }).then((ok) => ok !== false && update('variants', form.variants.filter((_, j) => j !== i)))}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="SKU" required error={err(`variant.${i}.sku`)} hint={v.id ? 'Keeping the SKU keeps this variant’s stock and history.' : 'Letters and digits only.'}>
                      <Input value={v.sku} maxLength={64} className="font-mono uppercase" onChange={(e) => updateVariant(i, { sku: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
                    </Field>
                    <Field label="Barcode (optional)"><Input value={v.barcode} maxLength={64} onChange={(e) => updateVariant(i, { barcode: e.target.value })} /></Field>
                  </div>
                  <div className="mt-4">
                    <p className="mb-1.5 text-[13px] font-medium text-ink-2">Options</p>
                    {err(`variant.${i}.options`) && <p className="mb-2 text-xs text-danger">{err(`variant.${i}.options`)}</p>}
                    <div className="space-y-2">
                      {v.options.map((o, j) => (
                        <div key={j} className="flex gap-2">
                          <Input aria-label="Option name" placeholder="Size" value={o.name} maxLength={50} onChange={(e) => updateVariant(i, { options: v.options.map((x, k) => (k === j ? { ...x, name: e.target.value } : x)) })} />
                          <Input aria-label="Option value" placeholder="M" value={o.value} maxLength={80} onChange={(e) => updateVariant(i, { options: v.options.map((x, k) => (k === j ? { ...x, value: e.target.value } : x)) })} />
                          <IconButton label="Remove option" tone="danger" onClick={() => updateVariant(i, { options: v.options.filter((_, k) => k !== j) })}><X className="h-4 w-4" /></IconButton>
                        </div>
                      ))}
                      <Button size="xs" variant="ghost" onClick={() => updateVariant(i, { options: [...v.options, { name: '', value: '' }] })}><Plus className="h-3.5 w-3.5" /> Add option</Button>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted">Price {v.price ? formatCurrency(toMinor(v.price)) : '—'} · edit in Pricing. {isNew ? `Opening stock ${v.stock || 0} · edit in Inventory.` : ''}</p>
                </div>
              ))}
            </Section>
          )}

          {section === 'shipping' && (
            <Section title="Shipping & returns" description="Package details help couriers quote accurately.">
              {form.variants.map((v, i) => (
                <div key={v.key} className="rounded-xl border border-line p-4">
                  <p className="mb-3 text-[13px] font-medium text-ink">{v.sku || `Variant ${i + 1}`}</p>
                  <div className="grid gap-3 sm:grid-cols-4">
                    {([['weight', 'Weight (g)'], ['length', 'Length (mm)'], ['width', 'Width (mm)'], ['height', 'Height (mm)']] as const).map(([k, label]) => (
                      <Field key={k} label={label} error={err(`variant.${i}.${k}`)}>
                        <Input type="number" min={1} step={1} value={v[k]} onChange={(e) => updateVariant(i, { [k]: e.target.value })} />
                      </Field>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 rounded-xl border border-line p-4">
                <div><p className="text-sm font-medium text-ink">Cash on delivery</p><p className="text-xs text-muted">Allow customers to pay on delivery.</p></div>
                <Switch label="Cash on delivery" checked={form.isCodAvailable} onChange={(v) => update('isCodAvailable', v)} />
              </div>
              <div className="rounded-xl border border-line p-4">
                <div className="flex items-center justify-between gap-4">
                  <div><p className="text-sm font-medium text-ink">Returnable</p><p className="text-xs text-muted">Customers can request a return after delivery.</p></div>
                  <Switch label="Returnable" checked={form.isReturnable} onChange={(v) => update('isReturnable', v)} />
                </div>
                {form.isReturnable && (
                  <Field label="Return window (days)" className="mt-4 max-w-[200px]" error={err('returnWindowDays')}>
                    <Input type="number" min={0} max={30} value={form.returnWindowDays} onChange={(e) => update('returnWindowDays', e.target.value)} />
                  </Field>
                )}
              </div>
            </Section>
          )}

          {section === 'seo' && (
            <Section title="Search engine listing" description="How this product appears in Google and link previews.">
              <Field label="SEO title" error={err('seoTitle')} hint={`${form.seoTitle.length}/160 · aim for 50–60`}>
                <Input value={form.seoTitle} maxLength={160} placeholder={form.title} onChange={(e) => update('seoTitle', e.target.value)} />
              </Field>
              <Field label="Meta description" error={err('seoDescription')} hint={`${form.seoDescription.length}/320 · aim for 120–160`}>
                <Textarea rows={3} value={form.seoDescription} maxLength={320} onChange={(e) => update('seoDescription', e.target.value)} />
              </Field>
              <div className="rounded-xl border border-line bg-surface-2/50 p-4">
                <p className="text-2xs font-semibold uppercase tracking-wider text-faint">Search preview</p>
                <p className="mt-2 truncate text-xs text-success">sureshot.com › products › {p?.slug ?? slugPreview(form.title)}</p>
                <p className="mt-0.5 truncate text-[17px] text-info">{form.seoTitle || form.title || 'Product title'}</p>
                <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{form.seoDescription || form.description.slice(0, 160) || 'Add a meta description to control this snippet.'}</p>
              </div>
            </Section>
          )}

          {section === 'advanced' && (
            <Section title="Advanced" description="Tax classification and structured specifications.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="HSN code" error={err('hsnCode')}><Input value={form.hsnCode} maxLength={10} onChange={(e) => update('hsnCode', e.target.value)} /></Field>
                <Field label="GST rate (%)" error={err('taxRate')}><Input type="number" min={0} max={40} step="0.01" value={form.taxRate} onChange={(e) => update('taxRate', e.target.value)} /></Field>
              </div>
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-ink-2">Specifications</p>
                <div className="space-y-2">
                  {form.specs.map((s, i) => (
                    <div key={s.key} className="grid grid-cols-[1fr_1fr_1.4fr_auto] gap-2">
                      <Input aria-label="Group" placeholder="General" value={s.group} maxLength={80} onChange={(e) => update('specs', form.specs.map((x, j) => (j === i ? { ...x, group: e.target.value } : x)))} />
                      <Input aria-label="Name" placeholder="Material" value={s.name} maxLength={120} onChange={(e) => update('specs', form.specs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      <Input aria-label="Value" placeholder="100% linen" value={s.value} maxLength={2000} onChange={(e) => update('specs', form.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                      <IconButton label="Remove specification" tone="danger" onClick={() => update('specs', form.specs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></IconButton>
                    </div>
                  ))}
                  <Button size="xs" variant="outline" onClick={() => update('specs', [...form.specs, { key: uid(), group: 'General', name: '', value: '' }])}><Plus className="h-3.5 w-3.5" /> Add specification</Button>
                </div>
              </div>
            </Section>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card>
            <div className="aspect-[4/3] overflow-hidden rounded-t-xl border-b border-line bg-surface-2">
              {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-faint"><ImagePlus className="h-8 w-8" /></div>}
            </div>
            <div className="space-y-1 p-4">
              <p className="line-clamp-2 font-medium text-ink">{form.title || 'Untitled product'}</p>
              <p className="tabular text-sm text-ink">{primary?.price ? formatCurrency(toMinor(primary.price)) : '—'}{primary?.mrp && Number(primary.mrp) > Number(primary.price) && <span className="ml-2 text-xs text-faint line-through">{formatCurrency(toMinor(primary.mrp))}</span>}</p>
              <p className="text-xs text-muted">{form.variants.length} variant{form.variants.length === 1 ? '' : 's'} · {form.media.length} image{form.media.length === 1 ? '' : 's'}</p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Listing quality" description={`${checklist.filter((c) => c.done).length} of ${checklist.length} complete`} />
            <ul className="space-y-2.5 p-4">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-center gap-2.5 text-[13px]">
                  <span className={clsx('flex h-5 w-5 items-center justify-center rounded-full', c.done ? 'bg-success-soft text-success' : 'bg-surface-3 text-faint')}>
                    {c.done ? <Check className="h-3 w-3" strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                  </span>
                  <span className={c.done ? 'text-ink' : 'text-muted'}>{c.label}</span>
                </li>
              ))}
            </ul>
          </Card>
          {p && (
            <Card>
              <dl className="space-y-2 p-4 text-[13px]">
                <div className="flex justify-between"><dt className="text-muted">Units sold</dt><dd className="tabular font-medium">{p.sold_count}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Rating</dt><dd className="tabular font-medium">{p.rating_count ? `★ ${Number(p.rating_avg).toFixed(1)} (${p.rating_count})` : '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Published</dt><dd className="font-medium">{p.published_at ? formatDateTime(p.published_at) : 'Never'}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Vendor</dt><dd><Link className="font-medium hover:underline" to={`/vendors/${p.vendor_id}`}>{p.vendor_name}</Link></dd></div>
              </dl>
            </Card>
          )}
          <p className="px-1 text-2xs text-faint">Tip: press <span className="kbd">Ctrl</span> <span className="kbd">S</span> to save.</p>
        </aside>
      </fieldset>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Storefront preview" description="How the listing reads with your current, unsaved changes." size="lg">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="aspect-square overflow-hidden rounded-xl bg-surface-2">{cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-faint"><ImagePlus className="h-10 w-10" /></div>}</div>
            {form.media.length > 1 && <div className="flex gap-2 overflow-x-auto">{form.media.slice(1, 6).map((m) => <img key={m.key} src={m.url} alt="" className="h-14 w-14 rounded-lg object-cover" />)}</div>}
          </div>
          <div>
            <p className="text-xs text-muted">{brands.find((b) => b.id === form.brandId)?.name ?? vendors.find((v) => v.id === form.vendorId)?.store_name ?? p?.vendor_name}</p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-ink">{form.title || 'Untitled product'}</h3>
            <p className="mt-3 text-2xl font-semibold text-ink">{primary?.price ? formatCurrency(toMinor(primary.price)) : '—'}</p>
            {primary?.mrp && Number(primary.mrp) > Number(primary.price) && <p className="text-sm text-muted"><span className="line-through">{formatCurrency(toMinor(primary.mrp))}</span> <span className="font-medium text-success">{Math.round(((Number(primary.mrp) - Number(primary.price)) / Number(primary.mrp)) * 100)}% off</span></p>}
            {form.variants.length > 1 && <div className="mt-4 flex flex-wrap gap-2">{form.variants.map((v) => <span key={v.key} className="rounded-lg border border-line px-3 py-1.5 text-xs">{v.options.map((o) => o.value).filter(Boolean).join(' / ') || v.sku}</span>)}</div>}
            {form.highlights.filter(Boolean).length > 0 && <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink-2">{form.highlights.filter(Boolean).map((h, i) => <li key={i}>{h}</li>)}</ul>}
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted">{form.description || 'No description yet.'}</p>
            <p className="mt-4 text-xs text-faint">{form.isCodAvailable ? 'Cash on delivery available' : 'Prepaid only'} · {form.isReturnable ? `${form.returnWindowDays}-day returns` : 'Not returnable'}</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

function MediaSection({ form, errors, onChange }: { form: ProductForm; errors: Errors; onChange: (media: ProductForm['media']) => void }) {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const addUrl = () => {
    const value = url.trim();
    try {
      const parsed = new URL(value);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error();
    } catch {
      toast.error('Enter a full image URL starting with https://');
      return;
    }
    onChange([...form.media, { key: uid(), url: value, alt: '' }]);
    setUrl('');
  };

  const upload = async (files: FileList | File[]) => {
    const images = [...files].filter((f) => f.type.startsWith('image/'));
    if (!images.length) { toast.error('Only image files can be uploaded.'); return; }
    setUploading((n) => n + images.length);
    const added: ProductForm['media'] = [];
    for (const file of images) {
      try {
        const presign = await apiPost<{ uploadUrl: string; publicUrl: string }>('/media/presign', { contentType: file.type, sizeBytes: file.size, purpose: 'product' });
        const res = await fetch(presign.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
        if (!res.ok) throw new Error(`Storage responded ${res.status}`);
        added.push({ key: uid(), url: presign.publicUrl, alt: file.name.replace(/\.[^.]+$/, '') });
      } catch (e) {
        console.error('[admin] image upload failed', e);
        toast.error(`Couldn’t upload ${file.name}`, e instanceof ApiException ? e.message : 'Media storage isn’t reachable. Paste a hosted image URL instead.');
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (added.length) {
      onChange([...form.media, ...added]);
      toast.success(`${added.length} image${added.length === 1 ? '' : 's'} uploaded`);
    }
  };

  const onDropItem = (e: DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    onChange(move(form.media, dragIndex, index));
    setDragIndex(null);
  };

  return (
    <Section title="Media" description="The first image is the cover. Drag to reorder, or use the arrow buttons.">
      {errors.media && <p className="text-sm text-danger">{errors.media}</p>}
      <div
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropActive(true); } }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setDropActive(false); void upload(e.dataTransfer.files); } }}
        className={clsx('flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors', dropActive ? 'border-sage bg-brand-soft' : 'border-line bg-surface-2/40')}
      >
        {uploading > 0 ? <Loader2 className="h-6 w-6 animate-spin text-sage" /> : <Upload className="h-6 w-6 text-faint" />}
        <p className="text-sm font-medium text-ink">{uploading ? `Uploading ${uploading}…` : 'Drop images here'}</p>
        <p className="text-xs text-muted">JPG, PNG, WebP or AVIF up to 10 MB</p>
        <Button size="xs" variant="outline" onClick={() => fileInput.current?.click()}>Choose files</Button>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple hidden onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = ''; }} />
      </div>
      <div className="flex gap-2">
        <Input aria-label="Image URL" placeholder="https://… paste an image URL" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }} />
        <Button variant="outline" onClick={addUrl} disabled={!url.trim()}><Plus className="h-4 w-4" /> Add</Button>
      </div>
      {form.media.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Product images">
          {form.media.map((m, i) => (
            <li
              key={m.key}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropItem(e, i)}
              onDragEnd={() => setDragIndex(null)}
              className={clsx('group relative overflow-hidden rounded-xl border bg-surface', dragIndex === i ? 'border-sage opacity-50' : 'border-line', errors[`media.${i}`] && 'border-danger')}
            >
              <div className="aspect-square bg-surface-2"><img src={m.url} alt={m.alt} className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.2'; }} /></div>
              {i === 0 && <span className="absolute left-2 top-2 rounded-md bg-ink/80 px-1.5 py-0.5 text-2xs font-medium text-canvas">Cover</span>}
              <span className="absolute right-2 top-2 cursor-grab rounded-md bg-surface/90 p-1 text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden><GripVertical className="h-3.5 w-3.5" /></span>
              <div className="space-y-1.5 p-2">
                <Input aria-label={`Alt text for image ${i + 1}`} placeholder="Alt text" value={m.alt} maxLength={160} className="h-7 text-xs" onChange={(e) => onChange(form.media.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} />
                <div className="flex justify-between">
                  <div className="flex">
                    <IconButton size="sm" label="Move earlier" disabled={i === 0} onClick={() => onChange(move(form.media, i, i - 1))}><ArrowUp className="h-3.5 w-3.5 -rotate-90" /></IconButton>
                    <IconButton size="sm" label="Move later" disabled={i === form.media.length - 1} onClick={() => onChange(move(form.media, i, i + 1))}><ArrowDown className="h-3.5 w-3.5 -rotate-90" /></IconButton>
                  </div>
                  <IconButton size="sm" tone="danger" label="Remove image" onClick={() => onChange(form.media.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                </div>
                {errors[`media.${i}`] && <p className="text-2xs text-danger">{errors[`media.${i}`]}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">Uploads go to the configured media storage. Pasted URLs must stay publicly reachable.</p>
    </Section>
  );
}
