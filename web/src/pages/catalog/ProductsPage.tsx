import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Archive, CheckCircle2, Download, Eye, EyeOff, FilePen, FolderInput, MoreHorizontal, Package, Pencil, Plus, SlidersHorizontal, XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { catalogApi, type BulkAction, type ProductRow } from '../../api/catalog';
import { useAuth } from '../../auth/AuthContext';
import { StatusBadge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { DataTable, type Column, type SortState } from '../../components/ui/DataTable';
import { Dropdown, DropdownItem, DropdownSeparator } from '../../components/ui/Dropdown';
import { Field, Input, Select } from '../../components/ui/Input';
import { Drawer, Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { paramFromSort, sortFromParam, useListState, usePagedQuery } from '../../hooks/useListState';
import { apiGetPage } from '../../lib/apiClient';
import { downloadCsv, type CsvColumn } from '../../lib/csv';
import { formatCurrency, formatDate, formatNumber, toMinor } from '../../lib/format';
import { useCatalogOptions } from './catalogOptions';

const SORTS: Record<string, SortState> = {
  title: { key: 'title', dir: 'asc' },
  price_desc: { key: 'price', dir: 'desc' },
  price_asc: { key: 'price', dir: 'asc' },
  stock_asc: { key: 'stock', dir: 'asc' },
  rating: { key: 'rating', dir: 'desc' },
  updated: { key: 'updated', dir: 'desc' },
  newest: { key: 'created', dir: 'desc' },
};

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'active', label: 'Live' },
  { key: 'pending_approval', label: 'In review' },
  { key: 'draft', label: 'Drafts' },
  { key: 'inactive', label: 'Unpublished' },
  { key: 'rejected', label: 'Rejected' },
];

const DEFAULTS = { status: '', categoryId: '', brandId: '', vendorId: '', stock: '', priceMin: '', priceMax: '', from: '' };

const CSV_COLUMNS: CsvColumn<ProductRow>[] = [
  { header: 'Product', value: (p) => p.title },
  { header: 'SKU', value: (p) => p.sku },
  { header: 'Vendor', value: (p) => p.vendor_name },
  { header: 'Category', value: (p) => p.category_name },
  { header: 'Brand', value: (p) => p.brand_name },
  { header: 'Price (INR)', value: (p) => (p.price_minor == null ? '' : (p.price_minor / 100).toFixed(2)) },
  { header: 'MRP (INR)', value: (p) => (p.mrp_minor == null ? '' : (p.mrp_minor / 100).toFixed(2)) },
  { header: 'Available stock', value: (p) => p.stock },
  { header: 'Status', value: (p) => p.status },
  { header: 'Rating', value: (p) => p.rating_avg },
  { header: 'Updated', value: (p) => p.updated_at },
];

export function ProductsPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useListState({ defaults: DEFAULTS, defaultSort: 'newest', pageSizeKey: 'products' });
  const { categories, brands, vendors } = useCatalogOptions();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryTarget, setCategoryTarget] = useState<string[] | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [exporting, setExporting] = useState(false);

  const f = list.filters;
  const params = {
    page: list.page,
    limit: list.pageSize,
    q: list.q,
    sort: list.sortParam,
    status: f.status,
    categoryId: f.categoryId,
    brandId: f.brandId,
    vendorId: f.vendorId,
    stock: f.stock,
    priceMin: f.priceMin ? toMinor(f.priceMin) : '',
    priceMax: f.priceMax ? toMinor(f.priceMax) : '',
    from: f.from ? new Date(`${f.from}T00:00:00Z`).toISOString() : '',
  };
  const products = usePagedQuery<ProductRow>(['admin-products'], '/admin/products', params);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    void queryClient.invalidateQueries({ queryKey: ['shell-queues'] });
  };

  const bulk = useMutation({
    mutationFn: ({ ids, action, categoryId }: { ids: string[]; action: BulkAction; categoryId?: string }) => catalogApi.bulk(ids, action, categoryId),
    onSuccess: (result) => {
      if (result.failed) toast.warning(`${result.updated} updated, ${result.failed} skipped`, result.results.find((r) => !r.ok)?.message);
      else toast.success(`${result.updated} product${result.updated === 1 ? '' : 's'} updated`);
      setSelected(new Set());
      invalidate();
    },
    onError: (e) => toast.fromError(e, 'The bulk update failed.'),
  });

  const runBulk = async (ids: string[], action: BulkAction) => {
    const labels: Record<string, { title: string; description: string; tone?: 'danger'; confirm: string }> = {
      publish: { title: `Publish ${ids.length} product${ids.length === 1 ? '' : 's'}?`, description: 'They go live on the storefront immediately and appear in search.', confirm: 'Publish' },
      unpublish: { title: `Unpublish ${ids.length} product${ids.length === 1 ? '' : 's'}?`, description: 'They disappear from the storefront and search. Existing orders are unaffected.', confirm: 'Unpublish' },
      draft: { title: `Move ${ids.length} to draft?`, description: 'Drafts are hidden from customers until published again.', confirm: 'Move to draft' },
      archive: { title: `Archive ${ids.length} product${ids.length === 1 ? '' : 's'}?`, description: 'Archived products are removed from the catalogue and can’t be restored from the admin.', tone: 'danger', confirm: 'Archive' },
    };
    const l = labels[action]!;
    await confirm({ title: l.title, description: l.description, tone: l.tone, confirmLabel: l.confirm, onConfirm: () => bulk.mutateAsync({ ids, action }) });
  };

  const exportRows = async (onlySelected: string[] | null) => {
    setExporting(true);
    try {
      let rows: ProductRow[];
      if (onlySelected) {
        rows = products.items.filter((p) => onlySelected.includes(p.id));
      } else {
        rows = [];
        for (let page = 1; page <= 20; page++) {
          const res = await apiGetPage<ProductRow>('/admin/products', { ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '')), page, limit: 100 });
          rows.push(...res.items);
          if (page >= res.totalPages) break;
        }
      }
      downloadCsv(`sureshot-products-${new Date().toISOString().slice(0, 10)}.csv`, rows, CSV_COLUMNS);
      toast.success(`Exported ${rows.length} product${rows.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast.fromError(e, 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const approve = useMutation({
    mutationFn: (id: string) => catalogApi.approve(id),
    onSuccess: () => { toast.success('Product approved and published'); invalidate(); },
    onError: (e) => toast.fromError(e),
  });

  const columns: Column<ProductRow>[] = [
    {
      id: 'product', header: 'Product', sortKey: 'title', mobile: 'primary', hideable: false,
      cell: (p) => (
        <div className="flex min-w-[220px] items-center gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2">
            {p.image_url ? <img src={p.image_url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Package className="m-2.5 h-5 w-5 text-faint" />}
          </div>
          <div className="min-w-0">
            <Link to={`/products/${p.id}`} onClick={(e) => e.stopPropagation()} className="line-clamp-1 font-medium text-ink hover:underline">{p.title}</Link>
            <p className="text-xs text-faint">{p.variant_count} variant{p.variant_count === 1 ? '' : 's'}{p.brand_name ? ` · ${p.brand_name}` : ''}</p>
          </div>
        </div>
      ),
    },
    { id: 'sku', header: 'SKU', cell: (p) => <span className="font-mono text-xs">{p.sku ?? '—'}</span> },
    { id: 'vendor', header: 'Vendor', cell: (p) => <Link to={`/vendors/${p.vendor_id}`} onClick={(e) => e.stopPropagation()} title={p.vendor_name} className="block max-w-[150px] truncate whitespace-nowrap hover:text-ink hover:underline">{p.vendor_name}</Link> },
    { id: 'category', header: 'Category', cell: (p) => <span title={p.category_name ?? undefined} className="block max-w-[140px] truncate whitespace-nowrap">{p.category_name ?? '—'}</span> },
    {
      id: 'price', header: 'Price', sortKey: 'price', align: 'right',
      cell: (p) => p.price_minor == null ? '—' : (
        <div className="tabular">
          <span className="font-medium text-ink">{formatCurrency(p.price_minor)}</span>
          {p.mrp_minor && p.mrp_minor > p.price_minor && <span className="block text-2xs text-faint line-through">{formatCurrency(p.mrp_minor)}</span>}
        </div>
      ),
    },
    {
      id: 'stock', header: 'Stock', sortKey: 'stock', align: 'right',
      cell: (p) => <span className={`tabular font-medium ${p.stock <= 0 ? 'text-danger' : p.stock <= 5 ? 'text-warning' : 'text-ink-2'}`}>{p.stock <= 0 ? 'Out' : formatNumber(p.stock)}</span>,
    },
    { id: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
    { id: 'rating', header: 'Rating', sortKey: 'rating', align: 'right', cell: (p) => (p.rating_count ? <span className="tabular">★ {Number(p.rating_avg).toFixed(1)} <span className="text-faint">({p.rating_count})</span></span> : <span className="text-faint">—</span>) },
    { id: 'updated', header: 'Updated', sortKey: 'updated', cell: (p) => <span className="whitespace-nowrap text-xs">{formatDate(p.updated_at)}</span> },
  ];

  const canUpdate = hasPermission('products:update');

  const rowActions = (p: ProductRow) => (
    <Dropdown align="end" trigger={(props) => <IconButton {...props} size="sm" label={`Actions for ${p.title}`}><MoreHorizontal className="h-4 w-4" /></IconButton>}>
      <DropdownItem icon={Pencil} onSelect={() => navigate(`/products/${p.id}`)}>Edit product</DropdownItem>
      {p.status === 'pending_approval' && hasPermission('products:approve') && (
        <>
          <DropdownItem icon={CheckCircle2} onSelect={() => approve.mutate(p.id)}>Approve & publish</DropdownItem>
          <DropdownItem icon={XCircle} onSelect={() => void confirm({
            title: `Reject “${p.title}”?`,
            description: 'The vendor is notified with your reason and can resubmit.',
            tone: 'danger',
            confirmLabel: 'Reject',
            reason: { label: 'Reason for the vendor', required: true, minLength: 5 },
            onConfirm: async (reason) => { await catalogApi.reject(p.id, reason); toast.success('Product rejected'); invalidate(); },
          })}>Reject…</DropdownItem>
        </>
      )}
      {canUpdate && p.status !== 'active' && p.status !== 'pending_approval' && <DropdownItem icon={Eye} onSelect={() => void runBulk([p.id], 'publish')}>Publish</DropdownItem>}
      {canUpdate && p.status === 'active' && <DropdownItem icon={EyeOff} onSelect={() => void runBulk([p.id], 'unpublish')}>Unpublish</DropdownItem>}
      {canUpdate && <DropdownItem icon={FolderInput} onSelect={() => { setNewCategory(p.category_id); setCategoryTarget([p.id]); }}>Change category</DropdownItem>}
      {hasPermission('products:delete') && (
        <>
          <DropdownSeparator />
          <DropdownItem icon={Archive} tone="danger" onSelect={() => void runBulk([p.id], 'archive')}>Archive</DropdownItem>
        </>
      )}
    </Dropdown>
  );

  const filterCount = list.activeFilterCount - (f.status ? 1 : 0);

  return (
    <div>
      <PageHeader
        title="Products"
        description="Every listing across your vendors — merchandising, stock and approval in one place."
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9" isLoading={exporting} onClick={() => void exportRows(null)}><Download className="h-4 w-4" /> Export</Button>
            {hasPermission('products:create') && <Button size="sm" className="h-9" onClick={() => navigate('/products/new')}><Plus className="h-4 w-4" /> Add product</Button>}
          </>
        }
      />

      <Tabs
        label="Product status"
        className="mb-4"
        value={f.status}
        onChange={(v) => list.setFilter('status', v)}
        tabs={STATUS_TABS.map((t) => ({ key: t.key, label: t.label }))}
      />

      <DataTable
        caption="Products"
        storageKey="products"
        columns={columns}
        rows={products.items}
        rowKey={(p) => p.id}
        loading={products.isLoading}
        fetching={products.isFetching}
        error={products.error}
        onRetry={() => void products.refetch()}
        onRowClick={(p) => navigate(`/products/${p.id}`)}
        rowActions={rowActions}
        selectable={canUpdate}
        selected={selected}
        onSelectedChange={setSelected}
        sort={sortFromParam(list.sortParam, SORTS)}
        onSortChange={(s) => { const p = paramFromSort(s, SORTS) ?? (s.key === 'price' ? 'price_desc' : 'newest'); list.setSortParam(p); }}
        pagination={{ page: list.page, totalPages: products.totalPages, total: products.total, pageSize: list.pageSize, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
        empty={{
          icon: Package,
          title: list.q || list.activeFilterCount ? 'No products match these filters' : 'No products yet',
          message: list.q || list.activeFilterCount ? 'Try removing a filter or searching for a SKU.' : 'Add your first product or approve one submitted by a vendor.',
          action: list.q || list.activeFilterCount ? <Button size="sm" variant="outline" onClick={list.reset}>Clear filters</Button> : undefined,
        }}
        toolbar={
          <>
            <SearchInput value={list.q} onChange={list.setQuery} placeholder="Search title or SKU…" />
            <Select aria-label="Category" value={f.categoryId} onChange={(e) => list.setFilter('categoryId', e.target.value)} className="hidden w-44 lg:block">
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{'  '.repeat(c.depth)}{c.label}</option>)}
            </Select>
            <Select aria-label="Stock" value={f.stock} onChange={(e) => list.setFilter('stock', e.target.value)} className="hidden w-36 md:block">
              <option value="">Any stock</option>
              <option value="in">In stock</option>
              <option value="low">Low stock (≤5)</option>
              <option value="out">Out of stock</option>
            </Select>
            <Button variant="outline" size="sm" className="h-9" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" /> Filters{filterCount > 0 && <span className="tabular rounded bg-brand px-1.5 text-2xs text-brand-ink">{filterCount}</span>}
            </Button>
          </>
        }
        bulkActions={(ids) => (
          <>
            {hasPermission('products:update') && <Button size="xs" variant="outline" onClick={() => void runBulk(ids, 'publish')}><Eye className="h-3.5 w-3.5" /> Publish</Button>}
            {hasPermission('products:update') && <Button size="xs" variant="outline" onClick={() => void runBulk(ids, 'unpublish')}><EyeOff className="h-3.5 w-3.5" /> Unpublish</Button>}
            {hasPermission('products:update') && <Button size="xs" variant="outline" onClick={() => void runBulk(ids, 'draft')}><FilePen className="h-3.5 w-3.5" /> Draft</Button>}
            {hasPermission('products:update') && <Button size="xs" variant="outline" onClick={() => { setNewCategory(''); setCategoryTarget(ids); }}><FolderInput className="h-3.5 w-3.5" /> Category</Button>}
            <Button size="xs" variant="outline" onClick={() => void exportRows(ids)}><Download className="h-3.5 w-3.5" /> Export</Button>
            {hasPermission('products:delete') && <Button size="xs" variant="danger" onClick={() => void runBulk(ids, 'archive')}><Archive className="h-3.5 w-3.5" /> Archive</Button>}
          </>
        )}
      />

      <Drawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter products"
        width="max-w-md"
        footer={<><Button variant="ghost" onClick={() => { list.reset(); setFiltersOpen(false); }}>Reset all</Button><Button onClick={() => setFiltersOpen(false)}>Show results</Button></>}
      >
        <div className="space-y-4">
          <Field label="Category">
            <Select value={f.categoryId} onChange={(e) => list.setFilter('categoryId', e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{'  '.repeat(c.depth)}{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Brand">
            <Select value={f.brandId} onChange={(e) => list.setFilter('brandId', e.target.value)}>
              <option value="">All brands</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Vendor">
            <Select value={f.vendorId} onChange={(e) => list.setFilter('vendorId', e.target.value)}>
              <option value="">All vendors</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.store_name}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={(e) => list.setFilter('status', e.target.value)}>
              {STATUS_TABS.map((s) => <option key={s.key} value={s.key}>{s.key ? s.label : 'Any status'}</option>)}
            </Select>
          </Field>
          <Field label="Stock">
            <Select value={f.stock} onChange={(e) => list.setFilter('stock', e.target.value)}>
              <option value="">Any stock</option><option value="in">In stock</option><option value="low">Low stock (≤5)</option><option value="out">Out of stock</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min price (₹)"><Input type="number" min={0} inputMode="decimal" value={f.priceMin} onChange={(e) => list.setFilter('priceMin', e.target.value)} /></Field>
            <Field label="Max price (₹)"><Input type="number" min={0} inputMode="decimal" value={f.priceMax} onChange={(e) => list.setFilter('priceMax', e.target.value)} /></Field>
          </div>
          <Field label="Created on or after"><Input type="date" value={f.from} onChange={(e) => list.setFilter('from', e.target.value)} /></Field>
        </div>
      </Drawer>

      <Modal
        open={Boolean(categoryTarget)}
        onClose={() => setCategoryTarget(null)}
        title={`Move ${categoryTarget?.length ?? 0} product${categoryTarget?.length === 1 ? '' : 's'}`}
        size="sm"
        footer={<><Button variant="outline" onClick={() => setCategoryTarget(null)}>Cancel</Button><Button disabled={!newCategory} isLoading={bulk.isPending} onClick={() => categoryTarget && bulk.mutate({ ids: categoryTarget, action: 'category', categoryId: newCategory }, { onSuccess: () => setCategoryTarget(null) })}>Move</Button></>}
      >
        <Field label="New category" required>
          <Select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
            <option value="">Choose a category…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{'  '.repeat(c.depth)}{c.label}</option>)}
          </Select>
        </Field>
      </Modal>
    </div>
  );
}
