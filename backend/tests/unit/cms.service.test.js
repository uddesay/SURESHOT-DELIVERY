const { slugify, uniqueSlug } = require('../../src/utils/slugify');

// cms.service.js reuses slugify/uniqueSlug for pages/blogs exactly like the
// catalog module — these tests confirm the CMS slug inputs (titles with
// punctuation, long titles) behave the same way already verified for products.
describe('CMS slug generation', () => {
  test('blog/page titles slugify predictably', () => {
    expect(slugify('10 Tips for Faster Shipping')).toBe('10-tips-for-faster-shipping');
    expect(slugify('Our Return Policy & FAQs')).toBe('our-return-policy-faqs');
  });

  test('uniqueSlug disambiguates duplicate titles', () => {
    const a = uniqueSlug('About Us');
    const b = uniqueSlug('About Us');
    expect(a).not.toBe(b);
    expect(a.startsWith('about-us-')).toBe(true);
  });
});
