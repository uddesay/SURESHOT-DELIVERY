const argon2 = require('argon2');
const { v4: uuid } = require('uuid');
const { assertDemoDatabase, demoPassword } = require('../demo');
const { ensurePlatformData } = require('../platform');
const { ensureCategories } = require('../catalog-structure');

exports.seed = async function seed(knex) {
  assertDemoDatabase(knex);
  // Idempotent: skip if RBAC already seeded
  const existing = await knex('roles').where({ name: 'super_admin' }).first();
  if (existing) return;

  await knex.transaction(async (trx) => {
    const roleByName = await ensurePlatformData(trx);

    // super admin user (demo password generated into the ignored backend/.env)
    const adminId = uuid();
    await trx('users').insert({
      id: adminId,
      email: process.env.DEMO_ADMIN_EMAIL || 'admin@demo.sureshot.com',
      password_hash: await argon2.hash(demoPassword('DEMO_ADMIN_PASSWORD'), { type: argon2.argon2id }),
      full_name: 'Sureshot Admin',
      is_email_verified: true,
      status: 'active',
      referral_code: 'ADMIN001',
    });
    await trx('user_roles').insert({ user_id: adminId, role_id: roleByName.super_admin });
    await trx('wallets').insert({ id: uuid(), user_id: adminId });

    // the 15 departments and their subcategories (db/catalog-structure.js)
    await ensureCategories(trx, uuid);
  });
};
