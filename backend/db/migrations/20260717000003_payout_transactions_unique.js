/**
 * An order item may appear at most once per ledger entry type (one 'sale'
 * row and one 'commission' row are both legitimate; two 'sale' rows for the
 * same item would mean it was paid out twice).
 */
exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE payout_transactions
      ADD CONSTRAINT payout_transactions_order_item_type_uq UNIQUE (order_item_id, txn_type);
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE payout_transactions
      DROP CONSTRAINT IF EXISTS payout_transactions_order_item_type_uq;
  `);
};
