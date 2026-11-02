import clsx from 'clsx';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Columns3, Inbox, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { storage } from '../../lib/storage';
import { Dropdown, DropdownCheckItem, DropdownLabel } from './Dropdown';
import { EmptyState, ErrorState } from './EmptyState';
import { Checkbox, Select } from './Input';
import { Skeleton } from './Skeleton';

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Server sort key; makes the header clickable. */
  sortKey?: string;
  align?: 'left' | 'right' | 'center';
  className?: string;
  /** Can the user hide it? Defaults to true for non-primary columns. */
  hideable?: boolean;
  defaultHidden?: boolean;
  /** Mobile card role: primary shows as the title, hidden is omitted. */
  mobile?: 'primary' | 'secondary' | 'hidden';
}

export interface SortState { key: string; dir: 'asc' | 'desc' }

export interface PaginationState {
  page: number;
  totalPages: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  loading?: boolean;
  fetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: { icon?: typeof Inbox; title: string; message?: ReactNode; action?: ReactNode };
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  bulkActions?: (ids: string[]) => ReactNode;
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  pagination?: PaginationState;
  /** Persist column visibility under this key. */
  storageKey?: string;
  toolbar?: ReactNode;
  rowActions?: (row: T) => ReactNode;
  className?: string;
}

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' };

export function DataTable<T>({
  columns, rows, rowKey, caption, loading, fetching, error, onRetry, empty, onRowClick,
  selectable, selected, onSelectedChange, bulkActions, sort, onSortChange, pagination, storageKey,
  toolbar, rowActions, className,
}: DataTableProps<T>) {
  const prefKey = storageKey ? `sureshot.admin.columns.${storageKey}` : null;
  const [hidden, setHidden] = useState<string[]>(() =>
    prefKey ? storage.get<string[]>(prefKey, columns.filter((c) => c.defaultHidden).map((c) => c.id)) : columns.filter((c) => c.defaultHidden).map((c) => c.id));

  useEffect(() => { if (prefKey) storage.set(prefKey, hidden); }, [prefKey, hidden]);

  const visible = useMemo(() => columns.filter((c) => !hidden.includes(c.id)), [columns, hidden]);
  const hideable = columns.filter((c) => c.hideable !== false && c.mobile !== 'primary');
  const ids = rows.map(rowKey);
  const selectedIds = ids.filter((id) => selected?.has(id));
  const allSelected = ids.length > 0 && selectedIds.length === ids.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleAll = (checked: boolean) => {
    if (!onSelectedChange) return;
    const next = new Set(selected);
    ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
    onSelectedChange(next);
  };
  const toggleOne = (id: string, checked: boolean) => {
    if (!onSelectedChange) return;
    const next = new Set(selected);
    if (checked) next.add(id); else next.delete(id);
    onSelectedChange(next);
  };

  const headerSort = (col: Column<T>) => {
    if (!col.sortKey || !onSortChange) return;
    const dir = sort?.key === col.sortKey && sort.dir === 'desc' ? 'asc' : 'desc';
    onSortChange({ key: col.sortKey, dir });
  };

  const selectionCount = selected?.size ?? 0;
  const primary = visible.find((c) => c.mobile === 'primary') ?? visible[0];
  const secondary = visible.filter((c) => c !== primary && c.mobile !== 'hidden');

  return (
    <div className={clsx('card min-w-0 overflow-hidden', className)}>
      {(toolbar || hideable.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
          {hideable.length > 0 && (
            <Dropdown
              align="end"
              trigger={(props) => (
                <button {...props} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2">
                  <Columns3 className="h-4 w-4" /> <span className="hidden sm:inline">Columns</span>
                </button>
              )}
            >
              <DropdownLabel>Visible columns</DropdownLabel>
              {hideable.map((c) => (
                <DropdownCheckItem
                  key={c.id}
                  checked={!hidden.includes(c.id)}
                  onCheckedChange={(on) => setHidden((h) => (on ? h.filter((x) => x !== c.id) : [...h, c.id]))}
                >
                  {c.header}
                </DropdownCheckItem>
              ))}
            </Dropdown>
          )}
        </div>
      )}

      {selectable && selectionCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-soft/70 px-4 py-2.5 animate-fade-in">
          <span className="text-[13px] font-medium text-ink">{selectionCount} selected</span>
          <button onClick={() => onSelectedChange?.(new Set())} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted hover:text-ink">
            <X className="h-3 w-3" /> Clear
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">{bulkActions?.([...(selected ?? [])])}</div>
        </div>
      )}

      <div className={clsx('relative', fetching && !loading && 'opacity-70 transition-opacity')}>
        {error ? (
          <ErrorState message={`We couldn’t load ${caption.toLowerCase()}.`} error={error} onRetry={onRetry} />
        ) : !loading && rows.length === 0 ? (
          <EmptyState icon={empty?.icon ?? Inbox} title={empty?.title ?? 'Nothing here yet'} message={empty?.message} action={empty?.action} />
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="commerce-table-scroll hidden overflow-x-auto md:block" tabIndex={0} role="region" aria-label={`${caption} table. Scroll horizontally for more columns.`}>
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">{caption}</caption>
                <thead>
                  <tr className="border-b border-line bg-surface-2/50">
                    {selectable && (
                      <th scope="col" className="w-10 py-2.5 pl-4 pr-1">
                        <Checkbox ariaLabel="Select all rows on this page" checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
                      </th>
                    )}
                    {visible.map((col) => {
                      const active = sort?.key === col.sortKey;
                      return (
                        <th
                          key={col.id}
                          scope="col"
                          aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                          className={clsx('whitespace-nowrap px-4 py-2.5 text-xs font-medium text-muted', alignClass[col.align ?? 'left'], col.className)}
                        >
                          {col.sortKey && onSortChange ? (
                            <button onClick={() => headerSort(col)} className={clsx('inline-flex items-center gap-1 rounded hover:text-ink', active && 'text-ink')}>
                              {col.header}
                              {active ? (sort?.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-50" />}
                            </button>
                          ) : col.header}
                        </th>
                      );
                    })}
                    {rowActions && <th scope="col" className="commerce-row-actions w-12 px-4 py-2.5"><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {loading
                    ? Array.from({ length: 6 }, (_, i) => (
                      <tr key={i}>
                        {selectable && <td className="py-3.5 pl-4"><Skeleton className="h-4 w-4" /></td>}
                        {visible.map((c) => <td key={c.id} className="px-4 py-3.5"><Skeleton className="h-3.5 w-[70%]" /></td>)}
                        {rowActions && <td />}
                      </tr>
                    ))
                    : rows.map((row) => {
                      const id = rowKey(row);
                      const isSelected = selected?.has(id);
                      return (
                        <tr
                          key={id}
                          onClick={onRowClick ? () => onRowClick(row) : undefined}
                          className={clsx(
                            'group transition-colors',
                            onRowClick && 'cursor-pointer',
                            isSelected ? 'bg-brand-soft/50' : 'hover:bg-surface-2/70',
                          )}
                        >
                          {selectable && (
                            <td className="py-3 pl-4 pr-1" onClick={(e) => e.stopPropagation()}>
                              <Checkbox ariaLabel="Select row" checked={Boolean(isSelected)} onChange={(c) => toggleOne(id, c)} />
                            </td>
                          )}
                          {visible.map((col) => (
                            <td key={col.id} className={clsx('px-4 py-3 text-ink-2', alignClass[col.align ?? 'left'], col.className)}>
                              {col.cell(row)}
                            </td>
                          ))}
                          {rowActions && (
                            <td className="commerce-row-actions px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>{rowActions(row)}</td>
                          )}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-line md:hidden" aria-label={caption}>
              {loading
                ? Array.from({ length: 4 }, (_, i) => <li key={i} className="space-y-2 p-4"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-3/4" /></li>)
                : rows.map((row) => {
                  const id = rowKey(row);
                  return (
                    <li key={id} className={clsx('flex gap-3 p-4', onRowClick && 'cursor-pointer active:bg-surface-2')} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                      {selectable && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <Checkbox ariaLabel="Select row" checked={Boolean(selected?.has(id))} onChange={(c) => toggleOne(id, c)} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-ink">{primary?.cell(row)}</div>
                        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                          {secondary.map((col) => (
                            <div key={col.id} className="min-w-0">
                              <dt className="text-2xs uppercase tracking-wide text-faint">{col.header}</dt>
                              <dd className="truncate text-[13px] text-ink-2">{col.cell(row)}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                      {rowActions && <div onClick={(e) => e.stopPropagation()}>{rowActions(row)}</div>}
                    </li>
                  );
                })}
            </ul>
          </>
        )}
      </div>

      {pagination && !error && (rows.length > 0 || pagination.page > 1) && <Pagination {...pagination} />}
    </div>
  );
}

export function Pagination({ page, totalPages, total, pageSize, onPageChange, onPageSizeChange }: PaginationState) {
  const from = pageSize ? (page - 1) * pageSize + 1 : null;
  const to = pageSize ? Math.min(page * pageSize, total) : null;
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-muted">
      <span className="tabular">
        {from && to ? <>Showing <b className="font-medium text-ink">{from}–{to}</b> of {total.toLocaleString('en-IN')}</> : <>Page {page} of {totalPages}</>}
      </span>
      <div className="flex items-center gap-2">
        {onPageSizeChange && pageSize && (
          <label className="flex items-center gap-1.5 text-xs">
            <span className="hidden sm:inline">Rows</span>
            <Select aria-label="Rows per page" value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="h-8 w-[72px] text-xs">
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </label>
        )}
        <button aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors hover:bg-surface-2 disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="tabular min-w-[64px] text-center text-ink">{page} / {Math.max(1, totalPages)}</span>
        <button aria-label="Next page" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors hover:bg-surface-2 disabled:opacity-40">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
