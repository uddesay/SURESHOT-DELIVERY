#!/usr/bin/env node
/**
 * Checks the Redis-backed paths against a REAL Redis (REDIS_HOST / REDIS_PORT / REDIS_PASSWORD in backend/.env):
 *   1. shared cache: miss -> hit, expiry (TTL), namespace bust, single-flight under a burst
 *   2. rate limiter: the atomic INCR+EXPIRE script counts exactly under heavy concurrency
 *   3. Socket.IO adapter: an event emitted by server A reaches a client connected to server B
 *
 *   npm --prefix backend run test:redis
 *
 * Exits 0 and says "skipped" when Redis is not reachable, so it is safe in any environment.
 */
require('dotenv').config();
const http = require('node:http');
const redis = require('../src/config/redis');

let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (let i = 0; i < 20 && !redis.isAvailable(); i += 1) await sleep(250);
  if (!redis.isAvailable()) {
    console.log(`skipped: Redis is not reachable at ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
    redis.disconnect();
    return;
  }
  const cache = require('../src/utils/cache');
  const stamp = Date.now().toString(36);

  // ---------- 1. cache
  let loads = 0;
  const loader = async () => { loads += 1; await sleep(60); return { n: loads }; };
  const ns = `verify-${stamp}`;
  const first = await cache.wrap(ns, 'k', 2, loader);
  const second = await cache.wrap(ns, 'k', 2, loader);
  check('cache: second read is a hit', loads === 1 && second.n === first.n, `loads=${loads}`);
  const burst = await Promise.all(Array.from({ length: 200 }, () => cache.wrap(ns, 'burst', 2, loader)));
  check('cache: 200 concurrent misses cost one load (single-flight)', loads === 2 && burst.every((b) => b.n === burst[0].n), `loads=${loads}`);
  const keys = await redis.keys(`cache:${ns}:*`);
  check('cache: values live in Redis with a TTL', keys.length >= 1 && (await redis.ttl(keys[0])) > 0, `${keys.length} keys`);
  await cache.bust(ns);
  await sleep(1700); // the in-process version memo refreshes every 1.5 s
  await cache.wrap(ns, 'k', 2, loader);
  check('cache: bust invalidates the namespace', loads === 3, `loads=${loads}`);

  // ---------- 2. rate limiter script
  const script = 'local n = redis.call("INCR", KEYS[1]); if n == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]); end; return {n, redis.call("TTL", KEYS[1])}';
  const key = `rl:verify:${stamp}`;
  const counts = await Promise.all(Array.from({ length: 500 }, () => redis.eval(script, 1, key, 30)));
  const max = Math.max(...counts.map((c) => c[0]));
  check('rate limiter: 500 parallel hits count exactly 500', max === 500 && new Set(counts.map((c) => c[0])).size === 500, `max=${max}`);
  check('rate limiter: window expires on its own', (await redis.ttl(key)) > 0);
  await redis.del(key);

  // ---------- 3. Socket.IO adapter across two servers
  try {
    const { Server } = require('socket.io');
    const { createAdapter } = require('@socket.io/redis-adapter');
    const { io: connect } = require('socket.io-client');
    const makeServer = async () => {
      const server = http.createServer();
      const io = new Server(server, { transports: ['websocket'] });
      io.adapter(createAdapter(redis.duplicate(), redis.duplicate()));
      io.on('connection', (s) => s.on('join', (room) => s.join(room)));
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      return { io, server, port: server.address().port };
    };
    const a = await makeServer();
    const b = await makeServer();
    const client = connect(`http://127.0.0.1:${b.port}`, { transports: ['websocket'] });
    await new Promise((r) => client.on('connect', r));
    client.emit('join', 'user:123');
    await sleep(300);
    const received = new Promise((resolve) => { client.on('order:update', resolve); setTimeout(() => resolve(null), 3000); });
    a.io.to('user:123').emit('order:update', { ok: true });
    check('Socket.IO: event from server A reaches a client on server B', Boolean(await received));
    client.close(); a.io.close(); b.io.close(); a.server.close(); b.server.close();
  } catch (err) {
    check('Socket.IO adapter across two servers', false, err.message);
  }

  console.log(failures ? `\n${failures} Redis check(s) FAILED` : '\nAll Redis checks passed');
  process.exitCode = failures ? 1 : 0;
  redis.disconnect();
})().catch((err) => { console.error(`\n✗ ${err.message}`); process.exitCode = 1; redis.disconnect(); });
