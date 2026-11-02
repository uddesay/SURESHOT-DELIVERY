#!/usr/bin/env node
/**
 * Sureshot first-run bootstrap for a real (production) database.
 *
 *  1. Inserts the platform reference data the API needs to work at all —
 *     roles/permissions, currencies, GST slabs and checkout settings. Existing
 *     rows are never overwritten, so re-running is safe.
 *  2. Creates the first super admin, or with --promote grants super admin to an
 *     existing account (its password is left unchanged).
 *
 * No demo users, products or orders are created. Run migrations first.
 *
 * Usage (on the server, with backend/.env configured):
 *   npm run bootstrap:production -- --email owner@example.com --name "Store Owner"
 * The password is prompted for without echo, or read from BOOTSTRAP_ADMIN_PASSWORD
 * for non-interactive provisioning (unset it afterwards).
 */
const readline = require('node:readline');
const argon2 = require('argon2');
const Joi = require('joi');
const { v4: uuid } = require('uuid');
const db = require('../src/config/database');
const { ensurePlatformData } = require('../db/platform');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

// Mirrors the API's password rule, with a longer minimum for the owner account.
const strongEnough = (p) => p.length >= 12 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p);

/** Reads a line from the terminal without echoing it. */
const askHidden = (question) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
  rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
});

async function main() {
  const email = arg('email')?.trim().toLowerCase();
  const name = arg('name')?.trim() || 'Store Owner';
  const promote = process.argv.includes('--promote');
  // Same rule as the sign-in API, so the account can always log in.
  if (!email || Joi.string().email().validate(email).error) throw new Error('Pass a valid administrator email: --email owner@example.com');

  const [, pending] = await db.migrate.list();
  if (pending.length) throw new Error(`${pending.length} migration(s) pending. Run "npm run migrate" first.`);

  const existing = await db('users').where({ email }).first();
  if (existing && !promote) throw new Error(`${email} already exists. Re-run with --promote to grant it super admin access.`);

  let passwordHash;
  if (!existing) {
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || await askHidden('Password for the new super admin: ');
    if (!strongEnough(password)) throw new Error('Use at least 12 characters with upper-case, lower-case and a digit.');
    if (!process.env.BOOTSTRAP_ADMIN_PASSWORD && password !== await askHidden('Repeat the password: ')) throw new Error('Passwords do not match.');
    passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  }

  await db.transaction(async (trx) => {
    const roleByName = await ensurePlatformData(trx);
    let userId = existing?.id;
    if (!existing) {
      userId = uuid();
      await trx('users').insert({
        id: userId, email, password_hash: passwordHash, full_name: name, is_email_verified: true, status: 'active',
        referral_code: uuid().replace(/-/g, '').slice(0, 10).toUpperCase(),
      });
      await trx('wallets').insert({ id: uuid(), user_id: userId });
    }
    await trx('user_roles').insert({ user_id: userId, role_id: roleByName.super_admin }).onConflict(['user_id', 'role_id']).ignore();
  });

  console.log(`Platform data is in place and ${email} is a super admin. Sign in at /login.`);
}

main()
  .catch((err) => { console.error(`Bootstrap failed: ${err.message}`); process.exitCode = 1; })
  .finally(() => db.destroy());
