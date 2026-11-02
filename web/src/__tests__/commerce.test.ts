import { describe, expect, it } from 'vitest';

import { availableFulfillment, formatAddress } from '../api/commerce';
import { bucketSeries } from '../components/charts/SalesChart';
import { toCsv } from '../lib/csv';
import { formatCompactCurrency, formatCurrency, humanize } from '../lib/format';

describe('fulfilment actions', () => {
  it('only offers forward steps for the current status', () => {
    expect(availableFulfillment('confirmed')).toEqual(['process', 'pack']);
    expect(availableFulfillment('packed')).toEqual(['ship']);
    expect(availableFulfillment('delivered')).toEqual([]);
    expect(availableFulfillment('cancelled')).toEqual([]);
  });
});

describe('sales chart bucketing', () => {
  const day = (i: number, revenue: number, netOrders: number) => ({
    date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), gmv: revenue, revenue, orders: netOrders, netOrders, customers: 0, aov: netOrders ? revenue / netOrders : 0,
  });

  it('keeps daily points for short ranges', () => {
    const series = Array.from({ length: 7 }, (_, i) => day(i, 100, 1));
    expect(bucketSeries(series, series, 'revenue')).toHaveLength(7);
  });

  it('rolls long ranges into weeks and computes bucket AOV from totals', () => {
    const series = Array.from({ length: 90 }, (_, i) => day(i, i % 2 ? 300 : 100, 1));
    const buckets = bucketSeries(series, [], 'aov');
    expect(buckets).toHaveLength(13);
    expect(buckets[0]!.current).toBe(Math.round((100 * 4 + 300 * 3) / 7));
    expect(buckets[0]!.previous).toBeNull();
  });
});

describe('csv export', () => {
  it('quotes values and neutralises spreadsheet formulas', () => {
    const csv = toCsv([{ name: '=HYPERLINK("x")', note: 'a "quote"' }], [
      { header: 'Name', value: (r) => r.name },
      { header: 'Note', value: (r) => r.note },
    ]);
    expect(csv).toBe('"Name","Note"\r\n"\'=HYPERLINK(""x"")","a ""quote"""');
  });
});

describe('formatting', () => {
  it('formats paise as rupees, keeping paise when present', () => {
    expect(formatCurrency(129900)).toBe('₹1,299');
    expect(formatCurrency(129950)).toBe('₹1,299.50');
    expect(formatCompactCurrency(124_000_000)).toBe('₹12.4L');
    expect(humanize('out_for_delivery')).toBe('Out for delivery');
  });

  it('formats snapshot addresses from checkout', () => {
    expect(formatAddress({ recipientName: 'A', line1: '1 Road', city: 'Pune', state: 'MH', postalCode: '411001' }))
      .toEqual(['A', '1 Road', 'Pune, MH, 411001']);
  });
});
