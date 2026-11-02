/**
 * Own-fleet delivery: delivery partners (riders) with their own login, and
 * shipment assignment / pickup / COD-collection tracking on order_shipments.
 * `delivery_mode` keeps third-party couriers available alongside the fleet.
 */
exports.up = async (knex) => {
  await knex.schema.createTable('delivery_partners', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('user_id').notNullable().unique().references('users.id').onDelete('CASCADE');
    t.string('full_name', 120).notNullable();
    t.string('phone', 20).notNullable();
    t.string('vehicle_type', 20).notNullable().defaultTo('bike');
    t.string('vehicle_number', 20);
    t.string('city', 80);
    t.string('status', 20).notNullable().defaultTo('active');
    t.boolean('is_online').notNullable().defaultTo(false);
    t.timestamps(true, true);
  });
  await knex.raw(`ALTER TABLE delivery_partners
    ADD CONSTRAINT delivery_partners_vehicle_chk CHECK (vehicle_type IN ('bike','scooter','cycle','van','car')),
    ADD CONSTRAINT delivery_partners_status_chk CHECK (status IN ('active','inactive'))`);

  await knex.schema.alterTable('order_shipments', (t) => {
    t.string('delivery_mode', 20).notNullable().defaultTo('own');
    t.uuid('delivery_partner_id').references('delivery_partners.id').onDelete('SET NULL');
    t.timestamp('assigned_at', { useTz: true });
    t.timestamp('picked_up_at', { useTz: true });
    t.bigInteger('cod_collected_minor');
    t.text('delivery_note');
    t.index(['delivery_partner_id', 'status'], 'order_shipments_partner_idx');
  });
  await knex.raw(`ALTER TABLE order_shipments
    ADD CONSTRAINT order_shipments_delivery_mode_chk CHECK (delivery_mode IN ('own','courier'))`);
};

exports.down = async (knex) => {
  await knex.schema.alterTable('order_shipments', (t) => {
    t.dropIndex(['delivery_partner_id', 'status'], 'order_shipments_partner_idx');
    t.dropColumns('delivery_mode', 'delivery_partner_id', 'assigned_at', 'picked_up_at', 'cod_collected_minor', 'delivery_note');
  });
  await knex.schema.dropTable('delivery_partners');
};
