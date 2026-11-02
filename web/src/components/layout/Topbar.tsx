import {
  BookOpen, ChevronRight, CircleHelp, ExternalLink, Keyboard, LogOut, Menu, Monitor, Moon, Plus, Search, Sun, UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../lib/theme';
import { Avatar } from '../ui/Avatar';
import { Button, IconButton } from '../ui/Button';
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '../ui/Dropdown';
import { Modal } from '../ui/Modal';
import { useConfirm } from '../ui/ConfirmDialog';
import { QUICK_ACTIONS } from './CommandPalette';
import { NAV_SECTIONS, SEGMENT_LABELS, WORKSPACES } from './navigation';
import { NotificationBell } from './NotificationBell';
import { useShell } from './ShellContext';

function useBreadcrumbs() {
  const { pathname } = useLocation();
  const { crumb } = useShell();
  let best: { section: string; label: string; to: string } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if ((pathname === item.to || pathname.startsWith(`${item.to}/`)) && (!best || item.to.length > best.to.length)) {
        best = { section: section.title, label: item.label, to: item.to };
      }
    }
  }
  if (!best) return [{ label: 'Dashboard' }];
  const crumbs: { label: string; to?: string }[] = [{ label: best.section }, { label: best.label, to: best.to }];
  const rest = pathname.slice(best.to.length).split('/').filter(Boolean);
  if (rest.length) crumbs.push({ label: crumb ?? SEGMENT_LABELS[rest[0]!] ?? 'Details' });
  return crumbs;
}

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], label: 'Open search & commands' },
  { keys: ['↑', '↓'], label: 'Move through results and menus' },
  { keys: ['Enter'], label: 'Open the highlighted result' },
  { keys: ['Esc'], label: 'Close dialogs, drawers and menus' },
  { keys: ['Ctrl', 'S'], label: 'Save in the product editor' },
];

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { user, logout, hasPermission } = useAuth();
  const { preference, setPreference, resolved, toggle } = useTheme();
  const { setPaletteOpen, workspace } = useShell();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const crumbs = useBreadcrumbs();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const quick = QUICK_ACTIONS.filter((a) => hasPermission(a.permission));

  const signOut = async () => {
    if (await confirm({ title: 'Sign out of Sureshot?', description: 'You’ll need to sign in again to manage the platform.', confirmLabel: 'Sign out' }) === false) return;
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="commerce-topbar sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md print:hidden md:px-6">
      <IconButton label="Open navigation" onClick={onOpenNav} className="lg:hidden"><Menu className="h-5 w-5" /></IconButton>

      <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 md:block">
        <ol className="flex items-center gap-1.5 text-[13px]">
          <li className="hidden xl:block">
            <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider text-sage">{WORKSPACES[workspace].label}</span>
          </li>
          {crumbs.map((c, i) => (
            <li key={i} className="flex min-w-0 items-center gap-1.5">
              <ChevronRight className={i === 0 ? 'hidden h-3.5 w-3.5 text-faint xl:block' : 'h-3.5 w-3.5 text-faint'} aria-hidden />
              {c.to && i < crumbs.length - 1 ? (
                <Link to={c.to} className="truncate text-muted hover:text-ink">{c.label}</Link>
              ) : (
                <span aria-current={i === crumbs.length - 1 ? 'page' : undefined} className={i === crumbs.length - 1 ? 'truncate font-medium text-ink' : 'truncate text-muted'}>{c.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex flex-1 items-center justify-end gap-1.5 md:flex-none">
        <button
          onClick={() => setPaletteOpen(true)}
          aria-label="Search (Ctrl+K)"
          className="group flex h-9 items-center gap-2 rounded-lg border border-line bg-surface-2/70 pl-3 pr-1.5 text-[13px] text-faint transition-colors hover:border-line-strong hover:bg-surface sm:w-64 lg:w-72"
        >
          <Search className="h-4 w-4" aria-hidden />
          <span className="hidden flex-1 text-left sm:inline">Search anything…</span>
          <span className="hidden items-center gap-0.5 sm:flex"><span className="kbd">{isMac ? '⌘' : 'Ctrl'}</span><span className="kbd">K</span></span>
        </button>

        {quick.length > 0 && (
          <Dropdown
            align="end"
            trigger={(props) => (
              <Button {...props} size="sm" className="hidden h-9 sm:inline-flex" aria-label="Quick create">
                <Plus className="h-4 w-4" /> <span className="hidden lg:inline">Create</span>
              </Button>
            )}
          >
            <DropdownLabel>Create new</DropdownLabel>
            {quick.map((a) => <DropdownItem key={a.to} icon={Plus} onSelect={() => navigate(a.to)}>{a.label}</DropdownItem>)}
          </Dropdown>
        )}

        <NotificationBell />

        <Dropdown
          align="end"
          trigger={(props) => <IconButton {...props} label="Help" className="hidden sm:inline-flex"><CircleHelp className="h-[18px] w-[18px]" /></IconButton>}
        >
          <DropdownLabel>Help</DropdownLabel>
          <DropdownItem icon={Keyboard} onSelect={() => setShortcutsOpen(true)}>Keyboard shortcuts</DropdownItem>
          <DropdownItem icon={BookOpen} onSelect={() => window.open('/api/v1/docs', '_blank', 'noopener')}>API reference</DropdownItem>
          <DropdownItem icon={CircleHelp} onSelect={() => navigate('/support/tickets')} disabled={!hasPermission('support:manage')}>Support inbox</DropdownItem>
        </Dropdown>

        <IconButton label="Preview storefront (opens in a new tab)" className="hidden sm:inline-flex" onClick={() => window.open('/', '_blank', 'noopener')}>
          <ExternalLink className="h-[18px] w-[18px]" />
        </IconButton>

        <IconButton label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggle}>
          {resolved === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </IconButton>

        <Dropdown
          align="end"
          width="w-64"
          trigger={(props) => (
            <button {...props} aria-label="Account menu" className="ml-1 flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-surface-2">
              <Avatar name={user?.fullName} size="sm" />
            </button>
          )}
        >
          <div className="flex items-center gap-3 px-2.5 py-2">
            <Avatar name={user?.fullName} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-ink">{user?.fullName}</p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
              <p className="mt-0.5 text-2xs uppercase tracking-wider text-sage">{user?.roles.join(' · ').replace(/_/g, ' ')}</p>
            </div>
          </div>
          <DropdownSeparator />
          <DropdownLabel>Theme</DropdownLabel>
          <div className="grid grid-cols-3 gap-1 px-1.5 pb-1.5" role="group" aria-label="Theme">
            {([['light', Sun], ['dark', Moon], ['system', Monitor]] as const).map(([value, Icon]) => (
              <button
                key={value}
                role="menuitemradio"
                aria-checked={preference === value}
                onClick={() => setPreference(value)}
                className={`flex flex-col items-center gap-1 rounded-lg py-2 text-2xs capitalize outline-none transition-colors focus:ring-2 focus:ring-sage/30 ${preference === value ? 'bg-surface-3 text-ink' : 'text-muted hover:bg-surface-2'}`}
              >
                <Icon className="h-4 w-4" /> {value}
              </button>
            ))}
          </div>
          <DropdownSeparator />
          {user?.id && hasPermission('users:read') && <DropdownItem icon={UserRound} onSelect={() => navigate(`/staff/${user.id}`)}>My account</DropdownItem>}
          <DropdownItem icon={LogOut} tone="danger" onSelect={() => void signOut()}>Sign out</DropdownItem>
        </Dropdown>
      </div>

      <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts" size="sm">
        <ul className="divide-y divide-line">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
              <span className="text-ink-2">{s.label}</span>
              <span className="flex gap-1">{s.keys.map((k) => <span key={k} className="kbd">{k === 'Ctrl' && isMac ? '⌘' : k}</span>)}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </header>
  );
}
