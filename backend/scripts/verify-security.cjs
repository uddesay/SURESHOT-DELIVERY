#!/usr/bin/env node
/**
 * Black-box security probes against a running API (local/demo database only).
 * Covers headers, brute-force limits, account enumeration, IDOR, mass assignment,
 * injection, oversized/malformed bodies, token tampering and CORS.
 *
 *   npm --prefix backend run test:security
 */
require('dotenv').config();
const crypto = require('node:crypto');

const port = process.env.PORT || 4300;
const origin = `http://127.0.0.1:${port}`;
const base = `${origin}/api/v1`;
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) failures += 1; };

const raw = (path, opts = {}) => fetch(origin + path, opts);
const call = async (path, method = 'GET', body, token, headers = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined || body === null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  return { status: res.status, headers: res.headers, ...(await res.json().catch(() => ({}))) };
};
const login = async (id, pw) => { const r = await call('/auth/login', 'POST', { identifier: id, password: pw }); return r.data?.tokens?.accessToken || r.data?.accessToken; };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

(async () => {
  // ---------- headers
  const h = (await raw('/healthz')).headers;
  check('x-powered-by is hidden', !h.get('x-powered-by'));
  check('nosniff header present', h.get('x-content-type-options') === 'nosniff');
  check('CSP header present', Boolean(h.get('content-security-policy')));
  check('HSTS header present', Boolean(h.get('strict-transport-security')));
  check('API responses are not cacheable by default', (await call('/orders')).headers.get('cache-control') === 'no-store');

  // ---------- accounts
  const aarav = await login('aarav@demo.sureshot.com', process.env.DEMO_CUSTOMER_PASSWORD);
  const diya = await login('diya@demo.sureshot.com', process.env.DEMO_CUSTOMER_PASSWORD);
  const admin = await login(process.env.DEMO_ADMIN_EMAIL, process.env.DEMO_ADMIN_PASSWORD);

  // ---------- no account enumeration on login
  const unknown = await call('/auth/login', 'POST', { identifier: `nobody-${Date.now()}@example.com`, password: 'Wrong-pass-1' });
  const wrong = await call('/auth/login', 'POST', { identifier: 'aarav@demo.sureshot.com', password: 'Wrong-pass-1' });
  check('unknown user and wrong password give the same answer', unknown.status === wrong.status && unknown.message === wrong.message, `${unknown.status}/${wrong.status}`);

  // ---------- brute force: per-account limit, without punishing the whole network
  const victim = `brute-${Date.now()}@example.com`;
  let last = 0;
  for (let i = 0; i < 13; i += 1) last = (await call('/auth/login', 'POST', { identifier: victim, password: 'Wrong-pass-1' })).status;
  check('repeated bad logins for one account get rate-limited', last === 429, String(last));
  check('...but other accounts on the same network can still sign in', Boolean(await login('diya@demo.sureshot.com', process.env.DEMO_CUSTOMER_PASSWORD)));

  // ---------- IDOR
  const orders = (await call('/orders?limit=5', 'GET', null, aarav)).data;
  if (orders.length) {
    const orderId = orders[0].id;
    check('another customer cannot read my order', [403, 404].includes((await call(`/orders/${orderId}`, 'GET', null, diya)).status));
    check('another customer cannot cancel my order', [403, 404].includes((await call(`/orders/${orderId}/cancel`, 'POST', { reason: 'not mine' }, diya)).status));
  }
  const addresses = (await call('/addresses', 'GET', null, aarav)).data;
  if (addresses.length) check('another customer cannot edit my address', [403, 404].includes((await call(`/addresses/${addresses[0].id}`, 'PATCH', { line1: 'hacked' }, diya)).status));

  // ---------- privilege escalation / mass assignment
  const reg = await call('/auth/register', 'POST', { email: `sec-${Date.now()}@example.com`, password: 'Sec-Test-123', fullName: 'Sec Test', roles: ['super_admin'], role: 'admin' });
  const t = reg.data?.tokens?.accessToken;
  const me = t ? (await call('/auth/me', 'GET', null, t)).data : null;
  check('registering with a roles field does not grant roles', !me || (!me.roles.includes('super_admin') && !me.roles.includes('admin')), JSON.stringify(me?.roles));
  if (t) {
    await call('/users/me', 'PATCH', { roles: ['super_admin'], status: 'active', fullName: 'Sec Test 2' }, t);
    const after = (await call('/auth/me', 'GET', null, t)).data;
    check('profile update cannot change roles', !after.roles.includes('super_admin'));
    check('customer cannot reach admin endpoints', (await call('/admin/users', 'GET', null, t)).status === 403);
  }

  // ---------- token tampering
  const header = b64({ alg: 'none', typ: 'JWT' });
  const none = `${header}.${b64({ sub: 'x', roles: ['super_admin'], perms: ['delivery:manage'] })}.`;
  check('unsigned (alg=none) token is rejected', (await call('/admin/delivery/partners', 'GET', null, none)).status === 401);
  check('garbage token is rejected', (await call('/orders', 'GET', null, 'not.a.token')).status === 401);
  const forged = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'x', roles: ['super_admin'] })}.${crypto.createHmac('sha256', 'guess').update('x').digest('base64url')}`;
  check('token signed with the wrong key is rejected', (await call('/admin/delivery/partners', 'GET', null, forged)).status === 401);
  check('admin routes require a token', (await call('/admin/delivery/partners')).status === 401);

  // ---------- injection
  const all = await call('/products?limit=5');
  const sqli = await call(`/products?limit=100&q=${encodeURIComponent("' OR '1'='1")}`);
  check('SQL injection in search returns no rows and no error', sqli.status === 200 && sqli.data.length === 0, `${sqli.status}, ${sqli.data?.length} rows`);
  check('injection in sort is rejected by validation', (await call(`/products?sort=${encodeURIComponent('price_asc; DROP TABLE users;--')}`)).status === 400);
  const sqli2 = await call(`/stores?q=${encodeURIComponent("%' UNION SELECT password_hash FROM users--")}&limit=5`);
  check('injection in store search is harmless', sqli2.status === 200 && (sqli2.data || []).every((s) => !('password_hash' in s)), String(sqli2.status));
  check('catalogue still intact', all.status === 200 && all.data.length > 0);

  // ---------- body handling
  const big = await call('/auth/login', 'POST', JSON.stringify({ identifier: 'a@b.co', password: 'x'.repeat(2 * 1024 * 1024) }));
  check('oversized body is refused (413)', big.status === 413, String(big.status));
  const broken = await call('/auth/login', 'POST', '{"identifier": ');
  check('malformed JSON is a 400, not a 500', broken.status === 400, String(broken.status));
  check('error responses never include a stack trace in production', process.env.NODE_ENV !== 'production' || !JSON.stringify(broken).includes('stack'));

  // ---------- CORS
  const evil = await raw('/api/v1/categories', { headers: { Origin: 'https://evil.example' } });
  check('a foreign website does not get CORS access', !evil.headers.get('access-control-allow-origin'), String(evil.headers.get('access-control-allow-origin')));
  const app = await raw('/api/v1/categories', { headers: { Origin: 'https://localhost' } });
  check('the Android app origin is allowed', app.headers.get('access-control-allow-origin') === 'https://localhost');

  // ---------- public data hygiene
  const stores = (await call('/stores?limit=5')).data;
  const leaky = stores.some((s) => ['owner_user_id', 'gstin', 'pan', 'bank', 'support_email', 'support_phone'].some((k) => k in s));
  check('public store data hides owner, GST, PAN and bank details', !leaky);
  const product = (await call('/products?limit=1')).data[0];
  const detail = (await call(`/products/${product.slug}`)).data;
  check('public product data hides owner, GST and credentials', !['owner_user_id', 'gstin', 'pan', 'password_hash', 'email', 'bank_account'].some((k) => k in detail));
  check('metrics endpoint is not public in production', process.env.NODE_ENV !== 'production' || (await raw('/metrics')).status !== 200);

  // ---------- admin + audit
  check('admin audit log is readable only with permission', (await call('/admin/audit-logs?limit=1', 'GET', null, aarav)).status === 403 && (await call('/admin/audit-logs?limit=1', 'GET', null, admin)).status === 200);

  console.log(failures ? `\n${failures} security check(s) FAILED` : '\nAll security checks passed');
  process.exitCode = failures ? 1 : 0;
})().catch((err) => { console.error(`\n✗ ${err.message}`); process.exitCode = 1; });
