import { Link } from 'react-router-dom';

const COLORS = ['#215dd5', '#4878d8', '#84a4e5', '#ffae43', '#f05b76', '#768196'];

export function OrderStatusSummary({ rows }: { rows: { status: string; count: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  let cursor = 0;
  const segments = rows.map((row, index) => {
    const start = cursor;
    cursor += total ? row.count / total * 100 : 0;
    return `${COLORS[index % COLORS.length]} ${start}% ${cursor}%`;
  });
  return (
    <div className="px-5 pb-5">
      <div className="mx-auto my-5 flex h-44 w-44 items-center justify-center rounded-full" style={{ background: total ? `conic-gradient(${segments.join(',')})` : 'rgb(var(--c-surface-3))' }}>
        <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-surface">
          <strong className="tabular text-2xl text-ink">{total.toLocaleString('en-IN')}</strong>
          <span className="mt-1 text-xs text-muted">Total orders</span>
        </div>
      </div>
      {total ? <ul className="space-y-2.5">{rows.map((row, index) => (
        <li key={row.status}>
          <Link to={`/orders?status=${encodeURIComponent(row.status)}`} className="flex items-center gap-2 text-xs hover:underline">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />
            <span className="flex-1 capitalize text-muted">{row.status.replace(/_/g, ' ')}</span>
            <span className="tabular font-semibold text-ink">{row.count} <span className="font-normal text-muted">({Math.round(row.count / total * 100)}%)</span></span>
          </Link>
        </li>
      ))}</ul> : <p className="text-center text-sm text-muted">No orders in this period.</p>}
    </div>
  );
}
