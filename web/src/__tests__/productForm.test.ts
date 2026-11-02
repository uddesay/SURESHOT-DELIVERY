import { describe, expect, it } from 'vitest';

import { blankProduct, blankVariant, sectionOf, toPayload, validate, variantSignature } from '../pages/catalog/productForm';

const valid = () => ({
  ...blankProduct(),
  title: 'Linen shirt',
  vendorId: 'v1',
  categoryId: 'c1',
  media: [{ key: 'm', url: 'https://cdn.example.com/a.jpg', alt: '' }],
  variants: [{ ...blankVariant(), sku: 'LIN001', price: '1299', mrp: '1999', stock: '5' }],
});

describe('product form validation', () => {
  it('accepts a complete product', () => {
    expect(validate(valid(), { create: true, publishing: true })).toEqual({});
  });

  it('mirrors backend rules for SKU, price and MRP', () => {
    const form = valid();
    form.variants[0] = { ...form.variants[0]!, sku: 'bad sku', price: '500', mrp: '400' };
    const errors = validate(form, { create: true, publishing: false });
    expect(errors['variant.0.sku']).toMatch(/letters or digits/);
    expect(errors['variant.0.mrp']).toMatch(/lower than the selling price/);
    expect(sectionOf('variant.0.mrp')).toBe('pricing');
  });

  it('requires an image only when publishing', () => {
    const form = { ...valid(), media: [] };
    expect(validate(form, { create: true, publishing: false }).media).toBeUndefined();
    expect(validate(form, { create: true, publishing: true }).media).toBeDefined();
  });

  it('flags duplicate SKUs and missing variant options', () => {
    const form = valid();
    form.variants.push({ ...blankVariant(), sku: 'lin001', price: '1' });
    const errors = validate(form, { create: true, publishing: false });
    expect(errors['variant.1.sku']).toMatch(/unique/);
    expect(errors['variant.0.options']).toBeDefined();
  });
});

describe('product payload', () => {
  it('converts rupees to paise and only sends stock on create', () => {
    const created = toPayload(valid(), { create: true });
    expect(created.variants[0]).toMatchObject({ sku: 'LIN001', salePriceMinor: 129900, mrpMinor: 199900, initialStock: 5 });
    expect(created.vendorId).toBe('v1');
    const edited = toPayload(valid(), { create: false });
    expect(edited.vendorId).toBeUndefined();
    expect(edited.variants[0]).not.toHaveProperty('initialStock');
  });

  it('omits variants on edit when they did not change', () => {
    const payload = toPayload(valid(), { create: false, includeVariants: false });
    expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty('variants');
    expect(variantSignature(valid().variants)).toBe(variantSignature(valid().variants));
  });
});
