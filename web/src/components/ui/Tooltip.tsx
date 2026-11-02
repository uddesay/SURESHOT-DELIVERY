import { cloneElement, useId, useState, type FocusEvent, type MouseEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

type Side = 'right' | 'bottom';

/**
 * Tooltip shown on hover and keyboard focus, rendered in a fixed portal so it
 * escapes scroll containers. Disabled when `content` is null.
 */
export function Tooltip({ content, children, side = 'right' }: { content: string | null; children: ReactElement; side?: Side }) {
  const id = useId();
  const [rect, setRect] = useState<DOMRect | null>(null);
  if (!content) return children;

  const show = (e: MouseEvent | FocusEvent) => setRect((e.currentTarget as HTMLElement).getBoundingClientRect());
  const hide = () => setRect(null);
  const props = children.props as Record<string, unknown>;

  return (
    <>
      {cloneElement(children as ReactElement<Record<string, unknown>>, {
        'aria-describedby': rect ? id : undefined,
        onMouseEnter: (e: MouseEvent) => { show(e); (props.onMouseEnter as ((e: MouseEvent) => void) | undefined)?.(e); },
        onMouseLeave: hide,
        onFocus: (e: FocusEvent) => { show(e); (props.onFocus as ((e: FocusEvent) => void) | undefined)?.(e); },
        onBlur: hide,
      })}
      {rect && createPortal(
        <span
          id={id}
          role="tooltip"
          style={side === 'right'
            ? { position: 'fixed', top: rect.top + rect.height / 2, left: rect.right + 10, transform: 'translateY(-50%)' }
            : { position: 'fixed', top: rect.bottom + 8, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' }}
          className="pointer-events-none z-[90] whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-canvas shadow-pop animate-fade-in"
        >
          {content}
        </span>,
        document.body,
      )}
    </>
  );
}
