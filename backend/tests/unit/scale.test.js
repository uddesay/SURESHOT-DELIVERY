/**
 * Behaviour that matters under load: the read-through cache (in-process fallback path),
 * the bounded password hasher, phone normalisation and the client-error mapping.
 */
jest.mock('../../src/config/redis', () => ({
  isAvailable: () => false, get: jest.fn(), set: jest.fn(), incr: jest.fn(), eval: jest.fn(), duplicate: jest.fn(),
}));

const cache = require('../../src/utils/cache');
const { normalizePhone, phoneCandidates } = require('../../src/utils/phone');
const { errorHandler } = require('../../src/middlewares/error.middleware');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('cache.wrap (no Redis)', () => {
  test('second read is served from memory', async () => {
    let loads = 0;
    const load = async () => { loads += 1; return { n: loads }; };
    const a = await cache.wrap('t1', 'k', 30, load);
    const b = await cache.wrap('t1', 'k', 30, load);
    expect(loads).toBe(1);
    expect(b).toEqual(a);
  });

  test('a burst of identical misses runs the loader once (single-flight)', async () => {
    let loads = 0;
    const load = async () => { loads += 1; await sleep(40); return { ok: true }; };
    const results = await Promise.all(Array.from({ length: 100 }, () => cache.wrap('t2', 'burst', 30, load)));
    expect(loads).toBe(1);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  test('null results are not cached', async () => {
    let loads = 0;
    const load = async () => { loads += 1; return null; };
    await cache.wrap('t3', 'k', 30, load);
    await cache.wrap('t3', 'k', 30, load);
    expect(loads).toBe(2);
  });

  test('a loader failure is not cached and does not wedge later reads', async () => {
    let calls = 0;
    const load = async () => { calls += 1; if (calls === 1) throw new Error('db down'); return { ok: true }; };
    await expect(cache.wrap('t4', 'k', 30, load)).rejects.toThrow('db down');
    await expect(cache.wrap('t4', 'k', 30, load)).resolves.toEqual({ ok: true });
  });

  test('bust invalidates a namespace', async () => {
    let loads = 0;
    const load = async () => { loads += 1; return { n: loads }; };
    await cache.wrap('t5', 'k', 30, load);
    await cache.bust('t5');
    await cache.wrap('t5', 'k', 30, load);
    expect(loads).toBe(2);
  });

  test('CACHE_DISABLED bypasses the cache', async () => {
    process.env.CACHE_DISABLED = 'true';
    let loads = 0;
    const load = async () => { loads += 1; return { n: loads }; };
    await cache.wrap('t6', 'k', 30, load);
    await cache.wrap('t6', 'k', 30, load);
    delete process.env.CACHE_DISABLED;
    expect(loads).toBe(2);
  });
});

describe('phone normalisation', () => {
  test.each([
    ['9876543210', '+919876543210'],
    ['98765 43210', '+919876543210'],
    ['098765-43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['+14155552671', '+14155552671'],
  ])('%s -> %s', (input, expected) => expect(normalizePhone(input)).toBe(expected));

  test('garbage gives null', () => {
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });

  test('lookup candidates cover the spellings an old row may use', () => {
    expect(phoneCandidates('9876543210')).toEqual(expect.arrayContaining(['9876543210', '+919876543210', '919876543210']));
  });
});

describe('password hashing is bounded', () => {
  test('hashes verify, and a wrong password does not', async () => {
    const { hashPassword, verifyPassword } = require('../../src/utils/password');
    const hash = await hashPassword('Correct-Horse-9');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'Correct-Horse-9')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });

  test('a burst never runs more than the configured concurrency', async () => {
    const { hashPassword, stats } = require('../../src/utils/password');
    let peak = 0;
    const watch = setInterval(() => { peak = Math.max(peak, stats().running); }, 2);
    await Promise.all(Array.from({ length: 12 }, (_, i) => hashPassword(`pw-${i}-Aa1`)));
    clearInterval(watch);
    expect(peak).toBeLessThanOrEqual(4);
    expect(stats().running).toBe(0);
  }, 30000);
});

describe('client errors are not reported as server errors', () => {
  const run = (err) => {
    const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    errorHandler(err, { originalUrl: '/x', method: 'POST' }, res, () => {});
    return res;
  };
  test('malformed JSON -> 400', () => expect(run(Object.assign(new Error('bad'), { type: 'entity.parse.failed' })).statusCode).toBe(400));
  test('oversized body -> 413', () => expect(run(Object.assign(new Error('big'), { type: 'entity.too.large' })).statusCode).toBe(413));
  test('blocked CORS origin -> 403', () => expect(run(new Error('Not allowed by CORS')).statusCode).toBe(403));
  test('unknown errors are masked as 500 and never leak a stack in production', () => {
    const config = require('../../src/config');
    const was = config.isProduction;
    config.isProduction = true;
    try {
      const res = run(new Error('secret db detail'));
      expect(res.statusCode).toBe(500);
      expect(res.body.message).not.toContain('secret db detail');
      expect(JSON.stringify(res.body)).not.toContain('secret db detail');
      expect(res.body.stack).toBeUndefined();
    } finally { config.isProduction = was; }
  });
});
