/**
 * Sureshot's department tree: [name, slug, commission bp, subcategories].
 * A subcategory may carry an Unsplash photo id, shown as its aisle image.
 * Order here is the order shown on the home page and in navigation.
 */
const CATEGORIES = [
  ['Grocery', 'grocery', 500, [
    ['Staples & Atta', 'staples', 'photo-1586201375761-83865001e31c'], ['Spices & Masala', 'spices-masala', 'photo-1596040033229-a9821ebd058d'],
    ['Tea & Beverages', 'tea-beverages', 'photo-1564890369478-c89ca6d9cde9'], ['Dairy', 'dairy', 'photo-1550583724-b2692b85b150'],
    ['Fruits & Vegetables', 'fruits-vegetables', 'photo-1546094096-0df4bcaaa337'], ['Dry Fruits & Nuts', 'dry-fruits-nuts', 'photo-1508061253366-f7da158b6d46'],
  ]],
  ['Electronics', 'electronics', 800, [['Audio', 'audio'], ['Laptops', 'laptops'], ['Speakers', 'speakers']]],
  ['Mobiles', 'mobiles', 600, [['Smartphones', 'smartphones'], ['Mobile Accessories', 'mobile-accessories']]],
  ['Watches', 'watches', 1200, [['Analog Watches', 'analog-watches'], ['Smartwatches', 'smartwatches']]],
  ['Sunglasses', 'sunglasses', 1500, [['Men’s Sunglasses', 'mens-sunglasses'], ['Women’s Sunglasses', 'womens-sunglasses']]],
  ['Men’s Fashion', 'mens-fashion', 1500, [['Shirts', 'mens-shirts'], ['Ethnic Wear', 'mens-ethnic'], ['Suits & Blazers', 'suits-blazers'], ['Winter Wear', 'mens-winter']]],
  ['Women’s Fashion', 'womens-fashion', 1500, [['Sarees', 'sarees'], ['Ethnic Sets', 'womens-ethnic'], ['Dresses', 'dresses'], ['Bottoms', 'womens-bottoms']]],
  ['Bags & Footwear', 'bags-footwear', 1500, [['Backpacks', 'backpacks'], ['Handbags', 'handbags']]],
  ['Shoes', 'shoes', 1500, [['Sneakers', 'sneakers'], ['Formal Shoes', 'formal-shoes'], ['Heels', 'heels']]],
  ['Jewellery', 'jewellery', 800, [['Necklaces', 'necklaces'], ['Earrings', 'earrings'], ['Rings', 'rings']]],
  ['Car & Bike Accessories', 'car-bike-accessories', 1200, [['Car Accessories', 'car-accessories'], ['Bike Accessories', 'bike-accessories']]],
  ['Pet Store', 'pet-store', 1000, [['Pet Food', 'pet-food'], ['Pet Accessories', 'pet-accessories']]],
  ['Beauty', 'beauty', 1500, [['Makeup', 'makeup'], ['Skincare', 'skincare']]],
  ['Kitchen Accessories', 'kitchen', 1200, [['Cookware', 'cookware'], ['Appliances', 'kitchen-appliances'], ['Tableware', 'tableware'], ['Knives & Tools', 'knives-tools']]],
  ['Toys', 'toys', 1200, [['Building Toys', 'building-toys'], ['Play Sets', 'play-sets']]],
];

/** Inserts any missing categories (roots, then children). Safe to re-run. */
const ensureCategories = async (trx, uuid) => {
  const existing = new Set((await trx('categories').select('slug')).map((c) => c.slug));
  for (const [i, [name, slug, commission, children]] of CATEGORIES.entries()) {
    if (!existing.has(slug)) {
      await trx('categories').insert({ id: uuid(), name, slug, sort_order: i, commission_rate_bp: commission, is_active: true, seo_title: `Buy ${name} Online | Sureshot` });
    }
    const parent = await trx('categories').where({ slug }).first();
    for (const [ci, [childName, childSlug, img]] of children.entries()) {
      if (!existing.has(childSlug)) {
        await trx('categories').insert({
          id: uuid(), parent_id: parent.id, name: childName, slug: childSlug, sort_order: ci, commission_rate_bp: commission, is_active: true,
          image_url: img ? `https://images.unsplash.com/${img}?auto=format&fit=crop&w=300&q=80` : null,
        });
      }
    }
  }
};

module.exports = { CATEGORIES, ensureCategories };
