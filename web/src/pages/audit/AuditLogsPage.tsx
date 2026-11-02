import { ScrollText } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '../../components/ui/Badge';
import { DataTable } from '../../components/ui/DataTable';
import { Field, Input, Select } from '../../components/ui/Input';
import { Drawer } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { useListState, usePagedQuery } from '../../hooks/useListState';
import { formatDateTime, humanize } from '../../lib/format';

interface AuditLog {
  id: string; action: string; entity_type: string; entity_id: string | null; actor_id: string | null; actor_name: string | null; actor_email: string | null;
  ip_address: string | null; user_agent: string | null; after_data: unknown; created_at: string;
}

const ENTITY_LINKS: Record<string, (id: string) => string> = {
  order: (id) => `/orders/${id}`, product: (id) => `/products/${id}`, vendor: (id) => `/vendors/${id}`, user: (id) => `/customers/${id}`,
};

const ENTITY_TYPES = ['order', 'product', 'vendor', 'user', 'category', 'brand', 'coupon', 'setting', 'product_variant', 'review', 'banner', 'page', 'blog', 'faq'];

export function AuditLogsPage() {
  const list = useListState({ defaults: { entityType: '', from: '', to: '' }, pageSizeKey: 'audit' });
  const [open, setOpen] = useState<AuditLog | null>(null);
  const f = list.filters;
  const logs = usePagedQuery<AuditLog>(['audit-logs'], '/admin/audit-logs', {
    page: list.page, limit: list.pageSize, action: list.q, entityType: f.entityType,
    from: f.from ? new Date(`${f.from}T00:00:00`).toISOString() : '', to: f.to ? new Date(new Date(`${f.to}T00:00:00`).getTime() + 86400000).toISOString() : '',
  });

  return (
    <div>
      <PageHeader eyebrow="System" title="Audit logs" description="An append-only record of every change made by staff in this workspace." />
      <DataTable
        caption="Audit logs"
        storageKey="audit"
        rows={logs.items}
        rowKey={(l) => l.id}
        loading={logs.isLoading}
        fetching={logs.isFetching}
        error={logs.error}
        onRetry={() => void logs.refetch()}
        onRowClick={setOpen}
        pagination={{ page: list.page, totalPages: logs.totalPages, total: logs.total, pageSize: list.pageSize, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
        empty={{ icon: ScrollText, title: 'No matching entries', message: 'Try a broader date range or another action.' }}
        toolbar={
          <>
            <SearchInput value={list.q} onChange={list.setQuery} placeholder="Action, e.g. approve…" />
            <Select aria-label="Entity" value={f.entityType} onChange={(e) => list.setFilter('entityType', e.target.value)} className="w-40">
              <option value="">All entities</option>{ENTITY_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </Select>
            <Input aria-label="From date" type="date" value={f.from} max={f.to || undefined} onChange={(e) => list.setFilter('from', e.target.value)} className="w-40" />
            <Input aria-label="To date" type="date" value={f.to} min={f.from || undefined} onChange={(e) => list.setFilter('to', e.target.value)} className="w-40" />
          </>
        }
        columns={[
          { id: 'action', header: 'Action', mobile: 'primary', hideable: false, cell: (l) => <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink">{l.action}</code> },
          { id: 'entity', header: 'Entity', cell: (l) => (l.entity_id && ENTITY_LINKS[l.entity_type] ? <Link to={ENTITY_LINKS[l.entity_type]!(l.entity_id)} onClick={(e) => e.stopPropagation()} className="hover:underline">{humanize(l.entity_type)} · <span className="font-mono text-xs">{l.entity_id.slice(0, 8)}</span></Link> : <span>{humanize(l.entity_type)}{l.entity_id ? <span className="font-mono text-xs"> · {l.entity_id.slice(0, 8)}</span> : ''}</span>) },
          { id: 'actor', header: 'By', cell: (l) => (l.actor_id ? <Link to={`/staff/${l.actor_id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{l.actor_name ?? l.actor_email}</Link> : <Badge>System</Badge>) },
          { id: 'ip', header: 'IP', defaultHidden: true, cell: (l) => <span className="font-mono text-xs">{l.ip_address ?? '—'}</span> },
          { id: 'when', header: 'When', cell: (l) => <span className="whitespace-nowrap text-xs">{formatDateTime(l.created_at)}</span> },
        ]}
      />
      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title={open?.action ?? ''} description={open ? formatDateTime(open.created_at) : undefined}>
        {open && (
          <div className="space-y-4 text-sm">
            <Field label="Performed by"><p className="text-ink">{open.actor_name ?? 'System'} {open.actor_email && <span className="text-muted">· {open.actor_email}</span>}</p></Field>
            <Field label="Entity"><p className="text-ink">{humanize(open.entity_type)} <span className="font-mono text-xs text-muted">{open.entity_id ?? '—'}</span></p></Field>
            <Field label="Client"><p className="break-all text-xs text-muted">{open.ip_address ?? '—'} · {open.user_agent ?? 'unknown agent'}</p></Field>
            <Field label="Request payload"><pre className="max-h-[50vh] overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-xs text-ink-2">{JSON.stringify(open.after_data ?? null, null, 2)}</pre></Field>
          </div>
        )}
      </Drawer>
    </div>
  );
}
