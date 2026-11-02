jest.mock('../../src/config/redis', () => ({ isAvailable: jest.fn(), eval: jest.fn() }));
jest.mock('../../src/config', () => ({ isProduction: false }));
jest.mock('../../src/utils/logger', () => ({ warn: jest.fn(), error: jest.fn() }));
jest.mock('../../src/middlewares/postgresRateLimit', () => jest.fn());
const redis = require('../../src/config/redis');
const config = require('../../src/config');
const { rateLimiter } = require('../../src/middlewares/rateLimiter.middleware');
const response = () => ({ setHeader: jest.fn() });
beforeEach(() => { jest.clearAllMocks(); config.isProduction = false; config.rateLimitStore = 'redis'; redis.isAvailable.mockReturnValue(false); });
test('development still limits credential attempts during a Redis outage', async () => {
  const limiter = rateLimiter({ keyPrefix: 'test-local', windowSeconds: 60, max: 2 });
  const next = jest.fn(); const res = response();
  await limiter({ ip: 'local-user' }, res, next);
  await limiter({ ip: 'local-user' }, res, next);
  await limiter({ ip: 'local-user' }, res, next);
  expect(next.mock.calls[0]).toEqual([]);
  expect(next.mock.calls[2][0].statusCode).toBe(429);
  expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
});
test('production rejects requests when shared rate limiting is down', async () => {
  config.isProduction = true; const next = jest.fn();
  await rateLimiter({ keyPrefix: 'prod', windowSeconds: 60, max: 10 })({ ip: 'x' }, response(), next);
  expect(next.mock.calls[0][0].statusCode).toBe(503);
});
test('Redis operation is atomic and rejects an over-limit count', async () => {
  redis.isAvailable.mockReturnValue(true); redis.eval.mockResolvedValue([11, 55]);
  const next = jest.fn();
  await rateLimiter({ keyPrefix: 'auth', windowSeconds: 60, max: 10 })({ ip: 'x' }, response(), next);
  expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('EXPIRE'), 1, 'rl:auth:x', 60);
  expect(next.mock.calls[0][0].statusCode).toBe(429);
});
test('production fails closed if Redis disconnects between availability check and command', async () => {
  config.isProduction = true; redis.isAvailable.mockReturnValue(true); redis.eval.mockRejectedValue(new Error('down'));
  const next = jest.fn();
  await rateLimiter({ keyPrefix: 'race', windowSeconds: 60, max: 10 })({ ip: 'x' }, response(), next);
  expect(next.mock.calls[0][0].statusCode).toBe(503);
});

test('PostgreSQL limits requests without a Redis connection', async () => {
  config.isProduction = true; config.rateLimitStore = 'postgres';
  require('../../src/middlewares/postgresRateLimit').mockResolvedValue([11, 30]);
  const next = jest.fn();
  await rateLimiter({ keyPrefix: 'pg', windowSeconds: 60, max: 10 })({ ip: 'x' }, response(), next);
  expect(next.mock.calls[0][0].statusCode).toBe(429);
  expect(redis.eval).not.toHaveBeenCalled();
});
test('PostgreSQL outages fail closed', async () => {
  config.isProduction = true; config.rateLimitStore = 'postgres';
  require('../../src/middlewares/postgresRateLimit').mockRejectedValue(new Error('down'));
  const next = jest.fn();
  await rateLimiter({ keyPrefix: 'pg', windowSeconds: 60, max: 10 })({ ip: 'x' }, response(), next);
  expect(next.mock.calls[0][0].statusCode).toBe(503);
});
