#!/usr/bin/env node
// Wipes and rebuilds the local Sureshot demo database (schema, migrations, seeds).
// Guarded: refuses production, non-local hosts and any database not named *sureshot*.
require('dotenv').config();
const { execSync } = require('node:child_process');
const { Client } = require('pg');

(async () => {
  const { NODE_ENV, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  if (NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(DB_HOST) || !/sureshot/i.test(DB_NAME || '')) {
    throw new Error(`Refusing to reset "${DB_NAME}" on "${DB_HOST}" — local Sureshot demo databases only.`);
  }
  const db = new Client({ host: DB_HOST, port: Number(DB_PORT || 5432), user: DB_USER, password: DB_PASSWORD, database: DB_NAME });
  await db.connect();
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await db.end();
  console.log(`✓ ${DB_NAME} wiped`);
  execSync('npx knex migrate:latest --knexfile knexfile.js', { stdio: 'inherit' });
  execSync('npx knex seed:run --knexfile knexfile.js', { stdio: 'inherit' });
  console.log('✓ demo data ready');
})().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
