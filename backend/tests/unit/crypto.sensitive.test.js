const { encryptSensitive, decryptSensitive, maskLast4 } = require('../../src/utils/crypto');

describe('encryptSensitive / decryptSensitive', () => {
  test('round-trips a plaintext value', () => {
    const plaintext = '123456789012';
    const packed = encryptSensitive(plaintext);
    expect(decryptSensitive(packed)).toBe(plaintext);
  });

  test('produces different ciphertext for the same input each time (random IV)', () => {
    const a = encryptSensitive('987654321098');
    const b = encryptSensitive('987654321098');
    expect(a).not.toBe(b);
    expect(decryptSensitive(a)).toBe(decryptSensitive(b));
  });

  test('packed format is iv:authTag:ciphertext, all base64', () => {
    const packed = encryptSensitive('112233445566');
    const parts = packed.split(':');
    expect(parts).toHaveLength(3);
    for (const part of parts) expect(part).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  test('tampered ciphertext fails to decrypt (GCM auth tag integrity)', () => {
    const packed = encryptSensitive('555566667777');
    const [iv, authTag, ciphertext] = packed.split(':');
    const tampered = [iv, authTag, `${ciphertext.slice(0, -2)}${ciphertext.slice(-2) === 'AA' ? 'BB' : 'AA'}`].join(':');
    expect(() => decryptSensitive(tampered)).toThrow();
  });
});

describe('maskLast4', () => {
  test('masks all but the last 4 characters', () => {
    expect(maskLast4('1234567890')).toBe('••••••7890');
  });

  test('leaves short values unmasked', () => {
    expect(maskLast4('1234')).toBe('1234');
    expect(maskLast4('12')).toBe('12');
  });
});
