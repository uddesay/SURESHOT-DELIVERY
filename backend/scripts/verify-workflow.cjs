#!/usr/bin/env node
/**
 * End-to-end business workflow check against a running API (local/demo database only).
 *
 *   customer sign-up -> seller application -> admin approval -> seller lists a product ->
 *   admin approves it -> customer buys (cart and Buy Now) -> seller packs -> rider applies ->
 *   admin approves -> admin assigns -> rider picks up and delivers (COD) -> order settles,
 *   plus cancellation/stock restore and the access-control edges between roles.
 *
 *   npm --prefix backend run test:workflow
 */
require('dotenv').config();
const { randomUUID } = require('node:crypto');

const port = process.env.PORT || 4300;
const base = `http://127.0.0.1:${port}/api/v1`;
const stamp = Date.now().toString(36);
let failures = 0;

const call = async (path, method = 'GET', body, token, headers = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined || body === null ? undefined : JSON.stringify(body),
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
};
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
};
const must = (r, label) => {
  if (r.status >= 300) { check(label, false, `${r.status} ${r.message || ''}`); throw new Error(`${label} failed`); }
  return r;
};
const token = (r) => r.data.tokens?.accessToken || r.data.accessToken;
const login = async (identifier, password) => token(must(await call('/auth/login', 'POST', { identifier, password }), `login ${identifier}`));

(async () => {
  const admin = await login(process.env.DEMO_ADMIN_EMAIL, process.env.DEMO_ADMIN_PASSWORD);
  const password = `Wf-${stamp}-Aa9`;

  // ---------- 1. customer signs up
  const custEmail = `wf-customer-${stamp}@example.com`;
  const reg = await call('/auth/register', 'POST', { email: custEmail, password, fullName: 'Workflow Customer', phone: `+9170${String(Date.now()).slice(-8)}` });
  check('customer registers', reg.status === 201, String(reg.status));
  const customer = await login(custEmail, password);
  const address = must(await call('/addresses', 'POST', { recipientName: 'Workflow Customer', recipientPhone: '+919000000123', line1: '12 Test Street', city: 'Mumbai', state: 'Maharashtra', postalCode: '400001', country: 'IN', label: 'home' }, customer), 'add address').data;

  // ---------- 2. seller applies
  const sellerEmail = `wf-seller-${stamp}@example.com`;
  must(await call('/auth/register', 'POST', { email: sellerEmail, password, fullName: 'Workflow Seller' }), 'seller sign-up');
  const sellerUser = await login(sellerEmail, password);
  const application = must(await call('/vendor/register', 'POST', {
    storeName: `Workflow Store ${stamp}`, description: 'End-to-end test store', supportPhone: '+919000000456',
    warehouse: { name: 'Main warehouse', line1: '1 Market Road', city: 'Mumbai', state: 'Maharashtra', postalCode: '400001', contactPhone: '+919000000456' },
  }, sellerUser), 'vendor register');
  const vendorId = application.data.id;
  const sellerToken = await login(sellerEmail, password); // refresh claims (vendor role)
  const early = await call('/vendor/products', 'POST', { title: 'Too early', categoryId: randomUUID(), variants: [{ sku: 'EARLY1', mrpMinor: 1000, salePriceMinor: 900 }] }, sellerToken);
  check('unapproved seller cannot list products', early.status === 403, String(early.status));

  // ---------- 3. admin approves the seller
  const approved = await call(`/admin/vendors/${vendorId}/approve`, 'POST', {}, admin);
  check('admin approves seller', approved.status === 200, approved.message);
  const seller = await login(sellerEmail, password);

  // ---------- 4. seller lists a product, admin approves it
  const categories = (await call('/categories')).data;
  const category = categories.find((c) => c.slug === 'electronics').children[0];
  const warehouse = (await call('/vendor/warehouses', 'GET', null, seller)).data[0];
  const product = must(await call('/vendor/products', 'POST', {
    title: `Workflow Gadget ${stamp}`, categoryId: category.id, description: 'Created by the workflow test', taxRateBp: 1800,
    media: [{ url: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600', altText: 'gadget' }],
    variants: [{ sku: `WF${stamp.toUpperCase()}A`, mrpMinor: 200000, salePriceMinor: 150000, initialStock: 10, options: { Colour: 'Black' } }],
    warehouseId: warehouse.id, submit: true,
  }, seller), 'create product').data;
  const hidden = await call(`/products/${product.slug}`);
  check('pending product is not public', hidden.status === 404, String(hidden.status));
  const productApproved = await call(`/admin/products/${product.id}/approve`, 'POST', {}, admin);
  check('admin approves product', productApproved.status === 200, productApproved.message);
  const visible = await call(`/products/${product.slug}`);
  check('approved product is public', visible.status === 200 && visible.data.title.includes('Workflow Gadget'));
  const variant = visible.data.variants[0];

  // ---------- 5. customer buys: cart checkout
  must(await call('/cart/items', 'POST', { variantId: variant.id, quantity: 2 }, customer), 'add to cart');
  const order = must(await call('/orders', 'POST', { addressId: address.id, paymentMethod: 'cod' }, customer, { 'Idempotency-Key': randomUUID() }), 'cart checkout').data;
  check('cart checkout places a COD order', Boolean(order.orderNumber), order.orderNumber);
  const replay = await call('/orders', 'POST', { addressId: address.id, paymentMethod: 'cod' }, customer, { 'Idempotency-Key': randomUUID() });
  check('empty cart cannot be checked out again', replay.status >= 400, String(replay.status));

  // ---------- 6. customer buys: Buy Now (cart untouched)
  must(await call('/cart/items', 'POST', { variantId: variant.id, quantity: 1 }, customer), 'refill cart');
  const buyNow = must(await call('/orders', 'POST', { addressId: address.id, paymentMethod: 'cod', buyNow: { variantId: variant.id, quantity: 1 } }, customer, { 'Idempotency-Key': randomUUID() }), 'buy now').data;
  const cartAfter = (await call('/cart', 'GET', null, customer)).data;
  check('Buy Now leaves the cart intact', cartAfter.items.length === 1 && cartAfter.items[0].quantity === 1);

  // ---------- 7. seller sees and packs the order
  const shipments = (await call('/vendor/shipments?limit=20', 'GET', null, seller)).data;
  const shipment = shipments.find((s) => s.order_number === order.orderNumber);
  check('seller sees the new order', Boolean(shipment), `${shipments.length} shipment(s)`);
  const packed = await call(`/vendor/shipments/${shipment.id}/pack`, 'POST', {}, seller);
  check('seller packs the order', packed.status === 200, packed.message);

  // ---------- 8. rider applies, admin approves, rider works the job
  const phone = `9${String(Date.now()).slice(-9)}`;
  const apply = await call('/delivery/apply', 'POST', { fullName: 'Workflow Rider', phone, city: 'Mumbai', vehicleType: 'bike', vehicleNumber: 'mh01wf0001', password });
  check('rider application is accepted', apply.status === 201, apply.message);
  const noLoginYet = await call('/auth/login', 'POST', { identifier: phone, password });
  check('applicant cannot sign in before approval', noLoginYet.status === 401, String(noLoginYet.status));
  const pending = (await call('/admin/delivery/applications?status=pending', 'GET', null, admin)).data.find((a) => a.full_name === 'Workflow Rider' && a.phone.endsWith(phone));
  check('admin sees the pending application', Boolean(pending));
  check('application never exposes the password hash', pending && !('password_hash' in pending));
  const approvedRider = await call(`/admin/delivery/applications/${pending.id}/approve`, 'POST', {}, admin);
  check('admin approves the rider', approvedRider.status === 200, approvedRider.message);
  const again = await call(`/admin/delivery/applications/${pending.id}/approve`, 'POST', {}, admin);
  check('an application cannot be approved twice', again.status === 422, String(again.status));
  const rider = await login(phone, password); // the number the applicant typed, unformatted
  check('approved rider signs in with the plain 10-digit number', Boolean(rider));
  must(await call('/delivery/me', 'PATCH', { isOnline: true }, rider), 'rider goes online');

  const partners = (await call('/admin/delivery/partners', 'GET', null, admin)).data;
  const partner = partners.find((p) => p.full_name === 'Workflow Rider');
  const assign = await call(`/admin/delivery/shipments/${shipment.id}/assign`, 'POST', { partnerId: partner.id }, admin);
  check('admin assigns the rider', assign.status === 200, assign.message);
  check('COD amount is shown to the rider', assign.data?.cod_due_minor > 0, String(assign.data?.cod_due_minor));
  const jobs = (await call('/delivery/jobs', 'GET', null, rider)).data;
  check('rider sees the job', jobs.some((j) => j.id === shipment.id));
  check('rider cannot deliver before pickup', (await call(`/delivery/jobs/${shipment.id}/deliver`, 'POST', { codCollected: true }, rider)).status === 422);
  check('rider picks up', (await call(`/delivery/jobs/${shipment.id}/pickup`, 'POST', {}, rider)).status === 200);
  check('rider must collect COD cash', (await call(`/delivery/jobs/${shipment.id}/deliver`, 'POST', { codCollected: false }, rider)).status === 422);
  const delivered = await call(`/delivery/jobs/${shipment.id}/deliver`, 'POST', { codCollected: true, note: 'Handed over' }, rider);
  check('rider delivers with COD collected', delivered.status === 200 && delivered.data.status === 'delivered', delivered.message);

  // ---------- 9. order and payment settle
  const mine = (await call('/orders?limit=20', 'GET', null, customer)).data;
  const settled = mine.find((o) => o.orderNumber === order.orderNumber);
  check('customer sees the order as delivered', settled?.status === 'delivered', settled?.status);

  // ---------- 10. cancel + stock restore on the Buy Now order
  // Real stock comes from the seller inventory API (the public product page is cached for a few seconds).
  const liveStock = async () => (await call(`/vendor/inventory?q=${encodeURIComponent(product.title)}&limit=5`, 'GET', null, seller)).data[0].available;
  const stockBefore = await liveStock();
  const buyNowId = (await call('/orders?limit=20', 'GET', null, customer)).data.find((o) => o.orderNumber === buyNow.orderNumber).id;
  const cancel = await call(`/orders/${buyNowId}/cancel`, 'POST', { reason: 'Changed my mind' }, customer);
  check('customer cancels an unshipped order', cancel.status === 200, cancel.message);
  const stockAfter = await liveStock();
  check('cancelling restores stock', stockAfter === stockBefore + 1, `${stockBefore} -> ${stockAfter}`);

  // ---------- 11. role boundaries
  check('customer cannot open the rider API', (await call('/delivery/me', 'GET', null, customer)).status === 403);
  check('rider cannot open the seller API', (await call('/vendor/products', 'GET', null, rider)).status === 403);
  check('rider cannot open the admin API', (await call('/admin/delivery/partners', 'GET', null, rider)).status === 403);
  check('seller cannot see another seller\'s shipment', (await call(`/vendor/shipments/${randomUUID()}`, 'GET', null, seller)).status === 404);
  check('seller cannot touch the fleet admin', (await call('/admin/delivery/applications', 'GET', null, seller)).status === 403);
  check('anonymous visitors cannot read orders', (await call('/orders', 'GET')).status === 401);

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll workflow checks passed');
  process.exitCode = failures ? 1 : 0;
})().catch((err) => { console.error(`\n✗ ${err.message}`); process.exitCode = 1; });
