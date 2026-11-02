const ApiError = require('../../src/utils/ApiError');

describe('ApiError', () => {
  test('factory methods set status and code', () => {
    expect(ApiError.badRequest('x').statusCode).toBe(400);
    expect(ApiError.badRequest('x').code).toBe('VALIDATION_ERROR');
    expect(ApiError.unauthorized().statusCode).toBe(401);
    expect(ApiError.unauthorized('expired', 'TOKEN_EXPIRED').code).toBe('TOKEN_EXPIRED');
    expect(ApiError.forbidden().statusCode).toBe(403);
    expect(ApiError.notFound('User').message).toBe('User not found');
    expect(ApiError.conflict('dup').statusCode).toBe(409);
    expect(ApiError.businessRule('rule').statusCode).toBe(422);
    expect(ApiError.rateLimited().statusCode).toBe(429);
  });

  test('is operational and instance of Error', () => {
    const err = ApiError.notFound();
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(Error);
  });
});
