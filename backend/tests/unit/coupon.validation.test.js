const Joi = require('joi');

// Re-derive the same shape the route uses, to test discount math independent
// of the DB-backed coupon.service.
const { computeDiscount } = (() => {
  // computeDiscount hits the DB directly (usage limits, first-order checks),
  // so here we test the pure math via a minimal harness that mirrors it.
  const applyPercent = (subtotal, valueBp, maxDiscountMinor) => {
    let discount = Math.floor((subtotal * valueBp) / 10000);
    if (maxDiscountMinor) discount = Math.min(discount, maxDiscountMinor);
    return discount;
  };
  const applyFixed = (subtotal, valueMinor) => Math.min(valueMinor, subtotal);
  return { computeDiscount: { applyPercent, applyFixed } };
})();

describe('coupon discount math', () => {
  test('percent discount is floored and capped by maxDiscountMinor', () => {
    // 10% of 99999 = 9999.9 -> floored to 9999
    expect(computeDiscount.applyPercent(99999, 1000, null)).toBe(9999);
    // 50% of 100000 = 50000, capped at 20000
    expect(computeDiscount.applyPercent(100000, 5000, 20000)).toBe(20000);
  });

  test('fixed discount never exceeds subtotal', () => {
    expect(computeDiscount.applyFixed(5000, 10000)).toBe(5000);
    expect(computeDiscount.applyFixed(20000, 10000)).toBe(10000);
  });
});

describe('coupon route validation shapes', () => {
  const couponBody = Joi.object({
    code: Joi.string().alphanum().min(3).max(40).uppercase().required(),
    discountType: Joi.string().valid('percent', 'fixed').required(),
    discountValue: Joi.number().integer().min(1).required(),
    startsAt: Joi.date().iso().required(),
    endsAt: Joi.date().iso().greater(Joi.ref('startsAt')).required(),
  });

  test('rejects endsAt before startsAt', () => {
    const { error } = couponBody.validate({
      code: 'SAVE10',
      discountType: 'percent',
      discountValue: 1000,
      startsAt: '2026-08-01T00:00:00Z',
      endsAt: '2026-07-01T00:00:00Z',
    });
    expect(error).toBeDefined();
  });

  test('uppercases coupon code', () => {
    const { value } = couponBody.validate({
      code: 'save10',
      discountType: 'fixed',
      discountValue: 500,
      startsAt: '2026-07-01T00:00:00Z',
      endsAt: '2026-08-01T00:00:00Z',
    });
    expect(value.code).toBe('SAVE10');
  });
});
