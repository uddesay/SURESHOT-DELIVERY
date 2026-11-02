import { useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bike, Check, Circle, Heart, LifeBuoy, LogOut, Package, ShoppingBag, Store, Truck, User, X } from 'lucide-react';

import { customerEnvelope, customerRequest } from '../../pages/shop/storeApi';
import { money } from '../../pages/shop/storeFormat';
import { useStore } from '../StoreContext';
import type { OrderDetail, OrderSummary } from '../types';
import { Empty, fmtDate, Img, statusLabel, useLoad } from '../ui';

const flow = ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
const cancellable = ['pending_payment', 'confirmed', 'processing', 'packed'];

export function AccountLayout() {
  const { signedIn, user, signOut } = useStore();
  if (!signedIn) return <Navigate to="/signin" replace state={{ from: '/account' }} />;
  return (
    <div className="ms-wrap">
      <header className="ms-page-head"><span className="ms-eyebrow">Your account</span><h1>Hello{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}.</h1></header>
      <div className="ms-account">
        <nav className="ms-account-nav" aria-label="Account">
          <NavLink to="/account" end><User size={18} /> Overview</NavLink>
          <NavLink to="/account/orders"><Package size={18} /> Orders</NavLink>
          <NavLink to="/wishlist"><Heart size={18} /> Wishlist</NavLink>
          <NavLink to="/help/contact"><LifeBuoy size={18} /> Support</NavLink>
          {user?.roles?.includes('vendor') ? <NavLink to="/seller"><Store size={18} /> Seller panel</NavLink> : <NavLink to="/sell"><Store size={18} /> Sell with us</NavLink>}
          {user?.roles?.includes('delivery_partner') && <NavLink to="/rider"><Bike size={18} /> Delivery jobs</NavLink>}
          <button onClick={() => void signOut()}><LogOut size={18} /> Sign out</button>
        </nav>
        <div><Outlet /></div>
      </div>
    </div>
  );
}

function OrderRow({ o }: { o: OrderSummary }) {
  return (
    <Link to={`/account/orders/${o.id}`} className="ms-order-row">
      <span><b className="ms-num">{o.orderNumber}</b><small>Placed {fmtDate(o.placedAt)}</small></span>
      <span className={`ms-status ${o.status}`}>{statusLabel(o.status)}</span>
      <b className="ms-num">{money(o.totalMinor)}</b>
      <ArrowRight size={18} style={{ color: 'var(--muted)' }} />
    </Link>
  );
}

export function AccountHome() {
  const { user, favoriteIds, bagCount } = useStore();
  const orders = useLoad(() => customerEnvelope<OrderSummary[]>('/orders?page=1&limit=3'), []);
  return (
    <div style={{ display: 'grid', gap: 32 }}>
      <div className="ms-kpis">
        <Link to="/account/orders"><Package size={22} color="var(--royal)" /><b className="ms-num">{orders.data?.meta?.total ?? '—'}</b><span>Orders placed</span></Link>
        <Link to="/wishlist"><Heart size={22} color="var(--royal)" /><b className="ms-num">{favoriteIds.length}</b><span>Saved items</span></Link>
        <Link to="/cart"><ShoppingBag size={22} color="var(--royal)" /><b className="ms-num">{bagCount}</b><span>In your bag</span></Link>
      </div>
      <section>
        <div className="ms-section-head" style={{ marginBottom: 16 }}><h2 style={{ fontSize: 26, marginTop: 0 }}>Recent orders</h2><Link to="/account/orders" className="ms-link">View all <ArrowRight size={16} /></Link></div>
        {orders.loading ? <div className="ms-orders">{[0, 1].map((i) => <div key={i} className="ms-skel" style={{ height: 76 }} />)}</div>
          : orders.data?.data.length ? <div className="ms-orders">{orders.data.data.map((o) => <OrderRow key={o.id} o={o} />)}</div>
            : <Empty icon={<Package size={30} />} title="No orders yet" action={<Link className="ms-btn" to="/shop">Start shopping</Link>}>When you place an order, you can track it here.</Empty>}
      </section>
      <section className="ms-panel"><h2 style={{ fontSize: 22 }}>Profile</h2><p style={{ color: 'var(--muted)' }}>{user?.full_name}<br />{user?.email}</p></section>
    </div>
  );
}

export function Orders() {
  const [page, setPage] = useState(1);
  const list = useLoad(() => customerEnvelope<OrderSummary[]>(`/orders?page=${page}&limit=10`), [page]);
  const pages = list.data?.meta?.totalPages ?? 1;
  if (list.error) return <p className="ms-alert">{list.error} <button className="ms-link" onClick={list.retry}>Retry</button></p>;
  if (list.loading) return <div className="ms-orders">{[0, 1, 2, 3].map((i) => <div key={i} className="ms-skel" style={{ height: 76 }} />)}</div>;
  if (!list.data?.data.length) return <Empty icon={<Package size={30} />} title="No orders yet" action={<Link className="ms-btn" to="/shop">Start shopping</Link>}>Your orders and their delivery progress will appear here.</Empty>;
  return (
    <>
      <div className="ms-orders">{list.data.data.map((o) => <OrderRow key={o.id} o={o} />)}</div>
      {pages > 1 && <nav className="ms-pager"><button className="ms-btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span className="ms-num">Page {page} of {pages}</span><button className="ms-btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></nav>}
    </>
  );
}

export function OrderView() {
  const { id = '' } = useParams();
  const { toast } = useStore();
  const order = useLoad(() => customerRequest<OrderDetail>(`/orders/${id}`), [id]);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);

  if (order.error) return <Empty icon={<Package size={30} />} title="Order not found" action={<Link className="ms-btn" to="/account/orders">Back to orders</Link>}>{order.error}</Empty>;
  if (order.loading || !order.data) return <div style={{ display: 'grid', gap: 16 }}><div className="ms-skel" style={{ height: 60 }} /><div className="ms-skel" style={{ height: 260 }} /></div>;
  const o = order.data;
  const terminal = ['cancelled', 'refunded', 'returned', 'return_requested', 'payment_failed', 'pending_payment'].includes(o.status);
  const reached = flow.indexOf(o.status);
  const history = new Map(o.statusHistory.map((h) => [h.to_status, h.created_at]));
  const addr = o.shipping_address ?? {};

  const cancel = async () => {
    setBusy(true);
    try {
      await customerRequest(`/orders/${o.id}/cancel`, 'POST', { reason });
      toast('Your order has been cancelled');
      setCancelling(false);
      order.retry();
    } catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t cancel this order', { tone: 'error' }); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <Link to="/account/orders" className="ms-link" style={{ color: 'var(--muted)' }}><ArrowLeft size={16} /> All orders</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div><h2 style={{ fontSize: 30 }} className="ms-num">{o.order_number}</h2><p style={{ color: 'var(--muted)', marginTop: 6 }}>Placed {fmtDate(o.created_at)} · {o.payment_method === 'cod' ? 'Cash on delivery' : o.payment_method}</p></div>
        <span className={`ms-status ${o.status}`}>{statusLabel(o.status)}</span>
      </div>

      <div className="ms-two" style={{ paddingBottom: 0, gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
        <section className="ms-panel">
          <h2 style={{ fontSize: 20 }}>Items</h2>
          {o.items.map((i) => (
            <div key={i.id} style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: 14, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
              <div className="ms-line-img" style={{ borderRadius: 10 }}><Img src={i.image_url} alt="" /></div>
              <span>{i.title}<small style={{ display: 'block', color: 'var(--muted)', fontSize: 13 }}>{i.variant_label ? `${i.variant_label} · ` : ''}Qty {i.quantity}</small></span>
              <b className="ms-num">{money(i.line_total_minor)}</b>
            </div>
          ))}
          <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
            <div className="ms-sum-row"><span>Subtotal</span><span>{money(o.subtotal_minor)}</span></div>
            <div className="ms-sum-row"><span>Delivery</span><span>{o.shipping_minor ? money(o.shipping_minor) : 'Free'}</span></div>
            {o.discount_minor > 0 && <div className="ms-sum-row save"><span>Savings</span><span>−{money(o.discount_minor)}</span></div>}
            <div className="ms-sum-row total"><span>Total</span><span>{money(o.total_minor)}</span></div>
          </div>
          {o.shipments.length > 0 && <div style={{ marginTop: 20, display: 'grid', gap: 8 }}>{o.shipments.map((s) => <p key={s.id} style={{ fontSize: 14, color: 'var(--muted)' }}><Truck size={15} style={{ verticalAlign: -3 }} /> {s.vendor_name}: <b style={{ color: 'var(--ink)', textTransform: 'capitalize' }}>{statusLabel(s.status)}</b>{s.courier ? ` · ${s.courier}` : ''}{s.awb_number ? ` · AWB ${s.awb_number}` : ''}</p>)}</div>}
        </section>

        <aside style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
          <section className="ms-panel">
            <h2 style={{ fontSize: 20 }}>Progress</h2>
            {terminal ? (
              <ol className="ms-timeline">{o.statusHistory.map((h) => <li key={h.id} className="done"><i><Check size={14} /></i><span><b>{statusLabel(h.to_status)}</b><small>{fmtDate(h.created_at)}{h.note ? ` · ${h.note}` : ''}</small></span></li>)}</ol>
            ) : (
              <ol className="ms-timeline">
                {flow.map((s, i) => {
                  const state = i < reached ? 'done' : i === reached ? 'now' : '';
                  return <li key={s} className={state}><i>{state ? <Check size={14} /> : <Circle size={10} />}</i><span><b>{statusLabel(s)}</b><small>{history.get(s) ? fmtDate(history.get(s)!) : state ? '' : 'Pending'}</small></span></li>;
                })}
              </ol>
            )}
            {o.cancelled_reason && <p className="ms-alert" style={{ marginTop: 10 }}>Reason: {o.cancelled_reason}</p>}
          </section>
          <section className="ms-panel"><h2 style={{ fontSize: 20 }}>Delivering to</h2><p style={{ color: 'var(--muted)', fontSize: 14 }}>{[addr.recipient_name ?? addr.recipientName, addr.line1, addr.city, addr.state, addr.postal_code ?? addr.postalCode].filter(Boolean).join(', ')}</p></section>
          {cancellable.includes(o.status) && (cancelling ? (
            <section className="ms-panel ms-form">
              <label className="ms-field">Why are you cancelling?<textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={500} placeholder="Ordered by mistake, found a better price…" /></label>
              <div style={{ display: 'flex', gap: 8 }}><button className="ms-btn danger sm" disabled={busy || reason.trim().length < 3} onClick={cancel}>{busy ? 'Cancelling…' : 'Confirm cancellation'}</button><button className="ms-btn ghost sm" onClick={() => setCancelling(false)}><X size={14} /> Keep order</button></div>
            </section>
          ) : <button className="ms-btn danger" onClick={() => setCancelling(true)}>Cancel order</button>)}
        </aside>
      </div>
    </div>
  );
}
