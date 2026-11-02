/**
 * Demo-data helpers for Sureshot seeds. Demo passwords are never stored in
 * the repository: they come from the ignored backend/.env, which
 * `npm run demo:setup` generates with random values.
 */
const assertDemoDatabase = (knex) => {
  const { database, host } = knex.client.config.connection;
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seeds never run in production.');
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Demo seeds only run against a local database (got ${host}).`);
  if (!/sureshot/i.test(database)) throw new Error(`Refusing to seed "${database}": demo seeds only target a Sureshot database.`);
};

const demoPassword = (name) => {
  const value = process.env[name];
  if (!value || value.length < 10) throw new Error(`${name} is not set. Run "npm run demo:setup" first (it writes random demo passwords to backend/.env).`);
  return value;
};

/** Unsplash photo URL for demo imagery (illustrative only; replace with seller photography). */
const photo = (id, width = 900, crop = 'entropy') => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80&crop=${crop}`;

module.exports = { assertDemoDatabase, demoPassword, photo };
