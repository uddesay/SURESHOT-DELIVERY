import { Download, ShoppingBag, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { OrderRow } from '../../api/commerce';
import { StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { DataTable, type Column, type SortState } from '../../components/ui/DataTable';
import { Field, Input, Select } from '../../components/ui/Input';
import { Drawer } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { paramFromSort, sortFromParam, useListState, usePagedQuery } from '../../hooks/useListState';
import { apiGetPage } from '../../lib/apiClient';
import { downloadCsv, type CsvColumn } from '../../lib/csv';
import { formatCurrency, formatDateTime } from '../../lib/format';
import { useCatalogOptions } from '../catalog/catalogOptions';
import { OrderRowActions } from './OrderRowActions';

const TABS = [
  { key: '', label: 'All' },
  { key: 'confirmed,processing,packed', label: 'To fulfil' },
  { key: 'shipped,out_for_delivery', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'pending_payment,payment_failed', label: 'Unpaid' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'return_requested,returned,refunded', label: 'Returns & refunds' },
];

const SORTS: Record<string, SortState> = {
  newest: { key: 'date', dir: 'desc' },
  oldest: { key: 'date', dir: 'asc' },
  total_desc: { key: 'total', dir: 'desc' },
  total_asc: { key: 'total', dir: 'asc' },
};

const DEFAULTS = { status: '', paymentMethod: '', vendorId: '', from: '', to: '' };

const CSV: CsvColumn<OrderRow>[] = [
  { header: 'Order', value: (o) => o.order_number },
  { header: 'Placed (UTC)', value: (o) => o.created_at },
  { header: 'Customer', value: (o) => o.customer_name },
  { header: 'Email', value: (o) => o.customer_email },
  { header: 'Vendors', value: (o) => o.vendor_names },
  { header: 'Items', value: (o) => o.item_count },
  { header: 'Total (INR)', value: (o) => (o.total_minor / 100).toFixed(2) },
  { header: 'Payment method', value: (o) => o.payment_method },
  { header: 'Payment status', value: (o) => o.payment_status },
  { header: 'Status', value: (o) => o.status },
];

export function OrdersPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const list = useListState({ defaults: DEFAULTS, defaultSort: 'newest', pageSizeKey: 'orders' });
  const { vendors } = useCatalogOptions();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const f = list.filters;

  const params = {
    page: list.page,
    limit: list.pageSize,
    q: list.q,
    sort: list.sortParam,
    status: f.status,
    paymentMethod: f.paymentMethod,
    vendorId: f.vendorId,
    from: f.from ? new Date(`${f.from}T00:00:00`).toISOString() : '',
    to: f.to ? new Date(new Date(`${f.to}T00:00:00`).getTime() + 86400000).toISOString() : '',
  };
  const orders = usePagedQuery<OrderRow>(['admin-orders'], '/admin/orders', params);

  const exportCsv = async (ids: string[] | null) => {
    setExporting(true);
    try {
      let rows: OrderRow[] = [];
      if (ids) rows = orders.items.filter((o) => ids.includes(o.id));
      else {
        for (let page = 1; page <= 20; page++) {
          const res = await apiGetPage<OrderRow>('/admin/orders', { ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '')), page, limit: 100 });
          rows.push(...res.items);
          if (page >= res.totalPages) break;
        }
      }
      downloadCsv(`sureshot-orders-${new Date().toISOString().slice(0, 10)}.csv`, rows, CSV);
      toast.success(`Exported ${rows.length} order${rows.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast.fromError(e, 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<OrderRow>[] = [
    { id: 'order', header: 'Order', mobile: 'primary', hideable: false, sortKey: 'date', cell: (o) => <div><Link to={`/orders/${o.id}`} onClick={(e) => e.stopPropagation()} className="link font-mono text-[13px]">{o.order_number}</Link><p className="whitespace-nowrap text-xs text-faint">{formatDateTime(o.created_at)}</p></div> },
    { id: 'customer', header: 'Customer', cell: (o) => <div className="min-w-0 max-w-[200px]"><p className="truncate text-ink">{o.customer_name || 'Customer'}</p><p className="truncate text-xs text-faint">{o.customer_email}</p></div> },
    { id: 'vendor', header: 'Vendor', cell: (o) => <span className="block max-w-[170px] truncate">{o.vendor_names || '—'}</span> },
    { id: 'items', header: 'Items', align: 'right', cell: (o) => <span className="tabular">{o.item_count}</span> },
    { id: 'total', header: 'Amount', align: 'right', sortKey: 'total', cell: (o) => <span className="tabular font-medium text-ink">{formatCurrency(o.total_minor)}</span> },
    { id: 'payment', header: 'Payment', cell: (o) => <div className="text-xs"><p className="font-medium uppercase text-ink-2">{o.payment_method}</p>{o.payment_status && <p className="text-faint">{o.payment_status}</p>}</div> },
    { id: 'status', header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
  ];

  const filterCount = list.activeFilterCount - (f.status ? 1 : 0);

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Every order across the marketplace, from checkout to doorstep."
        actions={<Button variant="outline" size="sm" className="h-9" isLoading={exporting} onClick={() => void exportCsv(null)}><Download className="h-4 w-4" /> Export</Button>}
      />
      <Tabs label="Order status" className="mb-4" value={f.status} onChange={(v) => list.setFilter('status', v)} tabs={TABS} />
      <DataTable
        caption="Orders"
        storageKey="orders"
        columns={columns}
        rows={orders.items}
        rowKey={(o) => o.id}
        loading={orders.isLoading}
        fetching={orders.isFetching}
        error={orders.error}
        onRetry={() => void orders.refetch()}
        onRowClick={(o) => navigate(`/orders/${o.id}`)}
        rowActions={(o) => <OrderRowActions order={o} />}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        bulkActions={(ids) => <Button size="xs" variant="outline" onClick={() => void exportCsv(ids)}><Download className="h-3.5 w-3.5" /> Export selected</Button>}
        sort={sortFromParam(list.sortParam, SORTS)}
        onSortChange={(s) => list.setSortParam(paramFromSort(s, SORTS) ?? 'newest')}
        pagination={{ page: list.page, totalPages: orders.totalPages, total: orders.total, pageSize: list.pageSize, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
        empty={{
          icon: ShoppingBag,
          title: list.q || list.activeFilterCount ? 'No orders match' : 'No orders yet',
          message: list.q || list.activeFilterCount ? 'Try a different status, date or search term.' : 'Orders appear here as soon as customers check out.',
          action: list.q || list.activeFilterCount ? <Button size="sm" variant="outline" onClick={list.reset}>Clear filters</Button> : undefined,
        }}
        toolbar={
          <>
            <SearchInput value={list.q} onChange={list.setQuery} placeholder="Order number, name or email…" />
            <Select aria-label="Payment method" value={f.paymentMethod} onChange={(e) => list.setFilter('paymentMethod', e.target.value)} className="hidden w-40 md:block">
              <option value="">All payments</option><option value="cod">Cash on delivery</option><option value="razorpay">Razorpay</option><option value="stripe">Stripe</option><option value="wallet">Wallet</option>
            </Select>
            <Button variant="outline" size="sm" className="h-9" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" /> Filters{filterCount > 0 && <span className="tabular rounded bg-brand px-1.5 text-2xs text-brand-ink">{filterCount}</span>}
            </Button>
          </>
        }
      />
      <Drawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter orders"
        width="max-w-md"
        footer={<><Button variant="ghost" onClick={() => { list.reset(); setFiltersOpen(false); }}>Reset all</Button><Button onClick={() => setFiltersOpen(false)}>Show results</Button></>}
      >
        <div className="space-y-4">
          <Field label="Status">
            <Select value={f.status} onChange={(e) => list.setFilter('status', e.target.value)}>
              {TABS.map((t) => <option key={t.key} value={t.key}>{t.key ? t.label : 'Any status'}</option>)}
            </Select>
          </Field>
          <Field label="Payment method">
            <Select value={f.paymentMethod} onChange={(e) => list.setFilter('paymentMethod', e.target.value)}>
              <option value="">All payments</option><option value="cod">Cash on delivery</option><option value="razorpay">Razorpay</option><option value="stripe">Stripe</option><option value="wallet">Wallet</option>
            </Select>
          </Field>
          <Field label="Vendor">
            <Select value={f.vendorId} onChange={(e) => list.setFilter('vendorId', e.target.value)}>
              <option value="">All vendors</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.store_name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Placed from"><Input type="date" value={f.from} max={f.to || undefined} onChange={(e) => list.setFilter('from', e.target.value)} /></Field>
            <Field label="Placed to"><Input type="date" value={f.to} min={f.from || undefined} onChange={(e) => list.setFilter('to', e.target.value)} /></Field>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
