import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, ArrowLeftRight, Boxes, History, MoreHorizontal, PackageX, SlidersHorizontal, Warehouse as WarehouseIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { inventoryApi, stockState, type StockRow } from '../../api/inventory';
import { StatusBadge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { Dropdown, DropdownItem } from '../../components/ui/Dropdown';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Field, Input, Select } from '../../components/ui/Input';
import { Drawer, Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { useListState, usePagedQuery } from '../../hooks/useListState';
import { formatCompactCurrency, formatDateTime, formatNumber, humanize } from '../../lib/format';

function Tile({ label, value, icon: Icon, tone, loading, onClick, active }: { label: string; value: string; icon: typeof Boxes; tone: string; loading: boolean; onClick?: () => void; active?: boolean }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} aria-pressed={onClick ? active : undefined} className={clsx('card flex items-center gap-4 p-4 text-left transition-colors', onClick && 'hover:border-line-strong', active && 'border-sage ring-2 ring-sage/15')}>
      <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tone)}><Icon className="h-5 w-5" aria-hidden /></span>
      <span>
        <span className="block text-[13px] text-muted">{label}</span>
        {loading ? <Skeleton className="mt-1 h-6 w-16" /> : <span className="tabular block font-display text-xl font-semibold text-ink">{value}</span>}
      </span>
    </Tag>
  );
}

export function InventoryPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useListState({ defaults: { stock: '', warehouseId: '' }, pageSizeKey: 'inventory' });
  const summary = useQuery({ queryKey: ['inventory-summary'], queryFn: inventoryApi.summary });
  const warehouses = useQuery({ queryKey: ['inventory-warehouses'], queryFn: () => inventoryApi.warehouses() });
  const stock = usePagedQuery<StockRow>(['admin-inventory'], '/admin/inventory', { page: list.page, limit: list.pageSize, q: list.q, ...list.filters });

  const [adjusting, setAdjusting] = useState<StockRow | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [transferring, setTransferring] = useState<StockRow | null>(null);
  const [toWarehouse, setToWarehouse] = useState('');
  const [qty, setQty] = useState('');
  const [history, setHistory] = useState<StockRow | null>(null);
  const [historyPage, setHistoryPage] = useState(1);

  const movements = useQuery({
    queryKey: ['inventory-movements', history?.variant_id, historyPage],
    queryFn: () => inventoryApi.movements(history!.variant_id, historyPage),
    enabled: Boolean(history),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-inventory'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
    void queryClient.invalidateQueries({ queryKey: ['shell-queues'] });
  };

  const adjust = useMutation({
    mutationFn: () => inventoryApi.adjust(adjusting!.variant_id, { warehouseId: adjusting!.warehouse_id, delta: Number(delta), reason: reason.trim() }),
    onSuccess: () => { toast.success('Stock adjusted', `${adjusting!.sku}: ${Number(delta) > 0 ? '+' : ''}${delta} units`); setAdjusting(null); invalidate(); },
    onError: (e) => toast.fromError(e, 'Stock couldn’t be adjusted.'),
  });

  const transfer = useMutation({
    mutationFn: () => inventoryApi.transfer(transferring!.variant_id, { fromWarehouseId: transferring!.warehouse_id, toWarehouseId: toWarehouse, quantity: Number(qty), reason: 'Admin transfer' }),
    onSuccess: () => { toast.success('Stock transferred', `${qty} units of ${transferring!.sku}`); setTransferring(null); invalidate(); },
    onError: (e) => toast.fromError(e, 'Transfer failed.'),
  });

  const deltaNum = Number(delta);
  const adjustInvalid = !delta || !Number.isInteger(deltaNum) || deltaNum === 0 || reason.trim().length < 3
    || (adjusting ? adjusting.quantity + deltaNum < adjusting.reserved : true);
  const vendorWarehouses = (warehouses.data ?? []).filter((w) => transferring && w.vendor_id === transferring.vendor_id && w.id !== transferring.warehouse_id);
  const qtyNum = Number(qty);
  const transferInvalid = !toWarehouse || !Number.isInteger(qtyNum) || qtyNum < 1 || (transferring ? qtyNum > transferring.available : true);

  const s = summary.data;
  return (
    <div>
      <PageHeader title="Inventory" description="Stock across every vendor warehouse. Every change is written to the movement history." />

      {summary.error ? (
        <div className="card mb-5"><ErrorState compact message="Stock summary couldn’t load." error={summary.error} onRetry={() => void summary.refetch()} /></div>
      ) : (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile label="Units on hand" value={s ? formatNumber(s.totalUnits) : '—'} icon={Boxes} tone="bg-brand-soft text-sage" loading={!s} onClick={() => list.setFilter('stock', '')} active={!list.filters.stock} />
          <Tile label="Low stock variants" value={s ? formatNumber(s.lowStock) : '—'} icon={AlertTriangle} tone="bg-warning-soft text-warning" loading={!s} onClick={() => list.setFilter('stock', 'low')} active={list.filters.stock === 'low'} />
          <Tile label="Out of stock" value={s ? formatNumber(s.outOfStock) : '—'} icon={PackageX} tone="bg-danger-soft text-danger" loading={!s} onClick={() => list.setFilter('stock', 'out')} active={list.filters.stock === 'out'} />
          <Tile label="Inventory value (at sale price)" value={s ? formatCompactCurrency(s.inventoryValueMinor) : '—'} icon={WarehouseIcon} tone="bg-info-soft text-info" loading={!s} />
        </div>
      )}

      <Tabs
        label="Stock level"
        className="mb-4"
        value={list.filters.stock}
        onChange={(v) => list.setFilter('stock', v)}
        tabs={[{ key: '', label: 'All' }, { key: 'in', label: 'Healthy' }, { key: 'low', label: 'Low stock', count: s?.lowStock }, { key: 'out', label: 'Out of stock', count: s?.outOfStock }]}
      />

      <DataTable
        caption="Inventory"
        storageKey="inventory"
        rows={stock.items}
        rowKey={(r) => `${r.variant_id}:${r.warehouse_id}`}
        loading={stock.isLoading}
        fetching={stock.isFetching}
        error={stock.error}
        onRetry={() => void stock.refetch()}
        pagination={{ page: list.page, totalPages: stock.totalPages, total: stock.total, pageSize: list.pageSize, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
        empty={{ icon: Boxes, title: list.q || list.filters.stock ? 'Nothing matches these filters' : 'No stock recorded yet', message: 'Stock appears once products have units in a warehouse.' }}
        toolbar={
          <>
            <SearchInput value={list.q} onChange={list.setQuery} placeholder="Search product or SKU…" />
            <Select aria-label="Warehouse" value={list.filters.warehouseId} onChange={(e) => list.setFilter('warehouseId', e.target.value)} className="w-52">
              <option value="">All warehouses</option>
              {(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}{w.vendor_name ? ` · ${w.vendor_name}` : ''}</option>)}
            </Select>
          </>
        }
        columns={[
          { id: 'product', header: 'Product', mobile: 'primary', hideable: false, cell: (r) => <Link to={`/products/${r.product_id}`} className="line-clamp-1 font-medium text-ink hover:underline">{r.product_title}</Link> },
          { id: 'sku', header: 'SKU', cell: (r) => <span className="font-mono text-xs">{r.sku}</span> },
          { id: 'vendor', header: 'Vendor', cell: (r) => r.vendor_name },
          { id: 'warehouse', header: 'Warehouse', cell: (r) => r.warehouse_name },
          { id: 'stock', header: 'On hand', align: 'right', cell: (r) => <span className="tabular">{formatNumber(r.quantity)}</span> },
          { id: 'reserved', header: 'Reserved', align: 'right', cell: (r) => <span className="tabular text-muted">{formatNumber(r.reserved)}</span> },
          { id: 'available', header: 'Available', align: 'right', cell: (r) => <span className={clsx('tabular font-semibold', r.available <= 0 ? 'text-danger' : r.isLowStock ? 'text-warning' : 'text-ink')}>{formatNumber(r.available)}</span> },
          { id: 'status', header: 'Status', cell: (r) => <StatusBadge status={stockState(r)} /> },
        ]}
        rowActions={(r) => (
          <Dropdown align="end" trigger={(props) => <IconButton {...props} size="sm" label={`Actions for ${r.sku}`}><MoreHorizontal className="h-4 w-4" /></IconButton>}>
            <DropdownItem icon={SlidersHorizontal} onSelect={() => { setAdjusting(r); setDelta(''); setReason(''); }}>Adjust stock</DropdownItem>
            <DropdownItem icon={ArrowLeftRight} onSelect={() => { setTransferring(r); setToWarehouse(''); setQty(''); }}>Transfer</DropdownItem>
            <DropdownItem icon={History} onSelect={() => { setHistory(r); setHistoryPage(1); }}>View history</DropdownItem>
          </Dropdown>
        )}
      />

      <Modal
        open={Boolean(adjusting)}
        onClose={() => setAdjusting(null)}
        title={`Adjust ${adjusting?.sku ?? ''}`}
        description={adjusting ? `${adjusting.product_title} · ${adjusting.warehouse_name}` : undefined}
        size="sm"
        footer={<><Button variant="outline" onClick={() => setAdjusting(null)}>Cancel</Button><Button disabled={adjustInvalid} isLoading={adjust.isPending} onClick={() => adjust.mutate()}>Save adjustment</Button></>}
      >
        {adjusting && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-surface-2 p-3 text-center text-xs">
              <div><p className="text-muted">On hand</p><p className="tabular text-base font-semibold">{adjusting.quantity}</p></div>
              <div><p className="text-muted">Reserved</p><p className="tabular text-base font-semibold">{adjusting.reserved}</p></div>
              <div><p className="text-muted">After</p><p className={clsx('tabular text-base font-semibold', delta && adjusting.quantity + deltaNum < adjusting.reserved ? 'text-danger' : 'text-sage')}>{delta && Number.isFinite(deltaNum) ? adjusting.quantity + deltaNum : '—'}</p></div>
            </div>
            <Field label="Change (units)" required hint="Use a negative number to remove stock, e.g. −3 for damaged units." error={delta && adjusting.quantity + deltaNum < adjusting.reserved ? `Can’t go below ${adjusting.reserved} reserved units.` : null}>
              <Input type="number" step={1} autoFocus value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="+10" />
            </Field>
            <div className="flex flex-wrap gap-1.5">{[-5, -1, 1, 5, 10, 50].map((n) => <Button key={n} size="xs" variant="outline" onClick={() => setDelta(String((Number(delta) || 0) + n))}>{n > 0 ? `+${n}` : n}</Button>)}</div>
            <Field label="Reason" required hint="Saved to the movement history."><Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Restock from supplier" /></Field>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(transferring)}
        onClose={() => setTransferring(null)}
        title={`Transfer ${transferring?.sku ?? ''}`}
        description={transferring ? `From ${transferring.warehouse_name} · ${transferring.available} available` : undefined}
        size="sm"
        footer={<><Button variant="outline" onClick={() => setTransferring(null)}>Cancel</Button><Button disabled={transferInvalid} isLoading={transfer.isPending} onClick={() => transfer.mutate()}>Transfer</Button></>}
      >
        {transferring && (vendorWarehouses.length === 0 ? (
          <EmptyState compact icon={WarehouseIcon} title="No other warehouse" message={`${transferring.vendor_name} has only one active warehouse, so there’s nowhere to move stock to.`} />
        ) : (
          <div className="space-y-4">
            <Field label="Destination warehouse" required>
              <Select value={toWarehouse} onChange={(e) => setToWarehouse(e.target.value)}>
                <option value="">Choose…</option>
                {vendorWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name} · {w.city}</option>)}
              </Select>
            </Field>
            <Field label="Quantity" required error={qty && qtyNum > transferring.available ? `Only ${transferring.available} available to move.` : null}>
              <Input type="number" min={1} max={transferring.available} step={1} value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
          </div>
        ))}
      </Modal>

      <Drawer open={Boolean(history)} onClose={() => setHistory(null)} title={`History · ${history?.sku ?? ''}`} description={history?.product_title}>
        {movements.isLoading ? (
          <div className="space-y-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : movements.error ? (
          <ErrorState compact message="History couldn’t load." error={movements.error} onRetry={() => void movements.refetch()} />
        ) : !movements.data?.items.length ? (
          <EmptyState compact icon={History} title="No movements yet" />
        ) : (
          <>
            <ol className="relative space-y-4 border-l border-line pl-5">
              {movements.data.items.map((m) => (
                <li key={m.id} className="relative">
                  <span className={clsx('absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-surface', m.quantity_delta > 0 ? 'bg-success' : 'bg-danger')} />
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-ink">{humanize(m.movement_type)} <span className={clsx('tabular', m.quantity_delta > 0 ? 'text-success' : 'text-danger')}>{m.quantity_delta > 0 ? '+' : ''}{m.quantity_delta}</span></p>
                    <time className="shrink-0 text-2xs text-faint">{formatDateTime(m.created_at)}</time>
                  </div>
                  <p className="text-xs text-muted">{[m.warehouse_name, m.reference_type && humanize(m.reference_type), m.actor_name].filter(Boolean).join(' · ')}</p>
                  {m.note && <p className="mt-1 rounded-md bg-surface-2 px-2 py-1 text-xs text-ink-2">{m.note}</p>}
                </li>
              ))}
            </ol>
            {movements.data.totalPages > 1 && (
              <div className="mt-6 flex justify-between">
                <Button size="xs" variant="outline" disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => p - 1)}>Newer</Button>
                <span className="text-xs text-muted">Page {historyPage} of {movements.data.totalPages}</span>
                <Button size="xs" variant="outline" disabled={historyPage >= movements.data.totalPages} onClick={() => setHistoryPage((p) => p + 1)}>Older</Button>
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
