import { useEffect, type RefObject } from 'react';

/** Keep keyboard focus inside an open navigation drawer and restore its trigger. */
export function useNavigationDrawer(ref: RefObject<HTMLElement>, open: boolean) {
  useEffect(() => {
    const drawer = ref.current;
    if (!open || !drawer) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(drawer.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]',
    )).filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', trap);
      previous?.focus();
    };
  }, [ref, open]);
}
