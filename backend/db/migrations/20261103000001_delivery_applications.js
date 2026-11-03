/**
 * Public "deliver with us" applications. Applicants choose their own password at
 * apply time (stored only as an argon2 hash); an admin reviews the application and
 * approval creates the rider login + delivery_partners profile.
 */
exports.up = async (knex) => {
  await knex.schema.createTable('delivery_applications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('full_name', 120).notNullable();
    t.string('phone', 20).notNullable();
    t.string('email', 255);
    t.string('city', 80).notNullable();
    t.string('vehicle_type', 20).notNullable().defaultTo('bike');
    t.string('vehicle_number', 20);
    t.string('license_number', 30);
    t.text('about');
    t.text('password_hash').notNullable();
    t.string('status', 20).notNullable().defaultTo('pending');
    t.text('rejection_reason');
    t.uuid('reviewed_by').references('users.id').onDelete('SET NULL');
    t.timestamp('reviewed_at', { useTz: true });
    t.uuid('partner_id').references('delivery_partners.id').onDelete('SET NULL');
    t.specificType('ip_address', 'inet');
    t.timestamps(true, true);
  });
  await knex.raw(`ALTER TABLE delivery_applications
    ADD CONSTRAINT delivery_applications_status_chk CHECK (status IN ('pending','approved','rejected')),
    ADD CONSTRAINT delivery_applications_vehicle_chk CHECK (vehicle_type IN ('bike','scooter','cycle','van','car'))`);
  // One open application per phone number.
  await knex.raw("CREATE UNIQUE INDEX delivery_applications_phone_pending_uq ON delivery_applications (phone) WHERE status = 'pending'");
  await knex.raw('CREATE INDEX delivery_applications_status_idx ON delivery_applications (status, created_at DESC)');
};

exports.down = (knex) => knex.schema.dropTable('delivery_applications');
