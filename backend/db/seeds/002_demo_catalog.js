const argon2 = require('argon2');
const { v4: uuid } = require('uuid');
const { assertDemoDatabase, demoPassword, photo } = require('../demo');

/**
 * Sureshot Mart — the platform's own grocery store (seller@ demo login).
 * Product options are [name, value, stock, price?, mrp?, grams?]; price/mrp
 * default to the product's. Prices are in paise.
 * Idempotent: skips if the store exists.
 */
const PRODUCTS = [
  { title: 'Premium Basmati Rice', cat: 'staples', img: 'photo-1586201375761-83865001e31c', mrp: 19900, price: 15900, tax: 500,
    options: [['Pack', '1 kg', 120], ['Pack', '5 kg', 60, 72900, 92000, 5000]], rating: 4.5, sold: 812,
    description: 'Long-grain aged basmati that cooks fluffy and fragrant — for biryani, pulao and everyday rice.',
    highlights: ['Aged 12 months', 'Extra-long grain', 'Sortex cleaned'] },
  { title: 'Sharbati Wheat (Gehun)', cat: 'staples', img: 'photo-1574323347407-f5e1ad6d020b', mrp: 54000, price: 44900, tax: 0,
    options: [['Pack', '10 kg', 40, undefined, undefined, 10000]], rating: 4.4, sold: 305,
    description: 'Golden Sharbati wheat from Madhya Pradesh — mill it fresh for soft rotis.',
    highlights: ['MP Sharbati', 'Machine cleaned', 'Ideal for chakki atta'] },
  { title: 'Extra Virgin Olive Oil', cat: 'staples', img: 'photo-1474979266404-7eaacbcd87c5', mrp: 99900, price: 74900, tax: 500,
    options: [['Bottle', '500 ml', 50], ['Bottle', '1 L', 25, 139900, 189900, 1000]], rating: 4.3, sold: 190,
    description: 'Cold-pressed extra virgin olive oil for salads, dips and light cooking.',
    highlights: ['Cold pressed', 'Glass bottle', 'Imported'] },
  { title: 'Whole Spices Combo', cat: 'spices-masala', img: 'photo-1596040033229-a9821ebd058d', mrp: 39900, price: 29900, tax: 500,
    options: [['Pack', '6 spices (300 g)', 70]], rating: 4.6, sold: 431,
    description: 'Cardamom, cloves, cinnamon, pepper, cumin and dry red chilli — the everyday masala box refill.',
    highlights: ['6 whole spices', 'No added colour', 'Resealable packs'] },
  { title: 'Assam CTC Tea', cat: 'tea-beverages', img: 'photo-1564890369478-c89ca6d9cde9', mrp: 32000, price: 24900, tax: 500,
    options: [['Pack', '500 g', 90], ['Pack', '1 kg', 40, 46900, 60000, 1000]], rating: 4.5, sold: 640,
    description: 'Strong, malty Assam CTC for kadak chai, sourced from estates in Dibrugarh.',
    highlights: ['Strong & malty', 'Assam estates', 'Makes 250+ cups'] },
  { title: 'Toned Milk', cat: 'dairy', img: 'photo-1550583724-b2692b85b150', mrp: 3000, price: 2800, tax: 0,
    options: [['Pack', '500 ml', 200], ['Pack', '1 L', 150, 5400, 5800, 1000]], rating: 4.2, sold: 1290,
    description: 'Fresh pasteurised toned milk delivered chilled every morning.',
    highlights: ['Pasteurised', 'Delivered chilled', '3% fat'] },
  { title: 'Desi Tomatoes', cat: 'fruits-vegetables', img: 'photo-1546094096-0df4bcaaa337', mrp: 3500, price: 2900, tax: 0,
    options: [['Weight', '500 g', 120], ['Weight', '1 kg', 90, 5400, 6500, 1000]], rating: 4.3, sold: 980,
    description: 'Firm, juicy country tomatoes picked ripe for curries, chutneys and salads.',
    highlights: ['Sorted daily', 'Ripe & ready to cook', 'Local farms'] },
  { title: 'Red Onions', cat: 'fruits-vegetables', img: 'photo-1508747703725-719777637510', mrp: 5000, price: 3900, tax: 0,
    options: [['Weight', '1 kg', 180], ['Weight', '2 kg', 70, 7500, 9800, 2000]], rating: 4.4, sold: 1104,
    description: 'Medium Nashik onions with a sharp, sweet bite — the base of every Indian kitchen.',
    highlights: ['Nashik variety', 'Dry outer skin', 'Long shelf life'] },
  { title: 'Robusta Bananas', cat: 'fruits-vegetables', img: 'photo-1571771894821-ce9b6c11b08e', mrp: 4500, price: 3600, tax: 0,
    options: [['Pack', '6 pcs', 100], ['Pack', '12 pcs', 60, 6900, 8500, 1800]], rating: 4.1, sold: 760,
    description: 'Naturally ripened bananas — sweet, filling and great for breakfast or shakes.',
    highlights: ['Naturally ripened', 'No carbide', 'Rich in potassium'] },
  { title: 'Alphonso Mangoes', cat: 'fruits-vegetables', img: 'photo-1601493700631-2b16ec4b4716', mrp: 79900, price: 59900, tax: 0,
    options: [['Pack', '6 pcs', 20], ['Pack', '12 pcs', 3, 109900, 149900, 3000]], rating: 4.8, sold: 344,
    description: 'Naturally ripened Ratnagiri Alphonso — rich, fibre-free and fragrant.',
    highlights: ['Ratnagiri origin', 'Naturally ripened', 'Packed in hay'] },
  { title: 'California Almonds', cat: 'dry-fruits-nuts', img: 'photo-1508061253366-f7da158b6d46', mrp: 32000, price: 24900, tax: 500,
    options: [['Weight', '250 g', 150], ['Weight', '500 g', 90, 46900, 62000, 500]], rating: 4.6, sold: 520,
    description: 'Whole, crunchy California almonds — a handful a day for snacking, soaking or baking.',
    highlights: ['Premium kernels', 'Vacuum-packed', 'No added salt'] },
];

exports.PRODUCTS = PRODUCTS;

exports.seed = async function seed(knex) {
  assertDemoDatabase(knex);
  if (await knex('vendors').where({ store_slug: 'sureshot-mart' }).first()) return;

  const cats = Object.fromEntries((await knex('categories').select('id', 'slug')).map((c) => [c.slug, c.id]));
  const vendorRole = await knex('roles').where({ name: 'vendor' }).first();
  const customerRole = await knex('roles').where({ name: 'customer' }).first();
  const admin = await knex('users').where({ email: process.env.DEMO_ADMIN_EMAIL || 'admin@demo.sureshot.com' }).first();

  await knex.transaction(async (trx) => {
    const ownerId = uuid();
    await trx('users').insert({
      id: ownerId,
      email: process.env.DEMO_SELLER_EMAIL || 'seller@demo.sureshot.com',
      password_hash: await argon2.hash(demoPassword('DEMO_SELLER_PASSWORD'), { type: argon2.argon2id }),
      full_name: 'Rohan Mehta',
      is_email_verified: true,
      referral_code: 'SELLER01',
    });
    await trx('user_roles').insert([{ user_id: ownerId, role_id: vendorRole.id }, { user_id: ownerId, role_id: customerRole.id }]);
    await trx('wallets').insert({ id: uuid(), user_id: ownerId });

    const vendorId = uuid();
    await trx('vendors').insert({
      id: vendorId, owner_user_id: ownerId, store_name: 'Sureshot Mart', store_slug: 'sureshot-mart',
      description: 'Daily groceries — staples, spices, dairy, fruits and vegetables — packed and delivered by Sureshot.',
      status: 'approved', approved_at: trx.fn.now(), approved_by: admin?.id || null, gstin: '27ABCDE1234F1Z5',
      rating_avg: 4.5, rating_count: 640,
    });
    const warehouseId = uuid();
    await trx('warehouses').insert({
      id: warehouseId, vendor_id: vendorId, name: 'Sureshot Mart Dark Store', line1: 'Shop 4, Link Road',
      city: 'Mumbai', state: 'Maharashtra', postal_code: '400064', contact_phone: '+919800000001',
    });

    for (const [pi, p] of PRODUCTS.entries()) {
      const productId = uuid();
      await trx('products').insert({
        id: productId, vendor_id: vendorId, category_id: cats[p.cat], title: p.title,
        slug: `${p.title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')}-sureshot-mart`,
        description: p.description, highlights: JSON.stringify(p.highlights), status: 'active', tax_rate_bp: p.tax,
        return_window_days: p.tax === 0 ? 1 : 7,
        rating_avg: p.rating.toFixed(2), rating_count: Math.round(p.sold / 4), review_count: Math.round(p.sold / 6), sold_count: p.sold,
        seo_title: `${p.title} | Sureshot`, published_at: trx.fn.now(),
      });
      await trx('product_media').insert([0, 1, 2].map((mi) => ({
        id: uuid(), product_id: productId, url: photo(p.img, 900, ['entropy', 'faces', 'edges'][mi]), thumbnail_url: photo(p.img, 240), alt_text: p.title, sort_order: mi,
      })));
      for (const [oi, [optName, optValue, stock, price = p.price, mrp = p.mrp, grams = 500]] of p.options.entries()) {
        const variantId = uuid();
        await trx('product_variants').insert({
          id: variantId, product_id: productId, sku: `SSM${pi}${oi}${optValue.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}`,
          mrp_minor: mrp, sale_price_minor: price, is_default: oi === 0, weight_grams: grams,
        });
        await trx('variant_options').insert({ id: uuid(), variant_id: variantId, option_name: optName, option_value: optValue });
        await trx('inventory_stocks').insert({ variant_id: variantId, warehouse_id: warehouseId, quantity: stock, low_stock_threshold: 5 });
        await trx('inventory_movements').insert({ id: uuid(), variant_id: variantId, warehouse_id: warehouseId, movement_type: 'purchase', quantity_delta: stock, reference_type: 'seed', actor_id: ownerId });
      }
    }
  });
};
