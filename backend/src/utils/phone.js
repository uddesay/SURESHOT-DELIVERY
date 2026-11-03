/**
 * Indian-first phone normalisation so "98765 43210", "09876543210", "919876543210" and
 * "+91 98765 43210" all become "+919876543210". Other international numbers keep
 * their own country code. Returns null for input that cannot be a phone number.
 */
const normalizePhone = (input) => {
  if (input === undefined || input === null) return null;
  const raw = String(input).trim();
  const hadPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  let national = digits;
  if (!hadPlus) {
    if (national.length === 10) return `+91${national}`;
    if (national.length === 11 && national.startsWith('0')) return `+91${national.slice(1)}`;
    if (national.length === 12 && national.startsWith('91')) return `+${national}`;
  }
  if (national.length < 8 || national.length > 15) return null;
  national = digits;
  return `+${national}`;
};

/** Every spelling an existing row might have been stored with (for backward-compatible lookups). */
const phoneCandidates = (input) => {
  const raw = String(input || '').trim();
  const normalized = normalizePhone(raw);
  return [...new Set([raw, normalized, normalized ? normalized.slice(1) : null, normalized && normalized.startsWith('+91') ? normalized.slice(3) : null].filter(Boolean))];
};

module.exports = { normalizePhone, phoneCandidates };
