require('dotenv').config();

const base = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'sureshot_dev',
    user: process.env.DB_USER || 'sureshot_app',
    password: process.env.DB_PASSWORD || '',
  },
  pool: {
    min: Number(process.env.DB_POOL_MIN || 2),
    max: Number(process.env.DB_POOL_MAX || 20),
  },
  migrations: { directory: './db/migrations', tableName: 'knex_migrations' },
  seeds: { directory: './db/seeds' },
};

module.exports = {
  development: base,
  test: { ...base, connection: { ...base.connection, database: `${base.connection.database}_test` } },
  production: { ...base, pool: { min: 2, max: 30 } },
};
