const crypto = require('crypto');

/** URL-safe slug from arbitrary text. */
const slugify = (text) =>
  text
    .toString()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'item';

/** Slug with a short random suffix — collision-safe without a DB round trip. */
const uniqueSlug = (text) => `${slugify(text)}-${crypto.randomBytes(3).toString('hex')}`;

module.exports = { slugify, uniqueSlug };
