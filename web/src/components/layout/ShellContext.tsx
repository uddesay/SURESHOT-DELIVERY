import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { analyticsApi, type Overview } from '../../api/analytics';
import { useAuth } from '../../auth/AuthContext';
import { storage } from '../../lib/storage';
import type { Workspace } from './navigation';

interface ShellContextValue {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  workspace: Workspace;
  setWorkspace: (w: Workspace) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  /** Label for the last breadcrumb on detail pages (e.g. an order number). */
  crumb: string | null;
  setCrumb: (label: string | null) => void;
  queues: Overview['queues'] | null;
}

const ShellContext = createContext<ShellContextValue | null>(null);

const today = () => {
  const end = new Date();
  end.setUTCHours(24, 0, 0, 0);
  return { from: new Date(end.getTime() - 86400000).toISOString(), to: end.toISOString() };
};

export function ShellProvider({ children }: { children: ReactNode }) {
  const { hasPermission } = useAuth();
  const [collapsed, setCollapsedState] = useState(() => storage.get('sureshot.admin.sidebarCollapsed', true));
  const [workspace, setWorkspaceState] = useState<Workspace>(() => storage.get<Workspace>('sureshot.admin.workspace', 'platform'));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [crumb, setCrumb] = useState<string | null>(null);

  // Sidebar queue badges come from the same overview endpoint as the dashboard.
  const queues = useQuery({
    queryKey: ['shell-queues'],
    queryFn: () => analyticsApi.overview(today()).then((o) => o.queues),
    enabled: hasPermission('analytics:read'),
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const setCollapsed = useCallback((v: boolean) => { setCollapsedState(v); storage.set('sureshot.admin.sidebarCollapsed', v); }, []);
  const setWorkspace = useCallback((w: Workspace) => { setWorkspaceState(w); storage.set('sureshot.admin.workspace', w); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = useMemo(() => ({
    collapsed, setCollapsed, workspace, setWorkspace, paletteOpen, setPaletteOpen, crumb, setCrumb, queues: queues.data ?? null,
  }), [collapsed, setCollapsed, workspace, setWorkspace, paletteOpen, crumb, queues.data]);

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used within ShellProvider');
  return ctx;
}

/** Detail pages call this to name the final breadcrumb (cleared on unmount). */
export function useBreadcrumb(label: string | null | undefined) {
  const { setCrumb } = useShell();
  useEffect(() => {
    setCrumb(label ?? null);
    return () => setCrumb(null);
  }, [label, setCrumb]);
}
