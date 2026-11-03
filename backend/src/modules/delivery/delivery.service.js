const { hashPassword } = require('../../utils/password');
const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const notificationService = require('../notifications/notification.service');
const { recomputeOrderStatus } = require('../shipping/shipping.service');

const OPEN = ['pending', 'processing', 'packed', 'shipped', 'out_for_delivery'];
const BEFORE_PICKUP = ['pending', 'processing', 'packed', 'shipped'];
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

// ---------------------------------------------------------------- partners (admin)

const partnerStats = (qb) => qb.select(
  db.raw(`(SELECT COUNT(*)::int FROM order_shipments s WHERE s.delivery_partner_id = dp.id AND s.status IN (${OPEN.map(() => '?').join(',')})) AS active_jobs`, OPEN),
  db.raw("(SELECT COUNT(*)::int FROM order_shipments s WHERE s.delivery_partner_id = dp.id AND s.status = 'delivered' AND s.delivered_at >= ?) AS delivered_today", [startOfToday()]),
  db.raw("(SELECT COALESCE(SUM(s.cod_collected_minor), 0)::bigint FROM order_shipments s WHERE s.delivery_partner_id = dp.id AND s.delivered_at >= ?) AS cod_today_minor", [startOfToday()]),
  db.raw("(SELECT COUNT(*)::int FROM order_shipments s WHERE s.delivery_partner_id = dp.id AND s.status = 'delivered') AS delivered_total"),
);

const listPartners = async ({ q, status } = {}) => partnerStats(
  db('delivery_partners as dp').join('users as u', 'u.id', 'dp.user_id').select('dp.*', 'u.email')
    .modify((qb) => {
      if (status) qb.where('dp.status', status);
      if (q) qb.where((w) => w.whereILike('dp.full_name', `%${q}%`).orWhereILike('dp.phone', `%${q}%`).orWhereILike('dp.vehicle_number', `%${q}%`));
    }),
).orderBy([{ column: 'dp.status' }, { column: 'dp.is_online', order: 'desc' }, { column: 'dp.full_name' }]);

const getPartner = async (id, trx = db) => {
  const row = await partnerStats(trx('delivery_partners as dp').join('users as u', 'u.id', 'dp.user_id').select('dp.*', 'u.email')).where('dp.id', id).first();
  if (!row) throw ApiError.notFound('Delivery partner');
  return row;
};

/** Creates the rider's login (role delivery_partner) and their partner profile. */
const createPartner = async (actorId, { fullName, phone, email, password, vehicleType, vehicleNumber, city }) => db.transaction(async (trx) => {
  const taken = await trx('users').whereNull('deleted_at')
    .where((w) => { w.where('phone', phone); if (email) w.orWhere('email', email); }).first();
  if (taken) throw ApiError.conflict('A user with this phone or email already exists');
  const role = await trx('roles').where({ name: 'delivery_partner' }).first();
  if (!role) throw ApiError.businessRule('The delivery_partner role is missing — run the platform bootstrap');

  const userId = uuid();
  await trx('users').insert({
    id: userId, email: email || null, phone, full_name: fullName, status: 'active',
    password_hash: await hashPassword(password),
    is_email_verified: Boolean(email), is_phone_verified: true,
  });
  await trx('user_roles').insert({ user_id: userId, role_id: role.id });
  const id = uuid();
  await trx('delivery_partners').insert({
    id, user_id: userId, full_name: fullName, phone, vehicle_type: vehicleType, vehicle_number: vehicleNumber || null, city: city || null,
  });
  return getPartner(id, trx);
});

const updatePartner = async (id, attrs) => {
  const patch = {
    ...(attrs.fullName !== undefined ? { full_name: attrs.fullName } : {}),
    ...(attrs.phone !== undefined ? { phone: attrs.phone } : {}),
    ...(attrs.vehicleType !== undefined ? { vehicle_type: attrs.vehicleType } : {}),
    ...(attrs.vehicleNumber !== undefined ? { vehicle_number: attrs.vehicleNumber } : {}),
    ...(attrs.city !== undefined ? { city: attrs.city } : {}),
    ...(attrs.status !== undefined ? { status: attrs.status, ...(attrs.status === 'inactive' ? { is_online: false } : {}) } : {}),
  };
  const n = await db('delivery_partners').where({ id }).update({ ...patch, updated_at: db.fn.now() });
  if (!n) throw ApiError.notFound('Delivery partner');
  return getPartner(id);
};

// ---------------------------------------------------------------- dispatch (admin)

const shipmentRows = (trx = db) => trx('order_shipments as s')
  .join('orders as o', 'o.id', 's.order_id')
  .join('vendors as v', 'v.id', 's.vendor_id')
  .leftJoin('warehouses as w', 'w.id', 's.warehouse_id')
  .leftJoin('delivery_partners as dp', 'dp.id', 's.delivery_partner_id')
  .leftJoin('users as cu', 'cu.id', 'o.user_id')
  .select(
    's.id', 's.status', 's.delivery_mode', 's.delivery_partner_id', 's.assigned_at', 's.picked_up_at', 's.delivered_at',
    's.cod_collected_minor', 's.delivery_note', 's.created_at', 's.courier',
    'o.id as order_id', 'o.order_number', 'o.payment_method', 'o.total_minor', 'o.shipping_address', 'o.placed_at',
    'cu.full_name as customer_name',
    'v.store_name', 'w.line1 as pickup_line1', 'w.city as pickup_city', 'w.postal_code as pickup_postal_code', 'w.contact_phone as pickup_phone',
    'dp.full_name as partner_name', 'dp.phone as partner_phone', 'dp.vehicle_type as partner_vehicle',
    db.raw('(SELECT COUNT(*)::int FROM order_items i WHERE i.shipment_id = s.id) AS item_count'),
    db.raw('(SELECT COALESCE(SUM(i.line_total_minor), 0)::bigint FROM order_items i WHERE i.shipment_id = s.id) AS shipment_value_minor'),
    db.raw("(SELECT COUNT(*)::int FROM order_shipments s2 WHERE s2.order_id = s.order_id AND s2.status <> 'cancelled') AS order_shipment_count"),
  );

/** COD due at the door: the whole order when it ships in one parcel, else this parcel's lines. */
const withCodDue = (row) => ({
  ...row,
  cod_due_minor: row.payment_method === 'cod'
    ? (Number(row.order_shipment_count) <= 1 ? Number(row.total_minor) : Number(row.shipment_value_minor))
    : 0,
});

const listDispatch = async ({ state = 'unassigned', page = 1, limit = 30 }) => {
  const base = shipmentRows().modify((qb) => {
    if (state === 'unassigned') qb.whereNull('s.delivery_partner_id').where('s.delivery_mode', 'own').whereIn('s.status', BEFORE_PICKUP);
    if (state === 'active') qb.whereNotNull('s.delivery_partner_id').whereIn('s.status', OPEN);
    if (state === 'delivered') qb.whereNotNull('s.delivery_partner_id').where('s.status', 'delivered');
  });
  const [{ total }] = await db.from(base.clone().as('x')).count({ total: '*' });
  const rows = await base.orderBy(state === 'delivered' ? 's.delivered_at' : 'o.placed_at', state === 'delivered' ? 'desc' : 'asc')
    .limit(limit).offset((page - 1) * limit);
  return { rows: rows.map(withCodDue), total: Number(total) };
};

const assignShipment = async (actorId, shipmentId, partnerId) => db.transaction(async (trx) => {
  const shipment = await trx('order_shipments').where({ id: shipmentId }).forUpdate().first();
  if (!shipment) throw ApiError.notFound('Shipment');
  if (!OPEN.includes(shipment.status)) throw ApiError.businessRule(`A ${shipment.status} shipment cannot be assigned`);
  if (shipment.picked_up_at) throw ApiError.businessRule('Already picked up — it can no longer be reassigned');
  const partner = await trx('delivery_partners').where({ id: partnerId }).first();
  if (!partner) throw ApiError.notFound('Delivery partner');
  if (partner.status !== 'active') throw ApiError.businessRule('This delivery partner is inactive');

  await trx('order_shipments').where({ id: shipmentId }).update({
    delivery_partner_id: partnerId, delivery_mode: 'own', assigned_at: trx.fn.now(), updated_at: trx.fn.now(),
  });
  await trx('shipment_tracking_events').insert({
    id: uuid(), shipment_id: shipmentId, status: 'partner_assigned', description: `Assigned to ${partner.full_name}`, occurred_at: trx.fn.now(),
  });
  const order = await trx('orders').where({ id: shipment.order_id }).first();
  notificationService.notify(partner.user_id, {
    title: 'New delivery assigned', body: `Order ${order.order_number} is ready for you.`, type: 'delivery_assigned', data: { shipmentId },
  });
  const [row] = await shipmentRows(trx).where('s.id', shipmentId);
  return withCodDue(row);
});

// ---------------------------------------------------------------- rider (self)

const partnerForUser = async (userId, trx = db) => {
  const partner = await trx('delivery_partners').where({ user_id: userId }).first();
  if (!partner) throw ApiError.forbidden('This account is not a delivery partner');
  return partner;
};

const me = async (userId) => getPartner((await partnerForUser(userId)).id);

const setOnline = async (userId, isOnline) => {
  const partner = await partnerForUser(userId);
  if (partner.status !== 'active' && isOnline) throw ApiError.businessRule('Your account is inactive — contact the Sureshot team');
  await db('delivery_partners').where({ id: partner.id }).update({ is_online: isOnline, updated_at: db.fn.now() });
  return getPartner(partner.id);
};

const myJobs = async (userId, { state = 'active' }) => {
  const partner = await partnerForUser(userId);
  const rows = await shipmentRows().where('s.delivery_partner_id', partner.id).modify((qb) => {
    if (state === 'active') qb.whereIn('s.status', OPEN).orderBy('s.assigned_at', 'asc');
    else qb.whereIn('s.status', ['delivered', 'cancelled']).orderBy('s.updated_at', 'desc').limit(50);
  });
  const items = rows.length ? await db('order_items').whereIn('shipment_id', rows.map((r) => r.id)).select('shipment_id', 'title', 'variant_label', 'quantity', 'image_url') : [];
  return rows.map((r) => ({ ...withCodDue(r), items: items.filter((i) => i.shipment_id === r.id) }));
};

const ownedJob = async (trx, partnerId, shipmentId) => {
  const s = await trx('order_shipments').where({ id: shipmentId, delivery_partner_id: partnerId }).forUpdate().first();
  if (!s) throw ApiError.notFound('Delivery');
  return s;
};

const pickUp = async (userId, shipmentId) => db.transaction(async (trx) => {
  const partner = await partnerForUser(userId, trx);
  const s = await ownedJob(trx, partner.id, shipmentId);
  if (!BEFORE_PICKUP.includes(s.status)) throw ApiError.businessRule(`This delivery is already ${s.status.replace(/_/g, ' ')}`);
  await trx('order_shipments').where({ id: s.id }).update({
    status: 'out_for_delivery', picked_up_at: trx.fn.now(), shipped_at: s.shipped_at || trx.fn.now(), updated_at: trx.fn.now(),
  });
  await trx('shipment_tracking_events').insert({
    id: uuid(), shipment_id: s.id, status: 'out_for_delivery', description: `Picked up by ${partner.full_name}`, occurred_at: trx.fn.now(),
  });
  await recomputeOrderStatus(trx, s.order_id, userId, 'Picked up by delivery partner');
  const [row] = await shipmentRows(trx).where('s.id', s.id);
  return withCodDue(row);
});

const deliver = async (userId, shipmentId, { codCollected = false, note }) => db.transaction(async (trx) => {
  const partner = await partnerForUser(userId, trx);
  const s = await ownedJob(trx, partner.id, shipmentId);
  if (s.status !== 'out_for_delivery') throw ApiError.businessRule('Pick the order up before marking it delivered');
  const [row] = await shipmentRows(trx).where('s.id', s.id);
  const due = withCodDue(row).cod_due_minor;
  if (due > 0 && !codCollected) throw ApiError.businessRule('Collect the cash-on-delivery amount before completing this delivery');

  await trx('order_shipments').where({ id: s.id }).update({
    status: 'delivered', delivered_at: trx.fn.now(), cod_collected_minor: due > 0 ? due : null, delivery_note: note || null, updated_at: trx.fn.now(),
  });
  await trx('shipment_tracking_events').insert({
    id: uuid(), shipment_id: s.id, status: 'delivered', description: `Delivered by ${partner.full_name}`, occurred_at: trx.fn.now(),
  });
  await recomputeOrderStatus(trx, s.order_id, userId, 'Delivered by delivery partner');
  const [after] = await shipmentRows(trx).where('s.id', s.id);
  return withCodDue(after);
});

module.exports = {
  listPartners, getPartner, createPartner, updatePartner,
  listDispatch, assignShipment,
  me, setOnline, myJobs, pickUp, deliver,
};
