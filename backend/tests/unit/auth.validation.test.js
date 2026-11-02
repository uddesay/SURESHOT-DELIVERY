const schemas = require('../../src/modules/auth/auth.validation');

const validateBody = (schema, body) => schema.body.validate(body, { abortEarly: false });

describe('auth validation schemas', () => {
  describe('register', () => {
    test('accepts valid email registration', () => {
      const { error } = validateBody(schemas.register, {
        email: 'user@example.com',
        password: 'Passw0rd123',
        fullName: 'Test User',
      });
      expect(error).toBeUndefined();
    });

    test('accepts valid phone registration', () => {
      const { error } = validateBody(schemas.register, {
        phone: '+919876543210',
        password: 'Passw0rd123',
        fullName: 'Test User',
      });
      expect(error).toBeUndefined();
    });

    test('rejects registration without email or phone', () => {
      const { error } = validateBody(schemas.register, {
        password: 'Passw0rd123',
        fullName: 'Test User',
      });
      expect(error).toBeDefined();
    });

    test('rejects weak passwords', () => {
      for (const weak of ['short1A', 'alllowercase1', 'ALLUPPERCASE1', 'NoDigitsHere']) {
        const { error } = validateBody(schemas.register, {
          email: 'user@example.com',
          password: weak,
          fullName: 'Test User',
        });
        expect(error).toBeDefined();
      }
    });

    test('lowercases and trims email', () => {
      const { value } = validateBody(schemas.register, {
        email: '  USER@Example.COM ',
        password: 'Passw0rd123',
        fullName: 'Test User',
      });
      expect(value.email).toBe('user@example.com');
    });
  });

  describe('otpVerify', () => {
    test('rejects non-6-digit codes', () => {
      for (const bad of ['12345', '1234567', 'abcdef', '12 456']) {
        const { error } = validateBody(schemas.otpVerify, {
          identifier: 'user@example.com',
          code: bad,
        });
        expect(error).toBeDefined();
      }
    });

    test('accepts a valid code', () => {
      const { error } = validateBody(schemas.otpVerify, {
        identifier: '+919876543210',
        code: '123456',
      });
      expect(error).toBeUndefined();
    });
  });

  describe('login', () => {
    test('rejects invalid identifier', () => {
      const { error } = validateBody(schemas.login, { identifier: 'not-valid', password: 'x' });
      expect(error).toBeDefined();
    });
  });
});
