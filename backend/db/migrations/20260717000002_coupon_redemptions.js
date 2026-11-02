exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TABLE coupon_redemptions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      coupon_id UUID NOT NULL REFERENCES coupons(id),
      user_id UUID NOT NULL REFERENCES users(id),
      order_id UUID NOT NULL REFERENCES orders(id),
      discount_minor BIGINT NOT NULL CHECK (discount_minor >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX coupon_redemptions_coupon_idx ON coupon_redemptions (coupon_id);
    CREATE INDEX coupon_redemptions_user_idx ON coupon_redemptions (coupon_id, user_id);
  `);
};

exports.down = async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS coupon_redemptions');
};
