/** Uniform success envelope: { success, message, data, meta? } */
const ok = (res, data = null, message = 'OK', meta = undefined, statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data, ...(meta ? { meta } : {}) });

const created = (res, data = null, message = 'Created') => ok(res, data, message, undefined, 201);

const paginated = (res, rows, { page, limit, total }, message = 'OK') =>
  ok(res, rows, message, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });

module.exports = { ok, created, paginated };
