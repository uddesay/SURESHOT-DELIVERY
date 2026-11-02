const { normalizeCourierStatus, STAGE_ORDER } = require('../../src/modules/shipping/shipping.service');

describe('normalizeCourierStatus', () => {
  test('maps delivery-confirmed phrases to delivered', () => {
    expect(normalizeCourierStatus('Delivered')).toBe('delivered');
    expect(normalizeCourierStatus('Shipment delivered to consignee')).toBe('delivered');
  });

  test('maps out-for-delivery phrases without over-matching "delivered"', () => {
    expect(normalizeCourierStatus('Out for Delivery')).toBe('out_for_delivery');
    expect(normalizeCourierStatus('OUT FOR DELIVERY - COURIER ASSIGNED')).toBe('out_for_delivery');
  });

  test('maps in-transit / dispatch phrases to shipped', () => {
    expect(normalizeCourierStatus('In Transit')).toBe('shipped');
    expect(normalizeCourierStatus('Shipment dispatched from hub')).toBe('shipped');
    expect(normalizeCourierStatus('Package shipped')).toBe('shipped');
  });

  test('returns null for unrecognized statuses (no regression on unknown couriers)', () => {
    expect(normalizeCourierStatus('Pickup scheduled')).toBeNull();
    expect(normalizeCourierStatus('')).toBeNull();
    expect(normalizeCourierStatus(undefined)).toBeNull();
  });
});

describe('STAGE_ORDER', () => {
  test('is a strictly increasing fulfillment sequence', () => {
    expect(STAGE_ORDER).toEqual(['pending', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered']);
  });

  test('every normalized courier status maps to a valid stage', () => {
    const normalized = ['Delivered', 'Out for Delivery', 'In Transit'].map(normalizeCourierStatus);
    for (const stage of normalized) {
      expect(STAGE_ORDER).toContain(stage);
    }
  });
});

describe('admin fulfillment eligibility', () => {
  const { eligibleShipments, ADMIN_FULFILLMENT } = require('../../src/modules/shipping/shipping.service');
  const shipments = [
    { id: 1, status: 'pending' }, { id: 2, status: 'packed' }, { id: 3, status: 'shipped' }, { id: 4, status: 'cancelled' },
  ];

  test('only moves shipments forward from allowed stages', () => {
    expect(eligibleShipments(shipments, 'pack').map((s) => s.id)).toEqual([1]);
    expect(eligibleShipments(shipments, 'ship').map((s) => s.id)).toEqual([2]);
    expect(eligibleShipments(shipments, 'deliver').map((s) => s.id)).toEqual([3]);
  });

  test('never touches cancelled shipments', () => {
    for (const action of Object.keys(ADMIN_FULFILLMENT)) {
      expect(eligibleShipments(shipments, action).some((s) => s.status === 'cancelled')).toBe(false);
    }
  });

  test('rejects unknown actions', () => {
    expect(() => eligibleShipments(shipments, 'teleport')).toThrow('Unsupported fulfillment action');
  });
});

describe('recomputeOrderStatus', () => {
  const { recomputeOrderStatus } = require('../../src/modules/shipping/shipping.service');
  const notificationService = require('../../src/modules/notifications/notification.service');

  /** Minimal in-memory stand-in for a knex transaction over a few tables. */
  const fakeTrx = (tables) => {
    const matches = (row, where) => Object.entries(where).every(([k, v]) => row[k] === v);
    const trx = (name) => {
      const where = {};
      const query = {
        where: (w) => { Object.assign(where, w); return query; },
        first: async () => tables[name].find((r) => matches(r, where)),
        then: (resolve) => resolve(tables[name].filter((r) => matches(r, where))),
        update: async (patch) => tables[name].filter((r) => matches(r, where)).forEach((r) => Object.assign(r, patch)),
        insert: async (row) => tables[name].push(row),
      };
      return query;
    };
    trx.fn = { now: () => 'NOW' };
    return trx;
  };

  beforeEach(() => jest.spyOn(notificationService, 'notify').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  const tablesFor = (shipmentStatuses, provider) => ({
    orders: [{ id: 'o1', status: 'shipped', user_id: 'u1', order_number: 'SS1' }],
    order_shipments: shipmentStatuses.map((status, i) => ({ id: `s${i}`, order_id: 'o1', status })),
    order_status_history: [],
    payments: [{ id: 'p1', order_id: 'o1', provider, status: 'pending' }],
  });

  test('delivery captures the pending cash-on-delivery payment', async () => {
    const tables = tablesFor(['delivered', 'delivered'], 'cod');
    await recomputeOrderStatus(fakeTrx(tables), 'o1');
    expect(tables.orders[0].status).toBe('delivered');
    expect(tables.payments[0]).toMatchObject({ status: 'captured', captured_at: 'NOW' });
  });

  test('a partially delivered order leaves the COD payment pending', async () => {
    const tables = tablesFor(['delivered', 'shipped'], 'cod');
    await recomputeOrderStatus(fakeTrx(tables), 'o1');
    expect(tables.payments[0].status).toBe('pending');
  });

  test('delivery never touches non-COD payments', async () => {
    const tables = tablesFor(['delivered'], 'razorpay');
    await recomputeOrderStatus(fakeTrx(tables), 'o1');
    expect(tables.payments[0].status).toBe('pending');
  });
});
