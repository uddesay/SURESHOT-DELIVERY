const argon2 = require('argon2');
const { v4: uuid } = require('uuid');
const { assertDemoDatabase, demoPassword } = require('../demo');

/**
 * Demo delivery fleet: four riders (one offline, one inactive) and the
 * seeded order book spread across them — delivered parcels with COD recorded,
 * parcels on the way, freshly assigned ones, and an unassigned dispatch queue.
 * Idempotent: skips when the riders exist.
 */
const RIDERS = [
  { name: 'Ravi Kumar', email: 'ravi@demo.sureshot.com', phone: '+919810000001', vehicle: 'bike', number: 'MH02 AB 1234', online: true, status: 'active' },
  { name: 'Imran Shaikh', email: 'imran@demo.sureshot.com', phone: '+919810000002', vehicle: 'scooter', number: 'MH04 CD 5678', online: true, status: 'active' },
  { name: 'Suresh Yadav', email: 'suresh@demo.sureshot.com', phone: '+919810000003', vehicle: 'bike', number: 'MH01 EF 9012', online: false, status: 'active' },
  { name: 'Pooja Nair', email: 'pooja@demo.sureshot.com', phone: '+919810000004', vehicle: 'scooter', number: 'MH03 GH 3456', online: false, status: 'inactive' },
];

exports.seed = async function seed(knex) {
  assertDemoDatabase(knex);
  if (await knex('delivery_partners').first()) return;
  const role = await knex('roles').where({ name: 'delivery_partner' }).first();
  const hash = await argon2.hash(demoPassword('DEMO_RIDER_PASSWORD'), { type: argon2.argon2id });

  await knex.transaction(async (trx) => {
    const partners = [];
    for (const r of RIDERS) {
      const userId = uuid();
      await trx('users').insert({ id: userId, email: r.email, phone: r.phone, full_name: r.name, password_hash: hash, is_email_verified: true, is_phone_verified: true, status: 'active' });
      await trx('user_roles').insert({ user_id: userId, role_id: role.id });
      const id = uuid();
      await trx('delivery_partners').insert({ id, user_id: userId, full_name: r.name, phone: r.phone, vehicle_type: r.vehicle, vehicle_number: r.number, city: 'Mumbai', status: r.status, is_online: r.online });
      partners.push({ id, ...r });
    }
    const active = partners.filter((p) => p.status === 'active');

    // Spread the seeded shipments over the active riders in a stable order.
    const shipments = await trx('order_shipments as s').join('orders as o', 'o.id', 's.order_id')
      .select('s.id', 's.status', 's.shipped_at', 's.delivered_at', 's.created_at', 'o.payment_method', 'o.total_minor', 'o.id as order_id')
      .orderBy('o.placed_at');
    let i = 0;
    for (const s of shipments) {
      if (s.status === 'cancelled') continue;
      const rider = active[i % active.length];
      i += 1;
      const assignedAt = new Date(new Date(s.created_at).getTime() + 2 * 3600000);
      if (s.status === 'delivered') {
        await trx('order_shipments').where({ id: s.id }).update({
          delivery_partner_id: rider.id, assigned_at: assignedAt, picked_up_at: s.shipped_at || assignedAt,
          cod_collected_minor: s.payment_method === 'cod' ? s.total_minor : null, courier: null, awb_number: null,
        });
      } else if (['shipped', 'out_for_delivery'].includes(s.status)) {
        await trx('order_shipments').where({ id: s.id }).update({
          status: 'out_for_delivery', delivery_partner_id: rider.id, assigned_at: assignedAt, picked_up_at: s.shipped_at || assignedAt, courier: null, awb_number: null,
        });
      } else if (s.status === 'packed' || i % 3 === 0) {
        // packed and ready: assigned, waiting for pickup
        await trx('order_shipments').where({ id: s.id }).update({ delivery_partner_id: rider.id, assigned_at: assignedAt });
      }
      // everything else stays unassigned for the dispatch queue
    }

    // Keep order headers consistent with the shipments touched above.
    await trx.raw(`UPDATE orders o SET status = 'out_for_delivery'
      WHERE o.status = 'shipped' AND EXISTS (SELECT 1 FROM order_shipments s WHERE s.order_id = o.id AND s.status = 'out_for_delivery')
        AND NOT EXISTS (SELECT 1 FROM order_shipments s WHERE s.order_id = o.id AND s.status IN ('pending','processing','packed'))`);
  });
};
