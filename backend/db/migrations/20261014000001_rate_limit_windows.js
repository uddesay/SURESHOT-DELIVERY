exports.up = (knex) => knex.schema.createTable('rate_limit_windows', (table) => {
  table.string('key', 64).primary();
  table.integer('count').notNullable();
  table.timestamp('expires_at', { useTz: true }).notNullable().index();
});
exports.down = (knex) => knex.schema.dropTable('rate_limit_windows');
