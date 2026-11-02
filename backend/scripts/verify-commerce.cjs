/** Exercises the actual local API, Postgres, and RBAC. Creates clearly named local test records. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { recomputeOrderStatus } = require('../src/modules/shipping/shipping.service');
const db = require('../src/config/database');
const config = require('../src/config');
if (config.isProduction || !['localhost', '127.0.0.1', '::1'].includes(config.db.host)) throw new Error('Local development database only');
require('dotenv').config();
const base = `http://127.0.0.1:${process.env.PORT || 4300}/api/v1`;
const checks = [];
async function request(path, method = 'GET', body, token, expected = 200, key) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${result.message || response.status}`);
  return result;
}
const checked = name => { checks.push(name); console.log('PASS', name); };
(async () => {
  const catalog = await request('/products?limit=8'); assert(catalog.data.length > 0); checked('Live catalog');
  const selected = await request('/products/' + catalog.data.find(p => p.min_price < 1000000).slug);
  const variant = selected.data.variants.find(v => v.is_active && v.in_stock); assert(variant); const initialStock = variant.available_stock;
  const unique = randomUUID().slice(0,8);
  const customer = (await request('/auth/register','POST',{email:`sureshot-qa-${unique}@example.com`,fullName:`Sureshot QA ${unique}`,password:`Qa-${randomUUID()}-A9`},null,201)).data;
  const token = customer.tokens.accessToken; checked('Customer registration');
  await request('/admin/analytics/summary','GET',null,token,403); checked('Customer cannot access admin analytics');
  await request('/cart/items','POST',{variantId:variant.id,quantity:0},token,400); checked('Invalid cart quantities rejected');
  const cart = (await request('/cart/items','POST',{variantId:variant.id,quantity:1},token)).data;
  assert.equal(cart.items[0].variantId, variant.id); assert.equal(cart.totals.subtotalMinor, variant.sale_price_minor); checked('Server-priced shopping bag');
  await request('/wishlist/items','POST',{productId:selected.data.id},token);
  assert((await request('/wishlist','GET',null,token)).data.some(i => i.product.id === selected.data.id));
  await request('/wishlist/items/' + selected.data.id,'DELETE',null,token); checked('Wishlist save and remove');
  const address = (await request('/addresses','POST',{recipientName:'Sureshot QA',recipientPhone:'+919000000001',line1:'QA test address - do not ship',city:'Bengaluru',state:'Karnataka',postalCode:'560001',country:'IN'},token,201)).data;
  assert((await request('/addresses','GET',null,token)).data.some(a => a.id === address.id)); checked('Address creation and retrieval');
  const idempotency = randomUUID();
  const orderBody = {addressId:address.id,paymentMethod:'cod',customerNote:'AUTOMATED LOCAL QA - DO NOT FULFIL'};
  const simultaneous = await Promise.all([
    request('/orders','POST',orderBody,token,201,idempotency),
    request('/orders','POST',orderBody,token,201,idempotency),
  ]);
  const order = simultaneous[0].data;
  assert.equal(simultaneous[1].data.orderId, order.orderId); checked('Concurrent checkout retries create one order');
  assert.equal(order.status,'confirmed'); assert.equal(order.totalMinor,cart.totals.totalMinor); checked('Cash-on-delivery checkout');
  const replay = (await request('/orders','POST',{addressId:address.id,paymentMethod:'cod'},token,201,idempotency)).data;
  assert.equal(replay.orderId,order.orderId); checked('Order retry does not create a duplicate');
  const history = (await request('/orders','GET',null,token)).data; assert(history.some(o => o.orderNumber === order.orderNumber && o.totalMinor === order.totalMinor)); checked('Order history contract');
  const detail = (await request('/orders/' + order.orderId,'GET',null,token)).data; assert.equal(detail.items.length,1); checked('Order detail');
  const stockAfter = (await request('/products/' + selected.data.slug)).data.variants.find(v => v.id === variant.id).available_stock;
  assert.equal(stockAfter, initialStock - 1); checked('Inventory reduced exactly once');
  // Delivery settles cash on delivery. Run in a rolled-back transaction so no delivered QA order is left behind.
  await db.transaction(async (trx) => {
    await trx('order_shipments').where({ order_id: order.orderId }).update({ status: 'delivered', delivered_at: trx.fn.now() });
    await recomputeOrderStatus(trx, order.orderId, null, 'Automated local QA');
    const payment = await trx('payments').where({ order_id: order.orderId, provider: 'cod' }).first();
    assert.equal(payment.status, 'captured'); assert(payment.captured_at);
    throw new Error('rollback');
  }).catch((e) => { if (e.message !== 'rollback') throw e; });
  assert.equal((await db('payments').where({ order_id: order.orderId }).first()).status, 'pending'); checked('Delivery captures the COD payment (rolled back)');
  await request('/orders/' + order.orderId + '/cancel','POST',{reason:'Automated local QA completed'},token);
  const stockRestored = (await request('/products/' + selected.data.slug)).data.variants.find(v => v.id === variant.id).available_stock;
  const inventory = await db('inventory_stocks').where({variant_id:variant.id});
  assert.equal(stockRestored,initialStock); assert(inventory.every(i => i.reserved >= 0)); checked('Cancellation restores stock without negative reservations');
  assert.equal((await request('/orders/' + order.orderId,'GET',null,token)).data.status,'cancelled'); checked('Cancelled order is persisted');
  const ticket = (await request('/support/tickets','POST',{subject:'Automated Sureshot QA',message:'Local integration check. No action needed.'},token,201)).data; assert(ticket.id); checked('Customer support request');
  const admin = (await request('/auth/login','POST',{identifier:'admin@demo.sureshot.com',password:process.env.DEMO_ADMIN_PASSWORD})).data;
  for (const route of ['/admin/analytics/summary','/admin/orders','/admin/users','/admin/vendors','/admin/settings','/admin/audit-logs','/admin/cms/banners','/admin/support/tickets']) await request(route,'GET',null,admin.tokens.accessToken);
  checked('Super admin data endpoints');
  const seller = (await request('/auth/login','POST',{identifier:process.env.DEMO_SELLER_EMAIL || 'seller@demo.sureshot.com',password:process.env.DEMO_SELLER_PASSWORD})).data;
  for (const route of ['/admin/orders','/admin/users','/admin/vendors','/admin/settings']) await request(route,'GET',null,seller.tokens.accessToken,403);
  checked('Seller cannot access admin APIs');
  const ownVendor = await db('vendors').where({ owner_user_id: seller.user.id }).first();
  const ownShipments = (await request('/vendor/shipments?limit=50','GET',null,seller.tokens.accessToken)).data;
  const ownIds = new Set((await db('order_shipments').where({ vendor_id: ownVendor.id }).select('id')).map((r) => r.id));
  assert(ownShipments.every((s) => ownIds.has(s.id)));
  const foreign = await db('order_shipments').whereNot({ vendor_id: ownVendor.id }).first();
  if (foreign) await request('/vendor/shipments/' + foreign.id,'GET',null,seller.tokens.accessToken,404);
  checked('Seller sees only its own shipments');
  const staff = (await request('/auth/register','POST',{email:`sureshot-staff-qa-${unique}@example.com`,fullName:`Sureshot Staff QA ${unique}`,password:`Qa-${randomUUID()}-A9`},null,201)).data;
  const role = await db('roles').where({name:'admin'}).first(); await db('user_roles').insert({user_id:staff.user.id,role_id:role.id});
  const refreshed = (await request('/auth/refresh','POST',{refreshToken:staff.tokens.refreshToken})).data;
  await request('/admin/orders','GET',null,refreshed.accessToken); await request('/admin/settings','GET',null,refreshed.accessToken,403); checked('Admin role cannot access super admin settings');
  const renewed = (await request('/auth/refresh','POST',{refreshToken:customer.tokens.refreshToken})).data;
  await request('/auth/me','GET',null,renewed.accessToken); await request('/auth/logout','POST',{refreshToken:renewed.refreshToken},renewed.accessToken); checked('Session refresh and logout');
  console.log(JSON.stringify({passed:checks.length,orderNumber:order.orderNumber,status:'cancelled',notes:'Only newly created QA records remain in the local development database.'},null,2));
})().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; }).finally(() => db.destroy());
