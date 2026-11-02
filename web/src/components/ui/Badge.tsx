import clsx from 'clsx';
import type { ReactNode } from 'react';

import { humanize } from '../../lib/format';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'brand';

const toneClass: Record<BadgeTone, string> = {
  neutral: 'bg-surface-3 text-ink-2',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  violet: 'bg-violet-soft text-violet',
  brand: 'bg-brand-soft text-sage',
};

const dotClass: Record<BadgeTone, string> = {
  neutral: 'bg-faint',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  violet: 'bg-violet',
  brand: 'bg-sage',
};

export function Badge({ children, tone = 'neutral', dot = false, className }: { children: ReactNode; tone?: BadgeTone; dot?: boolean; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium', toneClass[tone], className)}>
      {dot && <span className={clsx('h-1.5 w-1.5 rounded-full', dotClass[tone])} aria-hidden />}
      {children}
    </span>
  );
}

/** One mapping for every lifecycle status across orders, products, vendors, payouts, returns and tickets. */
const STATUS_TONES: Record<string, BadgeTone> = {
  // orders / shipments
  pending_payment: 'warning', pending: 'warning', confirmed: 'info', processing: 'info', packed: 'info',
  shipped: 'violet', out_for_delivery: 'violet', delivered: 'success', cancelled: 'danger',
  return_requested: 'warning', returned: 'neutral', refunded: 'neutral', payment_failed: 'danger', rto: 'danger',
  // payments
  captured: 'success', authorized: 'info', created: 'neutral', failed: 'danger',
  // products
  draft: 'neutral', pending_approval: 'warning', active: 'success', rejected: 'danger', inactive: 'neutral', archived: 'neutral',
  // vendors
  under_review: 'info', approved: 'success', suspended: 'danger',
  // payouts / returns
  paid: 'success', on_hold: 'danger', requested: 'warning', pickup_scheduled: 'info', picked: 'info', received: 'info',
  refund_initiated: 'info', exchanged: 'success', closed: 'neutral',
  // support
  open: 'info', in_progress: 'warning', waiting_on_customer: 'violet', resolved: 'success',
  // coupons / generic
  scheduled: 'info', expired: 'neutral', disabled: 'neutral', published: 'success', banned: 'danger', deleted: 'neutral',
  low: 'neutral', medium: 'info', high: 'warning', urgent: 'danger',
  in_stock: 'success', low_stock: 'warning', out_of_stock: 'danger',
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  pending_approval: 'In review',
  out_for_delivery: 'Out for delivery',
  waiting_on_customer: 'Waiting on customer',
  under_review: 'In review',
  on_hold: 'On hold',
  rto: 'Returned to origin',
};

export function statusTone(status: string | null | undefined): BadgeTone {
  return STATUS_TONES[status ?? ''] ?? 'neutral';
}

export function statusLabel(status: string | null | undefined): string {
  return STATUS_LABELS[status ?? ''] ?? humanize(status);
}

export function StatusBadge({ status, label, className }: { status: string | null | undefined; label?: string; className?: string }) {
  return <Badge tone={statusTone(status)} dot className={className}>{label ?? statusLabel(status)}</Badge>;
}
