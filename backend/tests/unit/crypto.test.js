const { sha256, randomToken, generateOtp, generateReferralCode } = require('../../src/utils/crypto');

describe('crypto utils', () => {
  test('sha256 is deterministic and hex', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
    expect(sha256('abc')).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256('abc')).not.toBe(sha256('abd'));
  });

  test('randomToken is unique and URL-safe', () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(60);
  });

  test('generateOtp is always 6 digits', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });

  test('generateReferralCode is 8 uppercase alphanumerics', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateReferralCode()).toMatch(/^[A-Z0-9]{8}$/);
    }
  });
});
