import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  CheckCircle2, Circle, CreditCard, ExternalLink, Mail, MapPin, MessageSquare, Package, Phone, Printer, RotateCcw, Truck, UserRound, XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { availableFulfillment, CANCELLABLE, formatAddress, FULFILLMENT_LABELS, ordersApi, type OrderDetail } from '../../api/commerce';
import { useAuth } from '../../auth/AuthContext';
import { useBreadcrumb } from '../../components/layout/ShellContext';
import { BrandMark } from '../../components/layout/Sidebar';
import { StatusBadge, statusLabel } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, DescriptionList } from '../../components/ui/Card';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Field, Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { formatCurrency, formatDateTime, humanize } from '../../lib/format';
import { useCancelOrder, useFulfill } from './OrderRowActions';

const STAGES = ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];

interface TimelineEntry { id: string; at: string; title: string; detail?: string | null; tone: 'done' | 'danger' | 'info' }

function buildTimeline(o: OrderDetail): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { id: 'placed', at: o.placed_at ?? o.created_at, title: 'Order placed', detail: `${o.items.reduce((s, i) => s + i.quantity, 0)} item(s) · ${formatCurrency(o.total_minor)} · ${o.payment_method.toUpperCase()}`, tone: 'done' },
    ...o.statusHistory.map((h) => ({
      id: `h-${h.id}`,
      at: h.created_at,
      title: statusLabel(h.to_status),
      detail: [h.note, h.actor_name ? `by ${h.actor_name}` : null].filter(Boolean).join(' · ') || null,
      tone: (['cancelled', 'payment_failed'].includes(h.to_status) ? 'danger' : 'done') as TimelineEntry['tone'],
    })),
    ...o.payments.filter((p) => p.captured_at).map((p) => ({ id: `p-${p.id}`, at: p.captured_at!, title: 'Payment captured', detail: `${formatCurrency(p.amount_minor)} via ${p.provider}`, tone: 'done' as const })),
    ...o.trackingEvents.map((e) => ({ id: `t-${e.id}`, at: e.occurred_at, title: `Shipment ${statusLabel(e.status).toLowerCase()}`, detail: [e.description, e.location].filter(Boolean).join(' · ') || null, tone: 'info' as const })),
    ...o.refunds.map((r) => ({ id: `r-${r.id}`, at: r.created_at, title: 'Refund issued', detail: `${formatCurrency(r.amount_minor)} to ${r.destination} · ${r.status}`, tone: 'info' as const })),
    ...o.returns.map((r) => ({ id: `ret-${r.id}`, at: r.created_at, title: `${humanize(r.request_type)} requested`, detail: `${r.reason} · ${statusLabel(r.status)}`, tone: 'info' as const })),
  ];
  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function OrderDetailPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { hasPermission } = useAuth();
  const order = useQuery({ queryKey: ['admin-order', id], queryFn: () => ordersApi.get(id!) });
  const cancel = useCancelOrder();
  const fulfill = useFulfill();
  const [shipOpen, setShipOpen] = useState(false);
  const [courier, setCourier] = useState('manual');
  const [awb, setAwb] = useState('');

  useBreadcrumb(order.data?.order_number);

  // ?print=1 (from list actions) opens the browser print dialog once loaded.
  useEffect(() => {
    if (params.get('print') && order.data) {
      const t = window.setTimeout(() => window.print(), 300);
      setParams((p) => { const n = new URLSearchParams(p); n.delete('print'); return n; }, { replace: true });
      return () => window.clearTimeout(t);
    }
  }, [params, order.data, setParams]);

  useEffect(() => {
    if (order.data && window.location.hash === '#fulfillment') document.getElementById('fulfillment')?.scrollIntoView({ behavior: 'smooth' });
  }, [order.data]);

  const timeline = useMemo(() => (order.data ? buildTimeline(order.data) : []), [order.data]);

  if (order.isLoading) return <PageSkeleton />;
  if (order.error || !order.data) return <Card><ErrorState message="This order couldn’t be loaded." error={order.error} onRetry={() => void order.refetch()} /></Card>;

  const o = order.data;
  const actions = hasPermission('orders:fulfill') ? availableFulfillment(o.status) : [];
  const canCancel = hasPermission('orders:cancel') && CANCELLABLE.includes(o.status);
  const stageIndex = STAGES.indexOf(o.status);
  const terminal = ['cancelled', 'payment_failed', 'refunded', 'returned'].includes(o.status);
  const byVendor = o.items.reduce<Record<string, typeof o.items>>((acc, item) => { (acc[item.vendor_name ?? 'Vendor'] ??= []).push(item); return acc; }, {});
  const shipping = formatAddress(o.shipping_address);
  const billing = formatAddress(o.billing_address);
  const paid = o.payments.filter((p) => p.status === 'captured').reduce((s, p) => s + p.amount_minor, 0);
  const refunded = o.refunds.reduce((s, r) => s + r.amount_minor, 0);

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          back={{ to: '/orders', label: 'Orders' }}
          title={<span className="font-mono">{o.order_number}</span>}
          meta={<StatusBadge status={o.status} />}
          description={`Placed ${formatDateTime(o.placed_at ?? o.created_at)} · ${o.customer?.full_name ?? 'Customer'}`}
          actions={
            <>
              <Button variant="outline" size="sm" className="h-9" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print invoice</Button>
              {o.customer?.email && <Button variant="outline" size="sm" className="h-9" onClick={() => { window.location.href = `mailto:${o.customer!.email}?subject=${encodeURIComponent(`Your Sureshot order ${o.order_number}`)}`; }}><Mail className="h-4 w-4" /> Email customer</Button>}
              {canCancel && <Button variant="outline" size="sm" className="h-9 text-danger hover:bg-danger-soft" onClick={() => void cancel(o)}><XCircle className="h-4 w-4" /> Cancel & refund</Button>}
            </>
          }
        />

        {/* Progress */}
        <Card className="mb-5 p-5">
          {terminal ? (
            <div className="flex items-center gap-3 text-sm">
              <XCircle className="h-5 w-5 text-danger" />
              <div><p className="font-medium text-ink">{statusLabel(o.status)}</p>{o.cancelled_reason && <p className="text-muted">{o.cancelled_reason}</p>}</div>
            </div>
          ) : (
            <ol className="grid grid-cols-3 gap-y-4 sm:grid-cols-6" aria-label="Fulfilment progress">
              {STAGES.map((s, i) => {
                const done = stageIndex >= i;
                const current = stageIndex === i;
                return (
                  <li key={s} className="relative flex flex-col items-center text-center" aria-current={current ? 'step' : undefined}>
                    {i > 0 && <span className={clsx('absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2', stageIndex >= i ? 'bg-sage' : 'bg-line')} aria-hidden />}
                    <span className={clsx('relative z-10 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-surface', done ? 'bg-sage text-white' : 'bg-surface-3 text-faint')}>
                      {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
                    </span>
                    <span className={clsx('mt-2 text-xs', current ? 'font-semibold text-ink' : done ? 'text-ink-2' : 'text-faint')}>{statusLabel(s)}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {o.status === 'pending_payment' && <p className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">Waiting for the online payment to complete. It confirms automatically once the payment provider reports success.</p>}
        </Card>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-5">
            {actions.length > 0 && (
              <Card>
                <div id="fulfillment" className="flex flex-wrap items-center gap-3 p-5">
                  <Truck className="h-5 w-5 text-sage" />
                  <div className="mr-auto">
                    <p className="text-sm font-semibold text-ink">Next fulfilment step</p>
                    <p className="text-xs text-muted">Applies to every vendor shipment at this stage. Vendors normally do this themselves.</p>
                  </div>
                  {actions.map((a, i) => (
                    <Button key={a} size="sm" variant={i === 0 ? 'primary' : 'outline'} isLoading={fulfill.isPending && fulfill.variables?.action === a} disabled={fulfill.isPending}
                      onClick={() => (a === 'ship' ? setShipOpen(true) : fulfill.mutate({ id: o.id, action: a }))}>
                      {FULFILLMENT_LABELS[a]}
                    </Button>
                  ))}
                </div>
              </Card>
            )}

            <Card>
              <CardHeader title="Items" description={`${Object.keys(byVendor).length} vendor${Object.keys(byVendor).length === 1 ? '' : 's'} · ${o.items.reduce((s, i) => s + i.quantity, 0)} units`} />
              {Object.entries(byVendor).map(([vendor, items]) => {
                const shipment = o.shipments.find((s) => s.vendor_id === items[0]!.vendor_id);
                return (
                  <div key={vendor} className="border-b border-line last:border-0">
                    <div className="flex flex-wrap items-center gap-2 bg-surface-2/60 px-5 py-2.5 text-xs">
                      <Link to={`/vendors/${items[0]!.vendor_id}`} className="font-semibold text-ink hover:underline">{vendor}</Link>
                      {shipment && <StatusBadge status={shipment.status} />}
                      {shipment?.awb_number && <span className="text-muted">· {shipment.courier} {shipment.awb_number}</span>}
                      {shipment?.tracking_url && <a href={shipment.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sage hover:underline">Track <ExternalLink className="h-3 w-3" /></a>}
                      <span className="tabular ml-auto text-muted">Commission {formatCurrency(items.reduce((s, i) => s + i.commission_minor, 0))}</span>
                    </div>
                    <ul className="divide-y divide-line">
                      {items.map((item) => (
                        <li key={item.id} className="flex items-center gap-4 px-5 py-3">
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2">{item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" /> : <Package className="m-3 h-6 w-6 text-faint" />}</div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-sm font-medium text-ink">{item.title}</p>
                            <p className="text-xs text-muted">{[item.variant_label, `SKU ${item.sku}`].filter(Boolean).join(' · ')}</p>
                          </div>
                          <p className="tabular hidden text-sm text-muted sm:block">{formatCurrency(item.unit_price_minor)} × {item.quantity}</p>
                          <p className="tabular w-24 text-right text-sm font-medium text-ink">{formatCurrency(item.line_total_minor)}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              <div className="space-y-1.5 border-t border-line px-5 py-4 text-sm">
                <div className="flex justify-between text-muted"><span>Subtotal</span><span className="tabular">{formatCurrency(o.subtotal_minor)}</span></div>
                {o.discount_minor > 0 && <div className="flex justify-between text-success"><span>Discount{o.coupon_code ? ` (${o.coupon_code})` : ''}</span><span className="tabular">−{formatCurrency(o.discount_minor)}</span></div>}
                <div className="flex justify-between text-muted"><span>Shipping</span><span className="tabular">{o.shipping_minor ? formatCurrency(o.shipping_minor) : 'Free'}</span></div>
                <div className="flex justify-between text-muted"><span>Tax (included)</span><span className="tabular">{formatCurrency(o.tax_minor)}</span></div>
                {Number(o.wallet_used_minor) > 0 && <div className="flex justify-between text-muted"><span>Paid from wallet</span><span className="tabular">−{formatCurrency(Number(o.wallet_used_minor))}</span></div>}
                <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-ink"><span>Total</span><span className="tabular">{formatCurrency(o.total_minor)}</span></div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Timeline" description="Status changes, payments, shipment tracking and refunds" />
              <ol className="relative px-5 py-5">
                {timeline.map((e, i) => (
                  <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < timeline.length - 1 && <span className="absolute left-[7px] top-5 h-full w-px bg-line" aria-hidden />}
                    <span className={clsx('relative z-10 mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-[3px] border-surface ring-1', e.tone === 'danger' ? 'bg-danger ring-danger/30' : e.tone === 'info' ? 'bg-info ring-info/30' : 'bg-sage ring-sage/30', i === 0 && 'shadow-[0_0_0_4px_rgb(var(--c-brand-soft))]')} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-sm font-medium text-ink">{e.title}</p>
                        <time className="text-xs text-faint" dateTime={e.at}>{formatDateTime(e.at)}</time>
                      </div>
                      {e.detail && <p className="mt-0.5 text-[13px] text-muted">{e.detail}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          <div className="space-y-5">
            <Card>
              <CardHeader title="Customer" action={o.customer && hasPermission('users:read') && <Link to={`/customers/${o.customer.id}`} className="text-xs font-medium text-sage hover:underline">View profile</Link>} />
              <div className="space-y-2 p-5 text-sm">
                <p className="flex items-center gap-2 font-medium text-ink"><UserRound className="h-4 w-4 text-faint" /> {o.customer?.full_name ?? '—'}</p>
                {o.customer?.email && <a href={`mailto:${o.customer.email}`} className="flex items-center gap-2 text-ink-2 hover:text-ink"><Mail className="h-4 w-4 text-faint" /> {o.customer.email}</a>}
                {o.customer?.phone && <a href={`tel:${o.customer.phone}`} className="flex items-center gap-2 text-ink-2 hover:text-ink"><Phone className="h-4 w-4 text-faint" /> {o.customer.phone}</a>}
              </div>
            </Card>
            <Card>
              <CardHeader title="Addresses" />
              <div className="grid gap-5 p-5 text-sm sm:grid-cols-2 xl:grid-cols-1">
                <div><p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-faint"><MapPin className="h-3.5 w-3.5" /> Shipping</p>{shipping.map((l, i) => <p key={i} className={i === 0 ? 'font-medium text-ink' : 'text-ink-2'}>{l}</p>)}</div>
                <div><p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-faint">Billing</p>{billing.length ? billing.map((l, i) => <p key={i} className="text-ink-2">{l}</p>) : <p className="text-muted">Same as shipping</p>}</div>
              </div>
            </Card>
            <Card>
              <CardHeader title="Payment" />
              <div className="px-5 pb-2 pt-1">
                <DescriptionList items={[
                  { label: 'Method', value: o.payment_method.toUpperCase() },
                  { label: 'Paid', value: formatCurrency(paid) },
                  { label: 'Refunded', value: refunded ? formatCurrency(refunded) : '—' },
                ]} />
              </div>
              {o.payments.length > 0 && (
                <ul className="divide-y divide-line border-t border-line">
                  {o.payments.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
                      <CreditCard className="h-4 w-4 text-faint" />
                      <div className="min-w-0 flex-1"><p className="font-medium capitalize text-ink">{p.provider}</p><p className="truncate text-xs text-faint">{p.provider_payment_id ?? formatDateTime(p.created_at)}{p.failure_reason ? ` · ${p.failure_reason}` : ''}</p></div>
                      <span className="tabular">{formatCurrency(p.amount_minor)}</span>
                      <StatusBadge status={p.status} />
                    </li>
                  ))}
                </ul>
              )}
              {['delivered', 'return_requested'].includes(o.status) && (
                <p className="border-t border-line px-5 py-3 text-xs text-muted">Refunds for delivered orders run through the <Link to="/returns" className="font-medium text-sage hover:underline">returns workflow</Link>.</p>
              )}
            </Card>
            {(o.returns.length > 0) && (
              <Card>
                <CardHeader title="Returns" action={<Link to="/returns" className="text-xs font-medium text-sage hover:underline">Manage</Link>} />
                <ul className="divide-y divide-line">
                  {o.returns.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-[13px]"><RotateCcw className="h-4 w-4 text-faint" /><span className="flex-1">{humanize(r.request_type)} · {r.reason}</span><StatusBadge status={r.status} /></li>
                  ))}
                </ul>
              </Card>
            )}
            <Card>
              <CardHeader title="Notes" />
              <div className="space-y-3 p-5 text-sm">
                {o.customer_note ? <p className="flex gap-2 text-ink-2"><MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-faint" /> “{o.customer_note}”</p> : <EmptyState compact icon={MessageSquare} title="No customer note" className="!py-2" />}
                {o.cancelled_reason && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">Cancellation: {o.cancelled_reason}</p>}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Printable invoice (only rendered on paper) */}
      <section className="hidden text-black print:block" aria-hidden>
        <div className="flex items-start justify-between border-b border-black/20 pb-4">
          <BrandMark />
          <div className="text-right text-sm"><p className="text-lg font-semibold">Tax invoice</p><p>Order {o.order_number}</p><p>{formatDateTime(o.placed_at ?? o.created_at)}</p></div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
          <div><p className="font-semibold">Ship to</p>{shipping.map((l, i) => <p key={i}>{l}</p>)}</div>
          <div><p className="font-semibold">Bill to</p>{(billing.length ? billing : shipping).map((l, i) => <p key={i}>{l}</p>)}</div>
        </div>
        <table className="mt-6 w-full border-collapse text-sm">
          <thead><tr className="border-b border-black/30 text-left"><th className="py-2">Item</th><th>Sold by</th><th className="text-right">Qty</th><th className="text-right">Unit</th><th className="text-right">Tax</th><th className="text-right">Total</th></tr></thead>
          <tbody>{o.items.map((i) => <tr key={i.id} className="border-b border-black/10"><td className="py-2">{i.title}<br /><span className="text-xs">SKU {i.sku}</span></td><td>{i.vendor_name}</td><td className="text-right">{i.quantity}</td><td className="text-right">{formatCurrency(i.unit_price_minor)}</td><td className="text-right">{formatCurrency(i.tax_minor)}</td><td className="text-right">{formatCurrency(i.line_total_minor)}</td></tr>)}</tbody>
        </table>
        <div className="ml-auto mt-4 w-64 space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(o.subtotal_minor)}</span></div>
          {o.discount_minor > 0 && <div className="flex justify-between"><span>Discount</span><span>−{formatCurrency(o.discount_minor)}</span></div>}
          <div className="flex justify-between"><span>Shipping</span><span>{formatCurrency(o.shipping_minor)}</span></div>
          <div className="flex justify-between border-t border-black/30 pt-1 font-semibold"><span>Total ({o.payment_method.toUpperCase()})</span><span>{formatCurrency(o.total_minor)}</span></div>
        </div>
        <p className="mt-10 text-xs">Prices include GST. This invoice was generated by Sureshot for the order above.</p>
      </section>

      <Modal
        open={shipOpen}
        onClose={() => setShipOpen(false)}
        title="Mark as shipped"
        description="Records a courier handoff for every packed shipment on this order."
        size="sm"
        footer={<><Button variant="outline" onClick={() => setShipOpen(false)}>Cancel</Button><Button isLoading={fulfill.isPending} onClick={() => fulfill.mutate({ id: o.id, action: 'ship', courier, awbNumber: awb.trim() || undefined }, { onSuccess: () => setShipOpen(false) })}>Mark shipped</Button></>}
      >
        <div className="space-y-4">
          <Field label="Courier">
            <Select value={courier} onChange={(e) => setCourier(e.target.value)}>
              <option value="manual">Self / manual handoff</option><option value="shiprocket">Shiprocket</option><option value="delhivery">Delhivery</option><option value="bluedart">Blue Dart</option>
            </Select>
          </Field>
          <Field label="AWB / tracking number" hint="Optional, shown to the customer."><Input value={awb} maxLength={60} onChange={(e) => setAwb(e.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  );
}
