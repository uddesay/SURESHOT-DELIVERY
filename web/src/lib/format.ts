/** All monetary values from the API are BIGINT minor units (paise). */
export function formatCurrency(minorUnits: number | null | undefined, currency = 'INR'): string {
  const major = Number(minorUnits ?? 0) / 100;
  if (currency === 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: Number.isInteger(major) ? 0 : 2,
    }).format(major);
  }
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(major);
}

/** Indian short notation: ₹12.4L, ₹1.2Cr, ₹8.5K. */
export function formatCompactCurrency(minorUnits: number | null | undefined): string {
  const major = Number(minorUnits ?? 0) / 100;
  const abs = Math.abs(major);
  const sign = major < 0 ? '-' : '';
  const trim = (n: number) => n.toFixed(n >= 100 ? 0 : 1).replace(/\.0$/, '');
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}K`;
  return formatCurrency(minorUnits);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-IN').format(Number(value ?? 0));
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  return `${Number(value ?? 0).toFixed(digits).replace(/\.0$/, '')}%`;
}

/** snake_case status → "Out for delivery". */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function initials(name: string | null | undefined): string {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
}

/** ₹ input (string) → paise. */
export function toMinor(value: string | number): number {
  return Math.round(Number(value || 0) * 100);
}

export function fromMinor(value: number | null | undefined): string {
  return value == null ? '' : String(Number(value) / 100);
}
