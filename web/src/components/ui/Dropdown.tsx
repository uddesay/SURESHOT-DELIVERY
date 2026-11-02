import clsx from 'clsx';
import { Check } from 'lucide-react';
import {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState,
  type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

const CloseContext = createContext<() => void>(() => undefined);

type TriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-expanded': boolean; 'aria-haspopup': 'menu' };

/**
 * Accessible menu button: Enter/Space/ArrowDown opens, arrows move between
 * items, Escape closes and returns focus to the trigger.
 */
export function Dropdown({
  trigger, children, align = 'start', width = 'w-56', className,
}: {
  trigger: (props: TriggerProps) => ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  width?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left?: number; right?: number; maxHeight: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback(() => setOpen(false), []);

  // Rendered in a fixed-position portal so table/overflow containers never clip it.
  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const place = () => {
      const rect = root.current!.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const openUp = below < 220 && above > below;
      const maxHeight = Math.max(160, Math.min(420, openUp ? above : below));
      setPosition({
        top: openUp ? Math.max(8, rect.top - 6 - Math.min(maxHeight, menu.current?.offsetHeight ?? maxHeight)) : rect.bottom + 6,
        ...(align === 'end' ? { right: Math.max(8, window.innerWidth - rect.right) } : { left: Math.max(8, rect.left) }),
        maxHeight,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!root.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    requestAnimationFrame(() => menu.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus());
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onMenuKey = (e: KeyboardEvent) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(index + 1) % items.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus(); }
    if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
      if (e.key === 'Escape') root.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus();
    }
  };

  return (
    <div ref={root} className={clsx('relative inline-flex', className)}>
      {trigger({
        'aria-expanded': open,
        'aria-haspopup': 'menu',
        'aria-controls': open ? id : undefined,
        onClick: (e) => { e.stopPropagation(); setOpen((v) => !v); },
        onKeyDown: (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } },
      })}
      {open && createPortal(
        <div
          ref={menu}
          id={id}
          role="menu"
          onKeyDown={onMenuKey}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: position?.top ?? -9999, left: position?.left, right: position?.right, maxHeight: position?.maxHeight }}
          className={clsx('z-[70] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 text-ink shadow-pop animate-pop-in', width)}
        >
          <CloseContext.Provider value={close}>{children}</CloseContext.Provider>
        </div>,
        // Inside an open <dialog>, portal into it so the menu stays above the top layer.
        (root.current?.closest('dialog') as HTMLElement | null) ?? document.body,
      )}
    </div>
  );
}

export function DropdownItem({
  children, onSelect, icon: Icon, tone = 'default', disabled, shortcut,
}: {
  children: ReactNode;
  onSelect: () => void;
  icon?: typeof Check;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  shortcut?: string;
}) {
  const close = useContext(CloseContext);
  return (
    <button
      role="menuitem"
      type="button"
      disabled={disabled}
      onClick={() => { close(); onSelect(); }}
      className={clsx(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] outline-none transition-colors disabled:pointer-events-none disabled:opacity-40',
        tone === 'danger' ? 'text-danger hover:bg-danger-soft focus:bg-danger-soft' : 'text-ink hover:bg-surface-2 focus:bg-surface-2',
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-2xs text-faint">{shortcut}</span>}
    </button>
  );
}

export function DropdownCheckItem({ children, checked, onCheckedChange }: { children: ReactNode; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <button
      role="menuitemcheckbox"
      aria-checked={checked}
      type="button"
      onClick={() => onCheckedChange(!checked)}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink outline-none transition-colors hover:bg-surface-2 focus:bg-surface-2"
    >
      <span className={clsx('flex h-4 w-4 items-center justify-center rounded border', checked ? 'border-sage bg-sage text-white' : 'border-line-strong')}>
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      {children}
    </button>
  );
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">{children}</p>;
}

export function DropdownSeparator() {
  return <div role="separator" className="my-1 h-px bg-line" />;
}
