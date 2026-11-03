require('dotenv').config();

const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined;

const base = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'sureshot_dev',
    user: process.env.DB_USER || 'sureshot_app',
    password: process.env.DB_PASSWORD || '',
    ...(ssl ? { ssl } : {}),
    application_name: `sureshot-api-${process.env.INSTANCE_ID || process.pid}`.slice(0, 60),
  },
  // Pool size is per API process: total connections = DB_POOL_MAX x processes x instances.
  // Keep that product below Postgres max_connections (put PgBouncer in front for large fleets).
  pool: {
    min: Number(process.env.DB_POOL_MIN || 2),
    max: Number(process.env.DB_POOL_MAX || 20),
    acquireTimeoutMillis: Number(process.env.DB_ACQUIRE_TIMEOUT_MS || 8000),
    idleTimeoutMillis: 30000,
    // A runaway query or a forgotten transaction must never hold a connection for long under load.
    afterCreate: (conn, done) => {
      conn.query(
        `SET statement_timeout = ${Number(process.env.DB_STATEMENT_TIMEOUT_MS || 15000)};`
        + ` SET idle_in_transaction_session_timeout = ${Number(process.env.DB_IDLE_TX_TIMEOUT_MS || 30000)};`,
        (err) => done(err, conn),
      );
    },
  },
  migrations: { directory: './db/migrations', tableName: 'knex_migrations' },
  seeds: { directory: './db/seeds' },
};

module.exports = {
  development: base,
  test: { ...base, connection: { ...base.connection, database: `${base.connection.database}_test` } },
  production: base,
};
