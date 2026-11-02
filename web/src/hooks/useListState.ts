import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { apiGetPage } from '../lib/apiClient';
import { storage } from '../lib/storage';
import type { SortState } from '../components/ui/DataTable';

/**
 * List-screen state kept in the URL (shareable, survives refresh and back
 * navigation): page, page size, search, filters and sort.
 */
export function useListState<F extends Record<string, string>>({
  defaults, defaultSort, pageSizeKey,
}: { defaults: F; defaultSort?: string; pageSizeKey?: string }) {
  const [params, setParams] = useSearchParams();
  const [pageSize, setPageSizeState] = useState<number>(() => (pageSizeKey ? storage.get(`sureshot.admin.pageSize.${pageSizeKey}`, 20) : 20));

  const filters = useMemo(() => {
    const out = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const v = params.get(key);
      if (v !== null) (out as Record<string, string>)[key] = v;
    }
    return out;
  }, [params, defaults]);

  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') ?? '';
  const sortParam = params.get('sort') ?? defaultSort ?? '';

  const update = useCallback((patch: Record<string, string | number | null | undefined>, resetPage = true) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === '') next.delete(k);
        else next.set(k, String(v));
      }
      if (resetPage && !('page' in patch)) next.delete('page');
      return next;
    }, { replace: true });
  }, [setParams]);

  const setPageSize = (size: number) => {
    setPageSizeState(size);
    if (pageSizeKey) storage.set(`sureshot.admin.pageSize.${pageSizeKey}`, size);
    update({ page: null });
  };

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => v && v !== defaults[k]).length;

  return {
    page,
    pageSize,
    q,
    filters,
    sortParam,
    activeFilterCount,
    setPage: (p: number) => update({ page: p > 1 ? p : null }, false),
    setPageSize,
    setQuery: (value: string) => update({ q: value }),
    setFilter: (key: keyof F & string, value: string) => update({ [key]: value }),
    setSortParam: (value: string) => update({ sort: value === defaultSort ? null : value }),
    reset: () => setParams(new URLSearchParams(), { replace: true }),
  };
}

/** Map a backend sort enum (e.g. price_desc) to/from DataTable header sort state. */
export function sortFromParam(param: string, map: Record<string, SortState>): SortState | null {
  return map[param] ?? null;
}
export function paramFromSort(sort: SortState, map: Record<string, SortState>): string | undefined {
  return Object.entries(map).find(([, s]) => s.key === sort.key && s.dir === sort.dir)?.[0];
}

/** Paginated GET with the backend `{ data, meta }` envelope. */
export function usePagedQuery<T>(key: unknown[], url: string, params: Record<string, unknown>, enabled = true) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null));
  const query = useQuery({
    queryKey: [...key, clean],
    queryFn: () => apiGetPage<T>(url, clean),
    placeholderData: keepPreviousData,
    enabled,
  });
  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
