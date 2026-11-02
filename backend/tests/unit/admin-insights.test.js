jest.mock('../../src/config/database', () => ({}));
const {
  resolvePeriods, percentChange, buildDailySeries, mergeActivity,
} = require('../../src/modules/admin/admin-insights.service');

describe('resolvePeriods', () => {
  test('compares against an equally long window immediately before', () => {
    const { current, previous, days } = resolvePeriods({ from: '2026-09-01T00:00:00Z', to: '2026-09-08T00:00:00Z' });
    expect(days).toBe(7);
    expect(previous.to.toISOString()).toBe(current.from.toISOString());
    expect(previous.from.toISOString()).toBe('2026-08-25T00:00:00.000Z');
  });

  test('defaults to the last 30 days ending at the next UTC midnight', () => {
    const { current, days } = resolvePeriods({}, new Date('2026-10-06T10:00:00Z'));
    expect(days).toBe(30);
    expect(current.to.toISOString()).toBe('2026-10-07T00:00:00.000Z');
  });

  test('rejects an inverted window', () => {
    expect(() => resolvePeriods({ from: '2026-09-08', to: '2026-09-01' })).toThrow(RangeError);
  });
});

describe('percentChange', () => {
  test('reports growth and decline to one decimal', () => {
    expect(percentChange(118.6, 100)).toBe(18.6);
    expect(percentChange(50, 200)).toBe(-75);
  });

  test('has no meaningful change without a baseline', () => {
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(0, 0)).toBe(0);
  });
});

describe('buildDailySeries', () => {
  test('fills empty days and derives AOV from net orders only', () => {
    const series = buildDailySeries(
      { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-04T00:00:00Z') },
      [{ day: '2026-09-02', orders: 3, gmv: '9000', revenue: '6000', net_orders: 2 }],
      [{ day: '2026-09-03', customers: 4 }],
    );
    expect(series.map((d) => d.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(series[1]).toEqual({ date: '2026-09-02', gmv: 9000, revenue: 6000, orders: 3, netOrders: 2, customers: 0, aov: 3000 });
    expect(series[2].customers).toBe(4);
    expect(series[0].aov).toBe(0);
  });
});

describe('mergeActivity', () => {
  test('orders events newest first, drops undated events and applies the limit', () => {
    const merged = mergeActivity([
      [{ id: 'a', at: '2026-10-01T10:00:00Z' }, { id: 'b', at: null }],
      [{ id: 'c', at: '2026-10-02T10:00:00Z' }, { id: 'd', at: '2026-09-30T10:00:00Z' }],
    ], 2);
    expect(merged.map((e) => e.id)).toEqual(['c', 'a']);
  });
});
