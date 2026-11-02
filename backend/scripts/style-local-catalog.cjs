// Replace random scenery in the repository's demo catalog with relevant
// illustrative category photography. Never touches a production database or
// product media supplied by a real seller.
const db = require('../src/config/database');
const config = require('../src/config');
const images = {
  smartphones: 'photo-1511707171634-5f897ff02aa9',
  laptops: 'photo-1496181133206-80ce9b88a853',
  headphones: 'photo-1546435770-a3e426bf472b',
  'mens-clothing': 'photo-1596755094514-f87e34085b2c',
  'womens-clothing': 'photo-1515372039744-b8f02a3ae446',
  footwear: 'photo-1542291026-7eec264c27ff',
  cookware: 'photo-1556911220-bff31c812dba',
  skincare: 'photo-1608571423902-eed4a5ad8108',
};
(async () => {
  if (config.isProduction || !['localhost','127.0.0.1','::1'].includes(config.db.host)) throw new Error('Local development only');
  const rows = await db('product_media as m').join('products as p','p.id','m.product_id').join('vendors as v','v.id','p.vendor_id').join('categories as c','c.id','p.category_id').where('v.store_slug','nexa-demo-store').where('m.url','like','https://picsum.photos/%').select('m.id','c.slug');
  await db.transaction(async trx => { for (const row of rows) if (images[row.slug]) { const url = `https://images.unsplash.com/${images[row.slug]}?auto=format&fit=crop&w=900&q=85`; await trx('product_media').where({id:row.id}).update({url,thumbnail_url:url,alt_text:'Illustrative local demo catalog photography'}); } });
  console.log(`Updated ${rows.length} local demo media entries. Replace with actual seller photography before launch.`);
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.destroy());
