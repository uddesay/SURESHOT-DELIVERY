const redis = require('../config/redis');
const logger = require('./logger');

/**
 * Read-through cache for hot public reads (catalogue, stores, banners).
 *
 *  - Uses Redis when it is up, so every API instance shares one cache and a
 *    burst of identical requests costs one database query in total.
 *  - Falls back to a bounded in-process cache while Redis is down, so a
 *    Redis outage never turns into a database stampede or an error.
 *  - Concurrent misses for the same key in one process share one loader call
 *    (single-flight), which is what protects Postgres during a traffic spike.
 *  - Values are namespaced; `bust(ns)` invalidates a whole namespace at once
 *    (version counter) without scanning keys.
 */
const PREFIX = 'cache:';
const MAX_LOCAL_ENTRIES = 3000;
const local = new Map(); // key -> { value, expires }
const inflight = new Map(); // key -> Promise
const localVersions = new Map(); // ns -> number
const versionMemo = new Map(); // ns -> { v, until }

const sweep = () => {
  const now = Date.now();
  for (const [key, entry] of local) if (entry.expires <= now) local.delete(key);
  while (local.size > MAX_LOCAL_ENTRIES) local.delete(local.keys().next().value);
};

const version = async (ns) => {
  const memo = versionMemo.get(ns);
  if (memo && memo.until > Date.now()) return memo.v;
  let v = localVersions.get(ns) || 1;
  if (redis.isAvailable()) {
    try { v = Number(await redis.get(`${PREFIX}v:${ns}`)) || 1; } catch { /* use local */ }
  }
  versionMemo.set(ns, { v, until: Date.now() + 1500 });
  return v;
};

const readRedis = async (key) => {
  if (!redis.isAvailable()) return undefined;
  try {
    const raw = await redis.get(PREFIX + key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch (err) {
    logger.debug({ err }, 'cache read failed');
    return undefined;
  }
};

const writeRedis = (key, value, ttl) => {
  if (!redis.isAvailable()) return;
  redis.set(PREFIX + key, JSON.stringify(value), 'EX', ttl).catch(() => {});
};

/**
 * cache.wrap('products', JSON.stringify(query), 20, () => load())
 * `ttl` is in seconds. `null`/`undefined` results are not cached.
 */
const wrap = async (ns, id, ttl, loader) => {
  if (process.env.CACHE_DISABLED === 'true') return loader(); // benchmarking / debugging only
  const key = `${ns}:${await version(ns)}:${id}`;
  const hit = await readRedis(key);
  if (hit !== undefined) return hit;
  const mine = local.get(key);
  if (mine && mine.expires > Date.now()) return mine.value;

  if (inflight.has(key)) return inflight.get(key);
  const pending = (async () => {
    try {
      const value = await loader();
      if (value !== undefined && value !== null) {
        writeRedis(key, value, ttl);
        // Keep a short local copy too: it covers Redis outages and saves a network hop.
        local.set(key, { value, expires: Date.now() + Math.min(ttl, 5) * 1000 });
        if (local.size > MAX_LOCAL_ENTRIES) sweep();
      }
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, pending);
  return pending;
};

/** Remove one cached value (current version of its namespace). */
const del = async (ns, id) => {
  const key = `${ns}:${await version(ns)}:${id}`;
  local.delete(key);
  if (redis.isAvailable()) {
    try { await redis.del(PREFIX + key); } catch { /* it will expire on its own */ }
  }
};

/** Invalidate every cached value under a namespace. */
const bust = async (ns) => {
  const next = (localVersions.get(ns) || 1) + 1;
  localVersions.set(ns, next);
  versionMemo.delete(ns);
  if (redis.isAvailable()) {
    try { await redis.incr(`${PREFIX}v:${ns}`); } catch { /* local bump already done */ }
  }
};

const stats = () => ({ localEntries: local.size, inflight: inflight.size, redis: redis.isAvailable() });

module.exports = { wrap, del, bust, stats };
