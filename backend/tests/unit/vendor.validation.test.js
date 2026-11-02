const schemas = require('../../src/modules/vendors/vendor.validation');

const validate = (schema, part, value) =>
  schema[part].validate(value, { abortEarly: false, stripUnknown: true, convert: true });

describe('vendor registration validation', () => {
  const base = { storeName: 'Acme Traders' };

  test('accepts a minimal valid registration', () => {
    expect(validate(schemas.register, 'body', base).error).toBeUndefined();
  });

  test('accepts a valid GSTIN', () => {
    const { error } = validate(schemas.register, 'body', { ...base, gstin: '29ABCDE1234F1Z5' });
    expect(error).toBeUndefined();
  });

  test('rejects a malformed GSTIN', () => {
    for (const bad of ['29ABCDE1234F1Z', 'INVALIDGSTIN123', '29abcde1234f1z5']) {
      const { error } = validate(schemas.register, 'body', { ...base, gstin: bad });
      expect(error).toBeDefined();
    }
  });

  test('accepts a valid PAN', () => {
    expect(validate(schemas.register, 'body', { ...base, pan: 'ABCDE1234F' }).error).toBeUndefined();
  });

  test('rejects a malformed PAN', () => {
    for (const bad of ['ABCDE1234', 'abcde1234f', '1234EABCDF']) {
      const { error } = validate(schemas.register, 'body', { ...base, pan: bad });
      expect(error).toBeDefined();
    }
  });

  test('validates nested warehouse and bank account objects', () => {
    const { error } = validate(schemas.register, 'body', {
      ...base,
      warehouse: { name: 'Main WH', line1: '1 Industrial Rd', city: 'Pune', state: 'Maharashtra', postalCode: '411001' },
      bankAccount: { accountHolder: 'Acme Traders', accountNumber: '123456789012', ifsc: 'HDFC0001234', bankName: 'HDFC Bank' },
    });
    expect(error).toBeUndefined();
  });

  test('rejects an invalid IFSC in the nested bank account', () => {
    const { error } = validate(schemas.register, 'body', {
      ...base,
      bankAccount: { accountHolder: 'Acme Traders', accountNumber: '123456789012', ifsc: 'BADIFSC', bankName: 'HDFC Bank' },
    });
    expect(error).toBeDefined();
  });
});

describe('vendor bank account validation', () => {
  test('rejects non-numeric account numbers', () => {
    const { error } = validate(schemas.addBankAccount, 'body', {
      accountHolder: 'Jane Doe', accountNumber: 'ABC123XYZ0', ifsc: 'ICIC0000123', bankName: 'ICICI',
    });
    expect(error).toBeDefined();
  });

  test('accepts a valid bank account', () => {
    const { error } = validate(schemas.addBankAccount, 'body', {
      accountHolder: 'Jane Doe', accountNumber: '000123456789', ifsc: 'ICIC0000123', bankName: 'ICICI',
    });
    expect(error).toBeUndefined();
  });
});

describe('KYC document review validation', () => {
  test('requires rejectionReason when status is rejected', () => {
    const { error } = validate(schemas.reviewKycDocument, 'body', { status: 'rejected' });
    expect(error).toBeDefined();
  });

  test('does not require rejectionReason when approved', () => {
    const { error } = validate(schemas.reviewKycDocument, 'body', { status: 'approved' });
    expect(error).toBeUndefined();
  });
});
