import { motion } from 'motion/react';
import clsx from 'clsx';
import { Check, ChevronsLeft, ChevronsRight, ChevronsUpDown, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import { Dropdown, DropdownLabel } from '../ui/Dropdown';
import { Tooltip } from '../ui/Tooltip';
import { NAV_SECTIONS, WORKSPACES, type NavItem, type Workspace } from './navigation';
import { useShell } from './ShellContext';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-white p-0.5 shadow-card">
        <img src="/brand/icon.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-surface bg-sage" />
      </span>
      {!compact && (
        <span className="font-display text-[19px] font-bold tracking-[-0.04em] text-ink">
          sureshot<span className="text-sage">.</span>
        </span>
      )}
    </span>
  );
}

function NavRow({ item, collapsed, count }: { item: NavItem; collapsed: boolean; count?: number }) {
  return (
    <Tooltip content={collapsed ? (count ? `${item.label} · ${count}` : item.label) : null}>
    <NavLink
      to={item.to}
      end={item.end}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) => clsx(
        'group relative flex items-center rounded-lg text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sage/40',
        collapsed ? 'h-9 w-9 justify-center' : 'h-8 gap-2.5 px-2.5',
        isActive ? 'bg-surface-3 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink',
      )}
    >
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="nav-indicator" className="nav-ind absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r bg-sage" transition={{ type: 'spring', stiffness: 500, damping: 38 }} aria-hidden />}
          <item.icon className={clsx('nav-icon relative z-[1] h-[17px] w-[17px] shrink-0', isActive ? 'text-sage' : 'text-faint group-hover:text-ink-2')} aria-hidden />
          {!collapsed && <span className="relative z-[1] flex-1 truncate">{item.label}</span>}
          {!!count && (
            collapsed
              ? <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-warning" aria-label={`${count} need attention`} />
              : <span className="tabular rounded-md bg-warning-soft px-1.5 text-2xs font-semibold text-warning" aria-label={`${count} need attention`}>{count > 99 ? '99+' : count}</span>
          )}
        </>
      )}
    </NavLink>
    </Tooltip>
  );
}

function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { workspace, setWorkspace } = useShell();
  const current = WORKSPACES[workspace];
  return (
    <Dropdown
      width="w-64"
      className="w-full"
      trigger={(props) => (
        <button
          {...props}
          aria-label={`Workspace: ${current.label}. Change workspace`}
          title={collapsed ? `Workspace: ${current.label}` : undefined}
          className={clsx(
            'flex w-full items-center rounded-lg border border-line bg-surface text-left transition-colors hover:bg-surface-2',
            collapsed ? 'h-9 justify-center' : 'gap-2 px-2.5 py-2',
          )}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand text-[11px] font-bold text-brand-ink">{current.label[0]}</span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-2xs uppercase tracking-wider text-faint">Workspace</span>
                <span className="block truncate text-[13px] font-semibold text-ink">{current.label}</span>
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-faint" aria-hidden />
            </>
          )}
        </button>
      )}
    >
      <DropdownLabel>Switch workspace</DropdownLabel>
      {(Object.keys(WORKSPACES) as Workspace[]).map((key) => (
        <button
          key={key}
          role="menuitemradio"
          aria-checked={key === workspace}
          onClick={() => setWorkspace(key)}
          className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none hover:bg-surface-2 focus:bg-surface-2"
        >
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-[11px] font-bold text-sage">{WORKSPACES[key].label[0]}</span>
          <span className="flex-1">
            <span className="block text-[13px] font-medium text-ink">{WORKSPACES[key].label}</span>
            <span className="block text-xs text-muted">{WORKSPACES[key].description}</span>
          </span>
          {key === workspace && <Check className="mt-1 h-4 w-4 text-sage" aria-hidden />}
        </button>
      ))}
    </Dropdown>
  );
}

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { hasPermission } = useAuth();
  const { collapsed: collapsedPref, setCollapsed, workspace, queues } = useShell();
  const scope = WORKSPACES[workspace].sections;
  // The mobile drawer always shows labels.
  const collapsed = collapsedPref && !mobileOpen;

  const sections = NAV_SECTIONS
    .filter((s) => scope === 'all' || scope.includes(s.id))
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.permission || hasPermission(i.permission)) }))
    .filter((s) => s.items.length);

  return (
    <aside
      aria-label="Primary"
      className={clsx(
        'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-line bg-surface print:hidden transition-[width,transform] duration-200 ease-out lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:translate-x-0',
        collapsed ? 'w-[68px]' : 'w-[248px]',
        mobileOpen ? 'translate-x-0 shadow-drawer' : '-translate-x-full',
      )}
    >
      <div className={clsx('flex h-16 shrink-0 items-center', collapsed ? 'justify-center px-2' : 'justify-between px-5')}>
        <NavLink to="/dashboard" aria-label="Sureshot admin home" className="rounded-lg">
          <BrandMark compact={collapsed} />
        </NavLink>
        <button aria-label="Close navigation" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 lg:hidden">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className={clsx('pb-3', collapsed ? 'px-3.5' : 'px-4')}>
        <WorkspaceSwitcher collapsed={collapsed} />
      </div>

      <nav className={clsx('nav-scroll flex-1 overflow-y-auto pb-4', collapsed ? 'px-3.5' : 'px-4')}>
        {sections.map((section) => (
          <div key={section.id} className="mt-4 first:mt-1">
            {collapsed
              ? <div className="mx-auto mb-2 h-px w-6 bg-line" aria-hidden />
              : <p className="mb-1.5 px-2.5 text-2xs font-semibold uppercase tracking-[0.14em] text-faint">{section.title}</p>}
            <div className={clsx('space-y-0.5', collapsed && 'flex flex-col items-center')}>
              {section.items.map((item) => (
                <NavRow key={item.to} item={item} collapsed={collapsed} count={item.queue ? queues?.[item.queue] : undefined} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className={clsx('hidden shrink-0 border-t border-line py-3 lg:block', collapsed ? 'px-3.5' : 'px-4')}>
        <button
          onClick={() => setCollapsed(!collapsedPref)}
          aria-label={collapsedPref ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsedPref}
          className={clsx('flex h-8 items-center gap-2 rounded-lg text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-ink', collapsed ? 'w-9 justify-center' : 'w-full px-2.5')}
        >
          {collapsedPref ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
        </button>
      </div>
    </aside>
  );
}
