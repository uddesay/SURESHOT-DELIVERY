const redis = require('../config/redis');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const config = require('../config');

const ATOMIC_INCREMENT = 'local n = redis.call("INCR", KEYS[1]); if n == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]); end; return {n, redis.call("TTL", KEYS[1])}';
const localWindows = new Map();
const MAX_LOCAL_KEYS = 10000;
function localLimit(key, seconds) {
  const now = Date.now();
  let entry = localWindows.get(key);
  if (!entry || entry.until <= now) {
    if (localWindows.size >= MAX_LOCAL_KEYS) {
      for (const [k, v] of localWindows) if (v.until <= now) localWindows.delete(k);
      if (localWindows.size >= MAX_LOCAL_KEYS) return null;
    }
    entry = { count: 0, until: now + seconds * 1000 };
    localWindows.set(key, entry);
  }
  entry.count += 1;
  return [entry.count, Math.max(1, Math.ceil((entry.until - now) / 1000))];
}

/**
 * Redis fixed-window rate limiter (atomic INCR + EXPIRE).
 * Production fails closed when the shared limiter is unavailable.
 * Development uses bounded, process-local windows during Redis outages.
 */
const rateLimiter = ({ keyPrefix, windowSeconds, max, keyResolver }) => async (req, res, next) => {
  const id = keyResolver ? keyResolver(req) : (req.user?.id || req.ip);
  const key = `rl:${keyPrefix}:${id}`;
  const enforce = ([count, ttl]) => {
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
    if (count > max) { res.setHeader('Retry-After', Math.max(1, ttl)); return next(ApiError.rateLimited()); }
    return next();
  };
  const unavailable = () => {
    if (config.isProduction) return next(new ApiError(503, 'Please try again shortly.', 'RATE_LIMIT_UNAVAILABLE'));
    const window = localLimit(key, windowSeconds);
    return window ? enforce(window) : next(ApiError.rateLimited());
  };
  if (config.rateLimitStore === 'postgres') {
    try {
      return enforce(await require('./postgresRateLimit')(key, windowSeconds));
    } catch (err) {
      logger.error({ err }, 'PostgreSQL rate limiter unavailable');
      return next(new ApiError(503, 'Please try again shortly.', 'RATE_LIMIT_UNAVAILABLE'));
    }
  }
  if (!redis.isAvailable()) return unavailable();
  try {
    return enforce(await redis.eval(ATOMIC_INCREMENT, 1, key, windowSeconds));
  } catch (err) {
    logger.warn({ err }, 'Shared rate limiter unavailable');
    return unavailable();
  }
};

/**
 * Limits are sized for real traffic: many mobile users share one carrier-grade
 * NAT address, so per-IP ceilings are generous (a shield against floods, not a
 * per-person quota). Per-person limits are keyed by identifier or user id.
 * Production needs TRUST_PROXY set so `req.ip` is the client, not the proxy.
 */
const ipShield = rateLimiter({ keyPrefix: 'global', windowSeconds: 300, max: Number(process.env.RATE_LIMIT_IP_PER_5MIN || 3000) });

/** Per signed-in user: 900 requests / 5 min (3 per second sustained). Applied after authentication. */
const userLimiterImpl = rateLimiter({
  keyPrefix: 'user', windowSeconds: 300, max: Number(process.env.RATE_LIMIT_USER_PER_5MIN || 900),
  keyResolver: (req) => req.user?.id || req.ip,
});

const globalLimiter = ipShield;
const userLimiter = (req, res, next) => (req.user ? userLimiterImpl(req, res, next) : next());

/** Public search / autocomplete are hit on every keystroke: 120 / min per IP. */
const searchLimiter = rateLimiter({ keyPrefix: 'search', windowSeconds: 60, max: Number(process.env.RATE_LIMIT_SEARCH_PER_MIN || 120) });

/**
 * Credential endpoints: brute-force protection per account (10 tries / 15 min per
 * identifier) plus a wide per-IP ceiling (200 / 15 min) that shared networks will not hit.
 */
const authByIdentifier = rateLimiter({
  keyPrefix: 'auth-id', windowSeconds: 900, max: Number(process.env.RATE_LIMIT_AUTH_PER_ID || 10),
  keyResolver: (req) => String(req.body?.identifier || req.body?.email || req.body?.phone || req.ip).toLowerCase().slice(0, 120),
});
const authByIp = rateLimiter({ keyPrefix: 'auth-ip', windowSeconds: 900, max: Number(process.env.RATE_LIMIT_AUTH_PER_IP || 200) });
const authLimiter = (req, res, next) => authByIp(req, res, (err) => (err ? next(err) : authByIdentifier(req, res, next)));

/** 3 OTP sends / 10 min per identifier (phone/email), not per IP. */
const otpRequestLimiter = rateLimiter({
  keyPrefix: 'otp',
  windowSeconds: 600,
  max: 3,
  keyResolver: (req) => (req.body?.identifier || req.ip).toLowerCase(),
});

module.exports = { rateLimiter, globalLimiter, userLimiter, searchLimiter, authLimiter, otpRequestLimiter };
