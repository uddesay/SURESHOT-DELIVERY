import { useEffect, useState } from 'react';
import { Bike, CheckCircle2, History, Loader2, MapPin, Navigation, Package, Phone, Store, Wallet } from 'lucide-react';

import { customerRequest } from '../../pages/shop/storeApi';
import { money } from '../../pages/shop/storeFormat';
import { useStore } from '../StoreContext';
import { Empty, useLoad } from '../ui';
import { PanelFrame, type PanelConfig } from './PanelFrame';

const config: PanelConfig = {
  role: 'delivery_partner',
  title: 'Delivery partner',
  intro: 'Sign in with the mobile number and password Sureshot gave you.',
  nav: [
    { to: '/rider', label: 'Jobs', icon: Bike, end: true },
    { to: '/rider/history', label: 'History', icon: History },
  ],
  noAccess: (
    <>
      <Bike size={34} />
      <h1>This account isn’t a delivery partner</h1>
      <p>Delivery partner accounts are created by the Sureshot team. Contact them to join the fleet.</p>
    </>
  ),
};

export function RiderPanel() { return <PanelFrame config={config} />; }

interface Me { full_name: string; status: string; is_online: boolean; vehicle_type: string; vehicle_number: string | null; active_jobs: number; delivered_today: number; cod_today_minor: string | number }
interface Job {
  id: string; status: string; order_number: string; payment_method: string; cod_due_minor: number; cod_collected_minor: string | null;
  store_name: string; pickup_line1: string | null; pickup_city: string | null; pickup_postal_code: string | null; pickup_phone: string | null;
  shipping_address: { recipientName?: string; recipientPhone?: string; line1?: string; line2?: string; landmark?: string; city?: string; postalCode?: string } | null;
  customer_name: string | null; assigned_at: string | null; delivered_at: string | null; picked_up_at: string | null;
  items: { title: string; variant_label: string | null; quantity: number }[];
}

const maps = (parts: (string | null | undefined)[]) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.filter(Boolean).join(', '))}`;
const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

function JobCard({ job, onDone }: { job: Job; onDone: () => void }) {
  const { toast } = useStore();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cash, setCash] = useState(false);
  const a = job.shipping_address ?? {};
  const picked = job.status === 'out_for_delivery';
  const act = async (path: string, body?: unknown, msg = 'Updated') => {
    setBusy(true);
    try { await customerRequest(`/delivery/jobs/${job.id}/${path}`, 'POST', body); toast(msg); setConfirming(false); onDone(); }
    catch (e) { toast(errorText(e), { tone: 'error' }); }
    finally { setBusy(false); }
  };
  return (
    <article className={`pn-card rd-job${picked ? ' on-way' : ''}`}>
      <div className="rd-job-top">
        <b>{job.order_number}</b>
        <span className={`pn-status s-${job.status}`}>{picked ? 'On the way' : 'Pick up'}</span>
      </div>
      {job.cod_due_minor > 0
        ? <div className="rd-cod"><Wallet size={18} /> Collect <b>{money(job.cod_due_minor)}</b> cash / UPI</div>
        : <div className="rd-cod paid"><CheckCircle2 size={18} /> Prepaid — nothing to collect</div>}
      <div className={`rd-stop${picked ? ' done' : ''}`}>
        <span className="rd-dot"><Store size={15} /></span>
        <div>
          <small>Pick up from</small>
          <b>{job.store_name}</b>
          <p>{[job.pickup_line1, job.pickup_city, job.pickup_postal_code].filter(Boolean).join(', ')}</p>
          <div className="rd-links">
            {job.pickup_phone && <a href={`tel:${job.pickup_phone}`}><Phone size={14} /> Call store</a>}
            <a href={maps([job.pickup_line1, job.pickup_city, job.pickup_postal_code])} target="_blank" rel="noreferrer"><Navigation size={14} /> Directions</a>
          </div>
        </div>
      </div>
      <div className="rd-stop">
        <span className="rd-dot drop"><MapPin size={15} /></span>
        <div>
          <small>Deliver to</small>
          <b>{a.recipientName ?? job.customer_name}</b>
          <p>{[a.line1, a.line2, a.landmark, a.city, a.postalCode].filter(Boolean).join(', ')}</p>
          <div className="rd-links">
            {a.recipientPhone && <a href={`tel:${a.recipientPhone}`}><Phone size={14} /> Call customer</a>}
            <a href={maps([a.line1, a.city, a.postalCode])} target="_blank" rel="noreferrer"><Navigation size={14} /> Directions</a>
          </div>
        </div>
      </div>
      <details className="rd-items"><summary><Package size={15} /> {job.items.reduce((n, i) => n + i.quantity, 0)} item(s)</summary>
        <ul>{job.items.map((i, k) => <li key={k}>{i.quantity} × {i.title}{i.variant_label ? ` (${i.variant_label})` : ''}</li>)}</ul>
      </details>
      {!picked
        ? <button className="ms-btn full" disabled={busy} onClick={() => void act('pickup', undefined, 'Picked up — drive safe!')}>{busy ? <Loader2 size={18} className="ms-spin" /> : 'Picked up from store'}</button>
        : !confirming
          ? <button className="ms-btn full rd-deliver" onClick={() => setConfirming(true)}>Mark delivered</button>
          : (
            <div className="rd-confirm">
              {job.cod_due_minor > 0 && <label className="pn-check"><input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} /> I collected {money(job.cod_due_minor)} from the customer</label>}
              <div className="pn-actions">
                <button className="ms-btn ghost" onClick={() => setConfirming(false)}>Back</button>
                <button className="ms-btn rd-deliver" disabled={busy || (job.cod_due_minor > 0 && !cash)} onClick={() => void act('deliver', { codCollected: cash }, 'Delivered — great job!')}>{busy ? <Loader2 size={18} className="ms-spin" /> : 'Confirm delivery'}</button>
              </div>
            </div>
          )}
    </article>
  );
}

function Header({ me, onToggle, busy }: { me: Me; onToggle: () => void; busy: boolean }) {
  return (
    <section className={`rd-head${me.is_online ? ' online' : ''}`}>
      <div>
        <h1>Hi, {me.full_name.split(' ')[0]}</h1>
        <p>{me.vehicle_type}{me.vehicle_number ? ` · ${me.vehicle_number}` : ''}</p>
      </div>
      <button className="rd-toggle" role="switch" aria-checked={me.is_online} disabled={busy || me.status !== 'active'} onClick={onToggle}>
        <span className="knob" />{me.is_online ? 'Online' : 'Offline'}
      </button>
      <div className="rd-stats">
        <span><b>{me.active_jobs}</b>active</span>
        <span><b>{me.delivered_today}</b>delivered today</span>
        <span><b>{money(Number(me.cod_today_minor || 0))}</b>cash collected</span>
      </div>
    </section>
  );
}

export function RiderJobs() {
  const { toast } = useStore();
  const me = useLoad(() => customerRequest<Me>('/delivery/me'), []);
  const jobs = useLoad(() => customerRequest<Job[]>('/delivery/jobs?state=active'), []);
  const [busy, setBusy] = useState(false);
  // New assignments arrive from dispatch; refresh quietly every 30 s.
  useEffect(() => { const t = window.setInterval(() => { jobs.retry(); me.retry(); }, 30000); return () => window.clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = async () => {
    if (!me.data) return;
    setBusy(true);
    try { await customerRequest('/delivery/me', 'PATCH', { isOnline: !me.data.is_online }); me.retry(); toast(me.data.is_online ? 'You’re offline' : 'You’re online — new jobs will appear here'); }
    catch (e) { toast(errorText(e), { tone: 'error' }); }
    finally { setBusy(false); }
  };
  const refresh = () => { jobs.retry(); me.retry(); };
  return (
    <div className="pn-stack rd">
      {me.data ? <Header me={me.data} onToggle={() => void toggle()} busy={busy} /> : <div className="ms-skel" style={{ height: 150, borderRadius: 24 }} />}
      {me.data?.status === 'inactive' && <p className="ms-alert">Your account is inactive. Contact the Sureshot team.</p>}
      <h2 className="rd-title">Your deliveries</h2>
      {jobs.error ? <p className="ms-alert">{jobs.error}</p>
        : jobs.loading && !jobs.data ? <div className="ms-skel" style={{ height: 260, borderRadius: 20 }} />
          : !jobs.data?.length ? <Empty icon={<Bike size={30} />} title={me.data?.is_online ? 'Waiting for your next job' : 'You’re offline'}>{me.data?.is_online ? 'New deliveries assigned to you will show up here.' : 'Go online to start receiving deliveries.'}</Empty>
            : <div className="rd-jobs">{jobs.data.map((j) => <JobCard key={j.id} job={j} onDone={refresh} />)}</div>}
    </div>
  );
}

export function RiderHistory() {
  const jobs = useLoad(() => customerRequest<Job[]>('/delivery/jobs?state=done'), []);
  return (
    <div className="pn-stack rd">
      <h1 className="rd-title">Completed</h1>
      {jobs.error ? <p className="ms-alert">{jobs.error}</p>
        : jobs.loading ? <div className="ms-skel" style={{ height: 240, borderRadius: 20 }} />
          : !jobs.data?.length ? <Empty icon={<History size={30} />} title="No deliveries yet">Completed deliveries will be listed here.</Empty>
            : (
              <ul className="pn-card rd-history">
                {jobs.data.map((j) => (
                  <li key={j.id}>
                    <span><b>{j.order_number}</b><small>{j.store_name} → {j.shipping_address?.city ?? ''} · {j.delivered_at ? new Date(j.delivered_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : j.status}</small></span>
                    <span className="rd-history-amt">{j.cod_collected_minor ? <>+{money(Number(j.cod_collected_minor))}<small>cash</small></> : <small>prepaid</small>}</span>
                  </li>
                ))}
              </ul>
            )}
    </div>
  );
}
