/** Customer-facing brand details, shown in the header, footer, home and contact pages. */
export const BRAND = {
  name: 'Sureshot',
  fullName: 'Sureshot Delivery',
  tagline: 'Your Trust. Delivered Fast.',
};

/**
 * Support phone. Set `number` (digits with country code, e.g. '919876543210')
 * to show Call / WhatsApp links everywhere; leave it empty to hide them.
 */
const number: string = '';

export const SUPPORT_PHONE = number
  ? { display: `+${number.slice(0, 2)} ${number.slice(2, 7)} ${number.slice(7)}`, tel: `tel:+${number}`, whatsapp: `https://wa.me/${number}` }
  : null;
