const { createHash } = require('crypto');
const db = require('../config/database');

// Atomic shared windows survive process restarts and work across replicas.
// Hash keys so identifiers and IPs are not retained in this table.
async function postgresRateLimit(key, seconds) {
  const digest = createHash('sha256').update(key).digest('hex');
  const result = await db.raw(`
    INSERT INTO rate_limit_windows (key, count, expires_at)
    VALUES (?, 1, NOW() + (? * INTERVAL '1 second'))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit_windows.expires_at <= NOW() THEN 1 ELSE rate_limit_windows.count + 1 END,
      expires_at = CASE WHEN rate_limit_windows.expires_at <= NOW() THEN EXCLUDED.expires_at ELSE rate_limit_windows.expires_at END
    RETURNING count, GREATEST(1, CEIL(EXTRACT(EPOCH FROM expires_at - NOW()))) AS ttl
  `, [digest, seconds]);
  // Bounded cleanup prevents expired keys accumulating indefinitely.
  await db.raw(`DELETE FROM rate_limit_windows WHERE key IN
    (SELECT key FROM rate_limit_windows WHERE expires_at < NOW() LIMIT 100)`);
  return [Number(result.rows[0].count), Number(result.rows[0].ttl)];
}
module.exports = postgresRateLimit;
