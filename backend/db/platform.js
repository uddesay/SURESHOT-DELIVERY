/**
 * Platform reference data every environment needs: RBAC, currencies, GST slabs
 * and checkout settings. Shared by the demo seed and the production bootstrap,
 * and safe to apply repeatedly (existing rows are never overwritten).
 */
const { v4: uuid } = require('uuid');

const PERMISSIONS = [
  // users
  'users:read', 'users:update', 'users:suspend', 'users:delete',
  // vendors
  'vendors:read', 'vendors:approve', 'vendors:suspend', 'vendors:update',
  // catalog
  'categories:manage', 'brands:manage',
  'products:create', 'products:read', 'products:update', 'products:delete', 'products:approve',
  'inventory:manage',
  // orders
  'orders:read', 'orders:update', 'orders:cancel', 'orders:fulfill',
  'returns:read', 'returns:approve',
  // payments
  'payments:read', 'refunds:create', 'refunds:approve',
  'payouts:read', 'payouts:approve',
  // marketing
  'coupons:manage', 'flash_sales:manage', 'banners:manage', 'notifications:send',
  // cms
  'cms:manage', 'blogs:manage',
  // reviews / support
  'reviews:moderate', 'support:manage',
  // platform
  'settings:manage', 'roles:manage', 'audit_logs:read', 'analytics:read',
  'reports:export',
  // own delivery fleet
  'delivery:manage',
];

const ROLE_PERMISSIONS = {
  super_admin: PERMISSIONS,
  admin: PERMISSIONS.filter((p) => !['roles:manage', 'settings:manage'].includes(p)),
  support_agent: ['users:read', 'orders:read', 'returns:read', 'support:manage', 'reviews:moderate'],
  vendor: [
    'products:create', 'products:read', 'products:update', 'products:delete',
    'inventory:manage', 'orders:read', 'orders:fulfill', 'returns:read',
    'coupons:manage', 'payouts:read', 'analytics:read', 'reports:export',
  ],
  customer: [],
  // riders use their own /delivery endpoints, guarded by role
  delivery_partner: [],
};

const CURRENCIES = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', exchange_rate_to_base: 1 },
  { code: 'USD', symbol: '$', name: 'US Dollar', exchange_rate_to_base: 0.012 },
];

/** India GST slabs. */
const TAX_RATES = [['GST 0%', 0], ['GST 5%', 500], ['GST 12%', 1200], ['GST 18%', 1800], ['GST 28%', 2800]];

const SETTINGS = [
  { key: 'platform.name', value: JSON.stringify('Sureshot'), description: 'Display name' },
  { key: 'checkout.cod_limit_minor', value: JSON.stringify(5000000), description: 'Max COD order (₹50,000)' },
  { key: 'checkout.free_shipping_threshold_minor', value: JSON.stringify(49900), description: 'Free shipping above ₹499' },
  { key: 'wallet.max_usage_percent', value: JSON.stringify(100), description: 'Max % of order payable by wallet' },
  { key: 'referral.reward_minor', value: JSON.stringify(10000), description: '₹100 referral reward' },
  { key: 'vendor.payout_hold_days', value: JSON.stringify(7), description: 'Days after delivery before payout eligibility' },
];

/** Inserts whatever reference data is missing. Returns the role ids by name. */
const ensurePlatformData = async (trx) => {
  await trx('permissions').insert(PERMISSIONS.map((name) => ({ id: uuid(), name }))).onConflict('name').ignore();
  await trx('roles').insert(Object.keys(ROLE_PERMISSIONS).map((name) => ({ id: uuid(), name, is_system: true }))).onConflict('name').ignore();

  const permByName = Object.fromEntries((await trx('permissions').select('id', 'name')).map((p) => [p.name, p.id]));
  const roleByName = Object.fromEntries((await trx('roles').select('id', 'name')).map((r) => [r.name, r.id]));
  const rolePermRows = Object.entries(ROLE_PERMISSIONS).flatMap(([role, perms]) =>
    perms.map((p) => ({ role_id: roleByName[role], permission_id: permByName[p] })));
  if (rolePermRows.length) await trx('role_permissions').insert(rolePermRows).onConflict(['role_id', 'permission_id']).ignore();

  await trx('currencies').insert(CURRENCIES).onConflict('code').ignore();
  const existingRates = new Set((await trx('tax_rates').select('name')).map((r) => r.name));
  const missingRates = TAX_RATES.filter(([name]) => !existingRates.has(name));
  if (missingRates.length) await trx('tax_rates').insert(missingRates.map(([name, rate_bp]) => ({ id: uuid(), name, rate_bp })));
  await trx('settings').insert(SETTINGS).onConflict('key').ignore();

  return roleByName;
};

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, ensurePlatformData };
