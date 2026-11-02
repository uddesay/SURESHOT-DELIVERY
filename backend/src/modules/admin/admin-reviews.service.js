const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');

const list = async ({ page = 1, limit = 20, status, rating, q }) => {
  const base = db('reviews as r')
    .join('products as p', 'p.id', 'r.product_id')
    .join('users as u', 'u.id', 'r.user_id')
    .modify((qb) => {
      if (status) qb.where('r.status', status);
      if (rating) qb.where('r.rating', rating);
      if (q) {
        qb.where((qb2) => qb2.whereILike('p.title', `%${q}%`)
          .orWhereILike('r.title', `%${q}%`)
          .orWhereILike('r.body', `%${q}%`)
          .orWhereILike('u.full_name', `%${q}%`));
      }
    });
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone()
    .orderBy('r.created_at', 'desc')
    .offset((page - 1) * limit)
    .limit(limit)
    .select('r.id', 'r.rating', 'r.title', 'r.body', 'r.status', 'r.helpful_count', 'r.created_at',
      db.raw('r.order_item_id IS NOT NULL as verified_purchase'),
      'p.id as product_id', 'p.title as product_title', 'u.id as user_id', 'u.full_name as customer_name');
  return { total: Number(count), rows };
};

/** Approved reviews are the only ones that count toward a product's public rating. */
const recomputeProductRating = async (trx, productId) => {
  const stats = await trx('reviews').where({ product_id: productId, status: 'approved' })
    .select(db.raw('COALESCE(AVG(rating), 0)::numeric(3,2) as avg'), db.raw('COUNT(*)::int as count')).first();
  await trx('products').where({ id: productId }).update({
    rating_avg: stats.avg, rating_count: stats.count, review_count: stats.count,
  });
};

const setStatus = async (reviewId, status) => db.transaction(async (trx) => {
  const review = await trx('reviews').where({ id: reviewId }).forUpdate().first();
  if (!review) throw ApiError.notFound('Review');
  await trx('reviews').where({ id: reviewId }).update({ status, updated_at: trx.fn.now() });
  await recomputeProductRating(trx, review.product_id);
  return { ...review, status };
});

module.exports = { list, setStatus };
