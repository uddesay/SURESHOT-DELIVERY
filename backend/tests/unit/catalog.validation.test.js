const schemas = require('../../src/modules/catalog/catalog.validation');

const validate = (schema, part, value) =>
  schema[part].validate(value, { abortEarly: false, stripUnknown: true, convert: true });

const validProduct = {
  title: 'Test Product Title',
  categoryId: '4c9296e0-8bff-4a7e-9d97-a5e5f3f7cf7b',
  description: 'A great product',
  variants: [
    { sku: 'TESTSKU001', mrpMinor: 100000, salePriceMinor: 80000, options: { Color: 'Red' }, initialStock: 10 },
  ],
  media: [{ url: 'https://cdn.example.com/img.jpg' }],
};

describe('catalog validation', () => {
  describe('productCreate', () => {
    test('accepts a valid product', () => {
      const { error } = validate(schemas.productCreate, 'body', validProduct);
      expect(error).toBeUndefined();
    });

    test('rejects sale price above MRP', () => {
      const { error } = validate(schemas.productCreate, 'body', {
        ...validProduct,
        variants: [{ sku: 'TESTSKU001', mrpMinor: 100, salePriceMinor: 200 }],
      });
      expect(error).toBeDefined();
      expect(error.details.some((d) => d.message.includes('mrpMinor'))).toBe(true);
    });

    test('requires at least one variant', () => {
      const { error } = validate(schemas.productCreate, 'body', { ...validProduct, variants: [] });
      expect(error).toBeDefined();
    });

    test('rejects invalid media URLs', () => {
      const { error } = validate(schemas.productCreate, 'body', {
        ...validProduct,
        media: [{ url: 'not-a-url' }],
      });
      expect(error).toBeDefined();
    });

    test('uppercases SKU', () => {
      const { value } = validate(schemas.productCreate, 'body', {
        ...validProduct,
        variants: [{ sku: 'lower123', mrpMinor: 100, salePriceMinor: 100 }],
      });
      expect(value.variants[0].sku).toBe('LOWER123');
    });
  });

  describe('productList', () => {
    test('defaults page/limit/sort and caps limit at 100', () => {
      const { value } = validate(schemas.productList, 'query', {});
      expect(value).toMatchObject({ page: 1, limit: 20, sort: 'newest' });

      const { error } = validate(schemas.productList, 'query', { limit: 500 });
      expect(error).toBeDefined();
    });

    test('rejects unknown sort values', () => {
      const { error } = validate(schemas.productList, 'query', { sort: 'cheapest' });
      expect(error).toBeDefined();
    });
  });

  describe('categoryCreate', () => {
    test('requires name and validates slug charset', () => {
      expect(validate(schemas.categoryCreate, 'body', {}).error).toBeDefined();
      expect(validate(schemas.categoryCreate, 'body', { name: 'Electronics', slug: 'Bad Slug!' }).error).toBeDefined();
      expect(validate(schemas.categoryCreate, 'body', { name: 'Electronics', slug: 'electronics-2' }).error).toBeUndefined();
    });
  });

  describe('reject', () => {
    test('requires a meaningful reason', () => {
      expect(validate(schemas.reject, 'body', { reason: 'bad' }).error).toBeDefined();
      expect(validate(schemas.reject, 'body', { reason: 'Images do not match the product description' }).error).toBeUndefined();
    });
  });
});
