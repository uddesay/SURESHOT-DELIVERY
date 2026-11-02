import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, Mail, MoreHorizontal, PauseCircle, PlayCircle, ShieldCheck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { peopleApi, type UserRow } from '../../api/people';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { DataTable, type Column, type SortState } from '../../components/ui/DataTable';
import { Dropdown, DropdownItem, DropdownSeparator } from '../../components/ui/Dropdown';
import { Select } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { useToast } from '../../components/ui/Toast';
import { paramFromSort, sortFromParam, useListState, usePagedQuery } from '../../hooks/useListState';
import { apiGetPage } from '../../lib/apiClient';
import { downloadCsv } from '../../lib/csv';
import { formatCurrency, formatDate, formatRelative, humanize } from '../../lib/format';

const SORTS: Record<string, SortState> = {
  newest: { key: 'joined', dir: 'desc' },
  oldest: { key: 'joined', dir: 'asc' },
  spent: { key: 'spent', dir: 'desc' },
  orders: { key: 'orders', dir: 'desc' },
  last_order: { key: 'last_order', dir: 'desc' },
};

export function useUserStatusActions() {
  const confirm = useConfirm();
  const toast = useToast();
  const queryClient = useQueryClient();
  const invalidate = () => { void queryClient.invalidateQueries({ queryKey: ['admin-users'] }); void queryClient.invalidateQueries({ queryKey: ['admin-user'] }); };
  const suspend = useMutation({ mutationFn: (id: string) => peopleApi.suspendUser(id), onSuccess: () => { toast.success('Account suspended', 'They can’t sign in or check out until reactivated.'); invalidate(); } });
  const reactivate = useMutation({ mutationFn: (id: string) => peopleApi.reactivateUser(id), onSuccess: () => { toast.success('Account reactivated'); invalidate(); } });
  return {
    suspend: (u: { id: string; full_name: string | null }) => confirm({
      title: `Suspend ${u.full_name ?? 'this account'}?`, description: 'They’re signed out of new sessions and can’t place orders. Existing orders continue.',
      tone: 'danger', confirmLabel: 'Suspend', onConfirm: () => suspend.mutateAsync(u.id),
    }),
    reactivate: (u: { id: string; full_name: string | null }) => confirm({
      title: `Reactivate ${u.full_name ?? 'this account'}?`, confirmLabel: 'Reactivate', onConfirm: () => reactivate.mutateAsync(u.id),
    }),
  };
}

function PeopleList({ mode }: { mode: 'customer' | 'staff' }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, hasPermission } = useAuth();
  const statusActions = useUserStatusActions();
  const list = useListState({ defaults: { status: '' }, defaultSort: 'newest', pageSizeKey: `users-${mode}` });
  const users = usePagedQuery<UserRow>(['admin-users', mode], '/admin/users', { role: mode, page: list.page, limit: list.pageSize, q: list.q, status: list.filters.status, sort: list.sortParam });
  const [exporting, setExporting] = useState(false);
  const base = mode === 'customer' ? '/customers' : '/staff';
  const canSuspend = hasPermission('users:suspend');

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: UserRow[] = [];
      for (let page = 1; page <= 20; page++) {
        const res = await apiGetPage<UserRow>('/admin/users', { role: mode, q: list.q || undefined, status: list.filters.status || undefined, sort: list.sortParam, page, limit: 100 });
        rows.push(...res.items);
        if (page >= res.totalPages) break;
      }
      downloadCsv(`sureshot-${mode}s-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
        { header: 'Name', value: (u) => u.full_name }, { header: 'Email', value: (u) => u.email }, { header: 'Phone', value: (u) => u.phone },
        { header: 'Orders', value: (u) => u.order_count }, { header: 'Total spent (INR)', value: (u) => (u.total_spent_minor / 100).toFixed(2) },
        { header: 'Last order', value: (u) => u.last_order_at }, { header: 'Status', value: (u) => u.status }, { header: 'Joined', value: (u) => u.created_at },
      ]);
      toast.success(`Exported ${rows.length} ${mode === 'customer' ? 'customers' : 'staff accounts'}`);
    } catch (e) {
      toast.fromError(e, 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const person: Column<UserRow> = {
    id: 'person', header: mode === 'customer' ? 'Customer' : 'Team member', mobile: 'primary', hideable: false, sortKey: 'joined',
    cell: (u) => <div className="flex items-center gap-3"><Avatar name={u.full_name ?? u.email} size="sm" /><div className="min-w-0"><p className="truncate font-medium text-ink">{u.full_name ?? '—'}{u.id === user?.id && <span className="ml-1.5 text-xs text-faint">(you)</span>}</p><p className="truncate text-xs text-faint">{u.email ?? u.phone}</p></div></div>,
  };

  const columns: Column<UserRow>[] = mode === 'customer' ? [
    person,
    { id: 'orders', header: 'Orders', align: 'right', sortKey: 'orders', cell: (u) => <span className="tabular">{u.order_count}</span> },
    { id: 'spent', header: 'Total spent', align: 'right', sortKey: 'spent', cell: (u) => <span className="tabular font-medium text-ink">{formatCurrency(u.total_spent_minor)}</span> },
    { id: 'aov', header: 'AOV', align: 'right', cell: (u) => <span className="tabular">{u.aov_minor ? formatCurrency(u.aov_minor) : '—'}</span> },
    { id: 'last', header: 'Last order', sortKey: 'last_order', cell: (u) => <span className="whitespace-nowrap text-xs">{u.last_order_at ? formatRelative(u.last_order_at) : 'Never'}</span> },
    { id: 'status', header: 'Status', cell: (u) => <StatusBadge status={u.status} /> },
    { id: 'joined', header: 'Joined', cell: (u) => <span className="whitespace-nowrap text-xs">{formatDate(u.created_at)}</span> },
  ] : [
    person,
    { id: 'roles', header: 'Roles', cell: (u) => <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} tone={r === 'super_admin' ? 'brand' : 'neutral'}>{humanize(r)}</Badge>)}</div> },
    { id: 'status', header: 'Status', cell: (u) => <StatusBadge status={u.status} /> },
    { id: 'login', header: 'Last sign-in', cell: (u) => <span className="whitespace-nowrap text-xs">{u.last_login_at ? formatRelative(u.last_login_at) : 'Never'}</span> },
    { id: 'joined', header: 'Added', cell: (u) => <span className="whitespace-nowrap text-xs">{formatDate(u.created_at)}</span> },
  ];

  return (
    <DataTable
      caption={mode === 'customer' ? 'Customers' : 'Staff'}
      storageKey={`users-${mode}`}
      columns={columns}
      rows={users.items}
      rowKey={(u) => u.id}
      loading={users.isLoading}
      fetching={users.isFetching}
      error={users.error}
      onRetry={() => void users.refetch()}
      onRowClick={(u) => navigate(`${base}/${u.id}`)}
      sort={sortFromParam(list.sortParam, SORTS)}
      onSortChange={(s) => list.setSortParam(paramFromSort(s, SORTS) ?? 'newest')}
      pagination={{ page: list.page, totalPages: users.totalPages, total: users.total, pageSize: list.pageSize, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
      empty={{ icon: UserRound, title: list.q || list.filters.status ? 'Nobody matches' : mode === 'customer' ? 'No customers yet' : 'No staff accounts', message: mode === 'customer' ? 'Customers appear when they create an account on the storefront.' : undefined }}
      toolbar={
        <>
          <SearchInput value={list.q} onChange={list.setQuery} placeholder="Name, email or phone…" />
          <Select aria-label="Status" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} className="w-36">
            <option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option>
          </Select>
          <Button variant="outline" size="sm" className="h-9" isLoading={exporting} onClick={() => void exportCsv()}><Download className="h-4 w-4" /> Export</Button>
        </>
      }
      rowActions={(u) => (
        <Dropdown align="end" trigger={(props) => <IconButton {...props} size="sm" label={`Actions for ${u.full_name ?? 'user'}`}><MoreHorizontal className="h-4 w-4" /></IconButton>}>
          <DropdownItem icon={Eye} onSelect={() => navigate(`${base}/${u.id}`)}>View profile</DropdownItem>
          {u.email && <DropdownItem icon={Mail} onSelect={() => { window.location.href = `mailto:${u.email}`; }}>Send email</DropdownItem>}
          {canSuspend && u.id !== user?.id && (
            <>
              <DropdownSeparator />
              {u.status === 'active' && <DropdownItem icon={PauseCircle} tone="danger" onSelect={() => void statusActions.suspend(u)}>Suspend</DropdownItem>}
              {u.status === 'suspended' && <DropdownItem icon={PlayCircle} onSelect={() => void statusActions.reactivate(u)}>Reactivate</DropdownItem>}
            </>
          )}
        </Dropdown>
      )}
    />
  );
}

export function CustomersPage() {
  return (
    <div>
      <PageHeader title="Customers" description="Everyone who shops on Sureshot, ranked however you need." />
      <PeopleList mode="customer" />
    </div>
  );
}

export function StaffPage() {
  const { user } = useAuth();
  return (
    <div>
      <PageHeader eyebrow="System" title="Staff & roles" description="Accounts that can sign in to this workspace. Access comes from each account’s role." />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <PeopleList mode="staff" />
        <Card className="h-fit">
          <CardHeader title="Your access" description={user?.roles.map(humanize).join(', ')} action={<ShieldCheck className="h-4 w-4 text-sage" />} />
          <div className="p-5">
            {user?.roles.includes('super_admin') ? (
              <p className="text-sm text-ink-2">Super admins have every permission, including settings and roles.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">{user?.permissions.map((p) => <li key={p}><code className="rounded bg-surface-2 px-1.5 py-0.5 text-2xs">{p}</code></li>)}</ul>
            )}
            <p className="mt-4 text-xs text-muted">Roles: <b className="font-medium">Super admin</b> (everything), <b className="font-medium">Admin</b> (all but settings & roles), <b className="font-medium">Support agent</b> (customers, orders, returns, support, reviews).</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
