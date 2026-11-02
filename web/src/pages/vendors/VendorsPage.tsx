import { CheckCircle2, ClipboardCheck, Eye, MoreHorizontal, PauseCircle, PlayCircle, Store } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import type { VendorRow } from '../../api/people';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../components/ui/Avatar';
import { StatusBadge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { Dropdown, DropdownItem, DropdownSeparator } from '../../components/ui/Dropdown';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { Tabs } from '../../components/ui/Tabs';
import { useListState, usePagedQuery } from '../../hooks/useListState';
import { formatCompactCurrency, formatNumber } from '../../lib/format';
import { useVendorActions } from './useVendorActions';
import { commissionLabel } from './vendorFormat';

export function VendorsPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const actions = useVendorActions();
  const list = useListState({ defaults: { status: '' }, pageSizeKey: 'vendors' });
  const vendors = usePagedQuery<VendorRow>(['admin-vendors'], '/admin/vendors', { page: list.page, limit: list.pageSize, q: list.q, status: list.filters.status });

  return (
    <div>
      <PageHeader
        title="Vendors"
        description="The stores that make up the Sureshot marketplace."
        actions={<Button size="sm" variant="outline" className="h-9" onClick={() => navigate('/vendors/applications')}><ClipboardCheck className="h-4 w-4" /> Review applications</Button>}
      />
      <Tabs label="Vendor status" className="mb-4" value={list.filters.status} onChange={(v) => list.setFilter('status', v)}
        tabs={[{ key: '', label: 'All' }, { key: 'approved', label: 'Active' }, { key: 'pending,under_review', label: 'Pending' }, { key: 'suspended', label: 'Suspended' }, { key: 'rejected', label: 'Rejected' }]} />
      <DataTable
        caption="Vendors"
        storageKey="vendors"
        rows={vendors.items}
        rowKey={(v) => v.id}
        loading={vendors.isLoading}
        fetching={vendors.isFetching}
        error={vendors.error}
        onRetry={() => void vendors.refetch()}
        onRowClick={(v) => navigate(`/vendors/${v.id}`)}
        pagination={{ page: list.page, totalPages: vendors.totalPages, total: vendors.total, pageSize: list.pageSize, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
        empty={{ icon: Store, title: list.q || list.filters.status ? 'No vendors match' : 'No vendors yet', message: 'Sellers appear here once they register a store.' }}
        toolbar={<SearchInput value={list.q} onChange={list.setQuery} placeholder="Search stores…" />}
        columns={[
          { id: 'store', header: 'Store', mobile: 'primary', hideable: false, cell: (v) => <div className="flex items-center gap-3"><Avatar name={v.store_name} src={v.logo_url} size="sm" square /><div className="min-w-0"><p className="truncate font-medium text-ink">{v.store_name}</p><p className="truncate text-xs text-faint">/{v.store_slug}</p></div></div> },
          { id: 'owner', header: 'Owner', cell: (v) => <div className="min-w-0 max-w-[180px]"><p className="truncate text-ink">{v.owner_name ?? '—'}</p><p className="truncate text-xs text-faint">{v.owner_email}</p></div> },
          { id: 'products', header: 'Products', align: 'right', cell: (v) => <span className="tabular">{formatNumber(v.product_count)}</span> },
          { id: 'orders', header: 'Orders', align: 'right', cell: (v) => <span className="tabular">{formatNumber(v.order_count)}</span> },
          { id: 'revenue', header: 'Net sales', align: 'right', cell: (v) => <span className="tabular font-medium text-ink">{formatCompactCurrency(v.revenue_minor)}</span> },
          { id: 'commission', header: 'Commission', align: 'right', cell: (v) => <div className="tabular text-right"><p>{formatCompactCurrency(v.commission_minor)}</p><p className="text-2xs text-faint">{commissionLabel(v.commission_rate_bp)}</p></div> },
          { id: 'rating', header: 'Rating', align: 'right', cell: (v) => (v.rating_count ? <span className="tabular">★ {Number(v.rating_avg).toFixed(1)}</span> : <span className="text-faint">—</span>) },
          { id: 'status', header: 'Status', cell: (v) => <StatusBadge status={v.status} /> },
        ]}
        rowActions={(v) => (
          <Dropdown align="end" trigger={(props) => <IconButton {...props} size="sm" label={`Actions for ${v.store_name}`}><MoreHorizontal className="h-4 w-4" /></IconButton>}>
            <DropdownItem icon={Eye} onSelect={() => navigate(`/vendors/${v.id}`)}>View profile</DropdownItem>
            {['pending', 'under_review'].includes(v.status) && hasPermission('vendors:approve') && (
              <DropdownItem icon={CheckCircle2} onSelect={() => navigate(`/vendors/applications?id=${v.id}`)}>Review application</DropdownItem>
            )}
            {v.status === 'approved' && hasPermission('vendors:suspend') && (<><DropdownSeparator /><DropdownItem icon={PauseCircle} tone="danger" onSelect={() => void actions.suspend(v)}>Suspend</DropdownItem></>)}
            {v.status === 'suspended' && hasPermission('vendors:suspend') && <DropdownItem icon={PlayCircle} onSelect={() => void actions.reactivate(v)}>Reactivate</DropdownItem>}
          </Dropdown>
        )}
      />
    </div>
  );
}
