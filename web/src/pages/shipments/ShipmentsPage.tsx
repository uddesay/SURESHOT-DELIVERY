import { ExternalLink, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';

import { StatusBadge } from '../../components/ui/Badge';
import { DataTable } from '../../components/ui/DataTable';
import { Select } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tabs } from '../../components/ui/Tabs';
import { useListState, usePagedQuery } from '../../hooks/useListState';
import { formatDateTime } from '../../lib/format';
import { useCatalogOptions } from '../catalog/catalogOptions';

interface ShipmentRow {
  id: string; order_id: string; order_number: string; vendor_name: string; vendor_id: string; status: string;
  courier: string | null; awb_number: string | null; tracking_url: string | null; shipped_at: string | null; delivered_at: string | null; created_at: string;
}

export function ShipmentsPage() {
  const list = useListState({ defaults: { status: '', vendorId: '' }, pageSizeKey: 'shipments' });
  const { vendors } = useCatalogOptions();
  const shipments = usePagedQuery<ShipmentRow>(['admin-shipments'], '/admin/shipments', { page: list.page, limit: list.pageSize, ...list.filters });

  return (
    <div>
      <PageHeader title="Shipments" description="Every vendor parcel. Each order is split into one shipment per vendor." />
      <Tabs
        label="Shipment status"
        className="mb-4"
        value={list.filters.status}
        onChange={(v) => list.setFilter('status', v)}
        tabs={[{ key: '', label: 'All' }, { key: 'pending', label: 'Pending' }, { key: 'packed', label: 'Packed' }, { key: 'shipped', label: 'Shipped' }, { key: 'out_for_delivery', label: 'Out for delivery' }, { key: 'delivered', label: 'Delivered' }, { key: 'cancelled', label: 'Cancelled' }, { key: 'rto', label: 'RTO' }]}
      />
      <DataTable
        caption="Shipments"
        storageKey="shipments"
        rows={shipments.items}
        rowKey={(s) => s.id}
        loading={shipments.isLoading}
        fetching={shipments.isFetching}
        error={shipments.error}
        onRetry={() => void shipments.refetch()}
        pagination={{ page: list.page, totalPages: shipments.totalPages, total: shipments.total, pageSize: list.pageSize, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
        empty={{ icon: Truck, title: 'No shipments here', message: 'Shipments are created at checkout, one per vendor.' }}
        toolbar={
          <Select aria-label="Vendor" value={list.filters.vendorId} onChange={(e) => list.setFilter('vendorId', e.target.value)} className="w-52">
            <option value="">All vendors</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.store_name}</option>)}
          </Select>
        }
        columns={[
          { id: 'order', header: 'Order', mobile: 'primary', hideable: false, cell: (s) => <Link to={`/orders/${s.order_id}#fulfillment`} className="link font-mono text-[13px]">{s.order_number}</Link> },
          { id: 'vendor', header: 'Vendor', cell: (s) => <Link to={`/vendors/${s.vendor_id}`} className="hover:underline">{s.vendor_name}</Link> },
          { id: 'courier', header: 'Courier', cell: (s) => (s.courier ? <span className="capitalize">{s.courier}</span> : <span className="text-faint">Not booked</span>) },
          { id: 'awb', header: 'AWB', cell: (s) => (s.awb_number ? (s.tracking_url ? <a href={s.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-sage hover:underline">{s.awb_number} <ExternalLink className="h-3 w-3" /></a> : <span className="font-mono text-xs">{s.awb_number}</span>) : '—') },
          { id: 'shipped', header: 'Shipped', cell: (s) => <span className="whitespace-nowrap text-xs">{formatDateTime(s.shipped_at)}</span> },
          { id: 'delivered', header: 'Delivered', defaultHidden: true, cell: (s) => <span className="whitespace-nowrap text-xs">{formatDateTime(s.delivered_at)}</span> },
          { id: 'status', header: 'Status', cell: (s) => <StatusBadge status={s.status} /> },
        ]}
      />
    </div>
  );
}
