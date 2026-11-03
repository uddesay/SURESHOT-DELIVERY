const argon2 = require('argon2');
const { randomBytes } = require('node:crypto');
const ApiError = require('./ApiError');

/**
 * Password hashing for a login surge.
 *
 * argon2id is deliberately expensive (CPU + memory) and runs on libuv's small shared
 * thread pool. Unbounded, a burst of sign-ins would (a) hold hundreds of hashes in
 * flight, starving DNS / file / crypto work that shares the pool, and (b) leave real users
 * waiting behind attackers. So:
 *   - at most PASSWORD_HASH_CONCURRENCY hashes run at once per process,
 *   - the rest wait in a bounded queue,
 *   - when the queue is full we shed load with a 503 instead of falling over.
 *
 * Parameters follow the OWASP minimum for argon2id (19 MiB, 2 passes, 1 lane) — roughly
 * 3x cheaper than the library defaults while remaining a strong, memory-hard hash. Hashes
 * carry their own parameters, so existing (heavier) hashes keep verifying and are
 * upgraded transparently on the next successful sign-in.
 */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const MAX_RUNNING = Math.max(1, Number(process.env.PASSWORD_HASH_CONCURRENCY || 4));
const MAX_QUEUED = Math.max(0, Number(process.env.PASSWORD_HASH_QUEUE || 400));

let running = 0;
const queue = [];

const run = (job) => new Promise((resolve, reject) => {
  const execute = async () => {
    running += 1;
    try { resolve(await job()); } catch (err) { reject(err); } finally {
      running -= 1;
      const next = queue.shift();
      if (next) next();
    }
  };
  if (running < MAX_RUNNING) { execute(); return; }
  if (queue.length >= MAX_QUEUED) { reject(new ApiError(503, 'We are very busy right now. Please try again in a moment.', 'BUSY')); return; }
  queue.push(execute);
});

const hashPassword = (plain) => run(() => argon2.hash(plain, OPTIONS));
const verifyPassword = (hash, plain) => run(() => argon2.verify(hash, plain)).catch((err) => { if (err instanceof ApiError) throw err; return false; });
const needsRehash = (hash) => { try { return argon2.needsRehash(hash, OPTIONS); } catch { return false; } };

/** A real hash with the current parameters, so "unknown user" costs the same as "wrong password". */
let dummy;
const dummyHash = () => { dummy ||= hashPassword(randomBytes(18).toString('base64')); return dummy; };

const stats = () => ({ running, queued: queue.length });

module.exports = { hashPassword, verifyPassword, needsRehash, dummyHash, stats };
