import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Card({ children, className, as: Tag = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'aside' | 'article' }) {
  return <Tag className={clsx('card', className)}>{children}</Tag>;
}

export function CardHeader({
  title, description, action, className,
}: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('p-5', className)}>{children}</div>;
}

/** Label/value pair used in detail panels. */
export function DescriptionList({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={clsx('divide-y divide-line', className)}>
      {items.map((item, i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2.5 text-sm">
          <dt className="shrink-0 text-muted">{item.label}</dt>
          <dd className="min-w-0 text-right font-medium text-ink [overflow-wrap:anywhere]">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
