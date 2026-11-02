import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  ArrowRight, Clock, CornerDownLeft, FolderTree, Loader2, Package, Plus, Search, ShoppingBag, Store, UserRound, X, type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { analyticsApi, type SearchResults } from '../../api/analytics';
import { useAuth } from '../../auth/AuthContext';
import { formatCurrency } from '../../lib/format';
import { storage } from '../../lib/storage';
import { statusLabel } from '../ui/Badge';
import { ALL_NAV_ITEMS } from './navigation';
import { useShell } from './ShellContext';

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

const RECENT_KEY = 'sureshot.admin.recentSearches';

const GROUPS: { key: keyof SearchResults; label: string; icon: LucideIcon }[] = [
  { key: 'orders', label: 'Orders', icon: ShoppingBag },
  { key: 'products', label: 'Products', icon: Package },
  { key: 'customers', label: 'Customers', icon: UserRound },
  { key: 'vendors', label: 'Vendors', icon: Store },
  { key: 'categories', label: 'Categories', icon: FolderTree },
];

export const QUICK_ACTIONS = [
  { label: 'Add product', to: '/products/new', permission: 'products:create' },
  { label: 'Create coupon', to: '/coupons?new=1', permission: 'coupons:manage' },
  { label: 'Review vendor applications', to: '/vendors/applications', permission: 'vendors:read' },
  { label: 'Add banner', to: '/cms/banners?new=1', permission: 'cms:manage' },
  { label: 'Write blog post', to: '/cms/blogs?new=1', permission: 'cms:manage' },
  { label: 'Create page', to: '/cms/pages?new=1', permission: 'cms:manage' },
];

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useShell();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>(() => storage.get<string[]>(RECENT_KEY, []));
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (paletteOpen && !el.open) {
      el.showModal();
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    }
    if (!paletteOpen && el.open) el.close();
  }, [paletteOpen]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(t);
  }, [query]);

  const search = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => analyticsApi.search(debounced),
    enabled: paletteOpen && debounced.length >= 2,
    staleTime: 15_000,
  });

  const close = () => setPaletteOpen(false);

  const remember = (term: string) => {
    if (term.length < 2) return;
    const next = [term, ...recent.filter((r) => r.toLowerCase() !== term.toLowerCase())].slice(0, 6);
    setRecent(next);
    storage.set(RECENT_KEY, next);
  };

  const go = (to: string, term?: string) => {
    if (term) remember(term);
    close();
    navigate(to);
  };

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const pages = ALL_NAV_ITEMS
      .filter((i) => !i.permission || hasPermission(i.permission))
      .filter((i) => !q || `${i.label} ${i.section} ${i.keywords ?? ''}`.toLowerCase().includes(q))
      .slice(0, q ? 5 : 6)
      .map<PaletteItem>((i) => ({ id: `page-${i.to}`, group: 'Go to', label: i.label, hint: i.section, icon: i.icon, run: () => go(i.to) }));

    const actions = QUICK_ACTIONS
      .filter((a) => hasPermission(a.permission) && (!q || a.label.toLowerCase().includes(q)))
      .slice(0, q ? 3 : 4)
      .map<PaletteItem>((a) => ({ id: `action-${a.to}`, group: 'Quick actions', label: a.label, icon: Plus, run: () => go(a.to) }));

    if (!q) {
      const recents = recent.map<PaletteItem>((r) => ({ id: `recent-${r}`, group: 'Recent searches', label: r, icon: Clock, run: () => setQuery(r) }));
      return [...recents, ...actions, ...pages];
    }

    const results: PaletteItem[] = [];
    if (search.data && debounced.length >= 2) {
      for (const group of GROUPS) {
        for (const hit of search.data[group.key]) {
          results.push({
            id: `${group.key}-${hit.id}`,
            group: group.label,
            label: hit.title,
            hint: [hit.subtitle, hit.amountMinor !== undefined ? formatCurrency(hit.amountMinor) : null, hit.status ? statusLabel(hit.status) : null].filter(Boolean).join(' · '),
            icon: group.icon,
            run: () => go(hit.link, query.trim()),
          });
        }
      }
    }
    return [...results, ...pages, ...actions];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, debounced, search.data, recent, hasPermission]);

  useEffect(() => setActive(0), [query, search.data]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); items[active]?.run(); }
  };

  const groups = items.reduce<Record<string, { item: PaletteItem; index: number }[]>>((acc, item, index) => {
    (acc[item.group] ??= []).push({ item, index });
    return acc;
  }, {});

  const searching = debounced.length >= 2 && search.isFetching;
  const noResults = query.trim().length >= 2 && !searching && search.isFetched && items.length === 0;

  return (
    <dialog
      ref={dialog}
      aria-label="Search and commands"
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClose={close}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      className="mt-[12vh] w-[calc(100%-2rem)] max-w-[620px] overflow-hidden rounded-2xl border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-[rgb(10_16_12/0.45)] backdrop:backdrop-blur-[2px] open:animate-pop-in"
    >
      {paletteOpen && (
        <div onKeyDown={onKeyDown}>
          <div className="flex items-center gap-3 border-b border-line px-4">
            {searching ? <Loader2 className="h-[18px] w-[18px] animate-spin text-sage" aria-hidden /> : <Search className="h-[18px] w-[18px] text-faint" aria-hidden />}
            <input
              ref={input}
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-results"
              aria-activedescendant={items[active] ? `palette-${items[active]!.id}` : undefined}
              aria-autocomplete="list"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search orders, products, customers, vendors…"
              className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
            />
            {query ? (
              <button aria-label="Clear" onClick={() => { setQuery(''); input.current?.focus(); }} className="rounded p-1 text-faint hover:text-ink"><X className="h-4 w-4" /></button>
            ) : <span className="kbd">Esc</span>}
          </div>

          <div ref={list} id="palette-results" role="listbox" aria-label="Results" className="max-h-[min(60vh,440px)] overflow-y-auto p-2">
            {search.error && debounced.length >= 2 && (
              <p className="px-3 py-2 text-[13px] text-danger">Search is unavailable right now. Pages and actions still work.</p>
            )}
            {noResults && (
              <div className="px-3 py-10 text-center">
                <p className="text-sm font-medium text-ink">No matches for “{query.trim()}”</p>
                <p className="mt-1 text-[13px] text-muted">Try an order number, SKU, email or store name.</p>
              </div>
            )}
            {query.trim().length === 1 && <p className="px-3 py-2 text-[13px] text-muted">Keep typing to search records…</p>}
            {Object.entries(groups).map(([group, entries]) => (
              <div key={group} role="group" aria-label={group} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-faint">{group}</p>
                {entries.map(({ item, index }) => (
                  <div
                    key={item.id}
                    id={`palette-${item.id}`}
                    role="option"
                    aria-selected={index === active}
                    data-index={index}
                    onMouseMove={() => setActive(index)}
                    onClick={() => item.run()}
                    className={clsx('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2', index === active ? 'bg-surface-2' : '')}
                  >
                    <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line', index === active ? 'bg-surface text-sage' : 'bg-surface-2 text-muted')}>
                      <item.icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{item.label}</span>
                      {item.hint && <span className="block truncate text-xs text-muted">{item.hint}</span>}
                    </span>
                    {index === active && <ArrowRight className="h-3.5 w-3.5 text-faint" aria-hidden />}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 border-t border-line bg-surface-2/60 px-4 py-2.5 text-2xs text-muted">
            <span className="flex items-center gap-1"><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
            <span className="flex items-center gap-1"><span className="kbd"><CornerDownLeft className="h-3 w-3" /></span> open</span>
            <span className="ml-auto flex items-center gap-1"><span className="kbd">Ctrl</span><span className="kbd">K</span> toggle</span>
          </div>
        </div>
      )}
    </dialog>
  );
}
