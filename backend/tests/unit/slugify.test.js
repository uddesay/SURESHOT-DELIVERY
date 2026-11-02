const { slugify, uniqueSlug } = require('../../src/utils/slugify');

describe('slugify', () => {
  test('lowercases, hyphenates and strips symbols', () => {
    expect(slugify('Voltix Nova X5 5G Smartphone')).toBe('voltix-nova-x5-5g-smartphone');
    expect(slugify('  Hello   World!! @#$ ')).toBe('hello-world');
    // ™ NFKD-normalizes to the letters "tm"
    expect(slugify('Ultra—Premium™ (New)')).toBe('ultrapremiumtm-new');
  });

  test('never returns an empty slug', () => {
    expect(slugify('@#$%')).toBe('item');
  });

  test('caps length at 120 chars', () => {
    expect(slugify('a '.repeat(200)).length).toBeLessThanOrEqual(120);
  });

  test('uniqueSlug appends a random suffix', () => {
    const a = uniqueSlug('Same Title');
    const b = uniqueSlug('Same Title');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^same-title-[a-f0-9]{6}$/);
  });
});
