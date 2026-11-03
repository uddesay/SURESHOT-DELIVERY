const Redis = require('ioredis');
const config = require('./index');
const logger = require('../utils/logger');

/**
 * Redis backs shared rate limiting and caching. Production rate limiting
 * fails closed; development uses a bounded local limiter during outages.
 * The client is configured to fail *fast* rather
 * than retry — with `enableOfflineQueue: true` (the default) every command
 * issued while Redis is down sits in a queue and only rejects after the
 * retry budget drains, which turns a dead Redis into 10-20s of latency on
 * every single request instead of a graceful degrade.
 *
 * `isAvailable()` lets callers (see rateLimiter.middleware.js) skip Redis
 * entirely while it's down, so a Redis outage costs no request latency at all.
 */
const isTest = process.env.NODE_ENV === 'test';
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
  enableOfflineQueue: false,
  // Unit tests must not open sockets (an endless reconnect loop keeps Jest alive).
  lazyConnect: isTest,
  // Background reconnect stays slow-and-steady; it must never gate requests.
  retryStrategy: (times) => (isTest ? null : Math.min(times * 500, 10000)),
});

let available = false;
let outageLogged = false;

/**
 * ioredis surfaces connection failures as an AggregateError whose own
 * `message` is empty — the useful detail sits on `.code` and the wrapped
 * errors. `.code` is also redacted by the logger (an OTP-safety rule that
 * matches `*.code`), so the reason is folded into the message string here
 * instead of passed as a field, otherwise the warning logs `err: ""`.
 */
const describe = (err) => {
  const code = err?.code || err?.errors?.[0]?.code;
  if (code) return `${code} at ${config.redis.host}:${config.redis.port}`;
  return err?.message || err?.errors?.[0]?.message || 'unknown error';
};

redis.on('error', (err) => {
  available = false;
  // One warning per outage, not one per retry — an unreachable Redis
  // otherwise floods the logs several times a second and buries real errors.
  if (!outageLogged) {
    outageLogged = true;
    logger.warn(
      `Redis unavailable (${describe(err)}) — caching is degraded. `
        + (config.rateLimitStore === 'postgres' ? 'Rate limiting uses PostgreSQL. ' : 'Redis rate limiting fails closed in production. ')
        + 'Retrying in the background.',
    );
  }
});

redis.on('ready', () => {
  available = true;
  outageLogged = false;
  logger.info('Redis connected');
});

redis.on('end', () => {
  available = false;
});

redis.isAvailable = () => available;

module.exports = redis;
