const argon2 = require('argon2');
const { v4: uuid } = require('uuid');
const { assertDemoDatabase, demoPassword, photo } = require('../demo');

/**
 * Sureshot client-demo marketplace: extra vendors with their own
 * catalogues and warehouses, pending applications, customers, orders across
 * every lifecycle state (spread over recent weeks for charts), reviews,
 * coupons, banners and help content.
 *
 * All records are clearly demo data (emails end in @demo.sureshot.com).
 * Idempotent: skips when the demo marketplace already exists.
 */

const DAY = 86400000;
const daysAgo = (d, hour = 11) => new Date(Date.now() - d * DAY + hour * 3600000 - 12 * 3600000);

// Product options are [name, value, stock, price?, mrp?, grams?]; price/mrp
// default to the product's, so single-price variants stay terse.
const VENDORS = [
  {
    store: 'TechZone Electronics', slug: 'techzone-electronics', owner: 'Vikram Shah', email: 'techzone@demo.sureshot.com',
    city: 'New Delhi', state: 'Delhi', pin: '110020', gstin: '07AAFCT5678K1Z9', commission: 700,
    description: 'Authorised reseller of phones, laptops and audio — GST invoice and brand warranty on everything.',
    products: [
      { title: 'Nova X5 5G Smartphone', cat: 'smartphones', img: 'photo-1598327105666-5b89351aff97', mrp: 2499900, price: 1899900, tax: 1800,
        options: [['Storage', '8 GB + 128 GB', 30], ['Storage', '12 GB + 256 GB', 4, 2199900, 2899900]], rating: 4.4, sold: 412,
        description: '6.7" AMOLED 120 Hz display, 50 MP triple camera and a 5000 mAh battery with 67 W charging.',
        highlights: ['6.7" AMOLED 120 Hz', '50 MP triple camera', '5000 mAh · 67 W'] },
      { title: 'Pulse Lite 5G (Sunset Red)', cat: 'smartphones', img: 'photo-1567581935884-3349723552ca', mrp: 1599900, price: 1199900, tax: 1800,
        options: [['Storage', '6 GB + 128 GB', 45]], rating: 4.2, sold: 288,
        description: 'Slim 5G phone with a bright FHD+ display and two-day battery life.',
        highlights: ['FHD+ display', '5G dual SIM', 'Two-day battery'] },
      { title: 'Onyx Pro Phone (Midnight)', cat: 'smartphones', img: 'photo-1601784551446-20c9e07cdbdb', mrp: 3499900, price: 2999900, tax: 1800,
        options: [['Storage', '12 GB + 256 GB', 12]], rating: 4.6, sold: 133,
        description: 'Flagship performance, LTPO display and a pro-grade night camera.',
        highlights: ['LTPO 1–120 Hz', 'Pro night camera', 'IP68'] },
      { title: 'ANC Wireless Headphones', cat: 'audio', img: 'photo-1546435770-a3e426bf472b', mrp: 999900, price: 649900, tax: 1800,
        options: [['Colour', 'Graphite', 40]], rating: 4.5, sold: 521,
        description: 'Hybrid active noise cancellation, 40-hour battery and multipoint Bluetooth.',
        highlights: ['Hybrid ANC', '40 h playback', 'Multipoint BT 5.3'] },
      { title: 'True Wireless Earbuds', cat: 'audio', img: 'photo-1606220588913-b3aacb4d2f46', mrp: 499900, price: 199900, tax: 1800,
        options: [['Colour', 'Black', 80]], rating: 4.1, sold: 689,
        description: 'Low-latency earbuds with quad-mic calls and 36 hours with the case.',
        highlights: ['Quad-mic ENC', '36 h with case', 'Low-latency mode'] },
      { title: 'Studio Wired Headphones', cat: 'audio', img: 'photo-1484704849700-f032a568e944', mrp: 349900, price: 249900, tax: 1800,
        options: [['Colour', 'Silver & Tan', 25]], rating: 4.3, sold: 140,
        description: 'Retro-styled closed-back headphones with 40 mm drivers and a detachable cable.',
        highlights: ['40 mm drivers', 'Detachable cable', 'Memory-foam cushions'] },
      { title: 'AirBook 14 Laptop', cat: 'laptops', img: 'photo-1496181133206-80ce9b88a853', mrp: 8999900, price: 6999900, tax: 1800,
        options: [['Config', '16 GB / 512 GB', 10], ['Config', '16 GB / 1 TB', 2, 7999900, 9999900]], rating: 4.5, sold: 96,
        description: '14" 2.8K display, all-day battery and a 1.2 kg aluminium body.',
        highlights: ['2.8K display', '18 h battery', '1.2 kg'] },
      { title: 'Waterproof Bluetooth Speaker', cat: 'speakers', img: 'photo-1518671678551-911467efe539', mrp: 499900, price: 249900, tax: 1800,
        options: [['Colour', 'Black', 60]], rating: 4.4, sold: 402,
        description: '20 W stereo sound, IPX7 waterproof and 16-hour playback.',
        highlights: ['20 W stereo', 'IPX7', '16 h playback'] },
    ],
  },
  {
    store: 'Time & Shades', slug: 'time-and-shades', owner: 'Arjun Kapoor', email: 'timeshades@demo.sureshot.com',
    city: 'Mumbai', state: 'Maharashtra', pin: '400050', gstin: '27AAKCT1234M1Z2', commission: null,
    description: 'Watches and sunglasses — classic analog, smartwatches and UV400 eyewear.',
    products: [
      { title: 'Minimal Leather Analog Watch', cat: 'analog-watches', img: 'photo-1524592094714-0f0654e20314', mrp: 499900, price: 299900, tax: 1800,
        options: [['Strap', 'Tan Leather', 30]], rating: 4.6, sold: 330,
        description: 'Clean white dial, Japanese quartz movement and a genuine leather strap.',
        highlights: ['Japanese quartz', 'Genuine leather', '3 ATM'] },
      { title: 'Rose Gold Women’s Watch', cat: 'analog-watches', img: 'photo-1522312346375-d1a52e2b99b3', mrp: 599900, price: 349900, tax: 1800,
        options: [['Strap', 'Rose Gold Mesh', 18]], rating: 4.5, sold: 210,
        description: 'Slim rose-gold case with a mesh strap — dressy enough for every day.',
        highlights: ['Slim case', 'Mesh strap', 'Mineral glass'] },
      { title: 'Fit Pro Smartwatch', cat: 'smartwatches', img: 'photo-1523275335684-37898b6baf30', mrp: 999900, price: 449900, tax: 1800,
        options: [['Strap', 'White', 42], ['Strap', 'Black', 4]], rating: 4.3, sold: 521,
        description: 'AMOLED display, SpO2 and heart-rate tracking, Bluetooth calling and 7-day battery.',
        highlights: ['AMOLED', 'Bluetooth calling', '7-day battery'] },
      { title: 'Active Fitness Smartwatch', cat: 'smartwatches', img: 'photo-1508685096489-7aacd43bd3b1', mrp: 699900, price: 299900, tax: 1800,
        options: [['Strap', 'Black', 50]], rating: 4.1, sold: 377,
        description: '100+ sport modes, GPS route tracking and 5 ATM water resistance.',
        highlights: ['Built-in GPS', '100+ sport modes', '5 ATM'] },
      { title: 'Round Metal Sunglasses', cat: 'womens-sunglasses', img: 'photo-1511499767150-a48a237f0083', mrp: 249900, price: 129900, tax: 1800,
        options: [['Lens', 'Green Tint', 60]], rating: 4.4, sold: 288,
        description: 'Lightweight gold-tone round frames with UV400 tinted lenses.',
        highlights: ['UV400', 'Metal frame', 'Case included'] },
      { title: 'Tortoise Wayfarer Sunglasses', cat: 'mens-sunglasses', img: 'photo-1577803645773-f96470509666', mrp: 199900, price: 99900, tax: 1800,
        options: [['Lens', 'Brown Gradient', 70]], rating: 4.2, sold: 402,
        description: 'Classic tortoise-shell wayfarers with gradient polarised lenses.',
        highlights: ['Polarised', 'UV400', 'Unisex fit'] },
    ],
  },
  {
    store: 'StyleKart Fashion', slug: 'stylekart-fashion', owner: 'Ananya Iyer', email: 'stylekart@demo.sureshot.com',
    city: 'Jaipur', state: 'Rajasthan', pin: '302001', gstin: '08AAKCK1234M1Z2', commission: null,
    description: 'Men’s and women’s fashion — ethnic, formal and everyday wear from Indian labels.',
    products: [
      { title: 'Men’s Denim Casual Shirt', cat: 'mens-shirts', img: 'photo-1596755094514-f87e34085b2c', mrp: 199900, price: 109900, tax: 500,
        options: [['Size', 'M', 30], ['Size', 'L', 25], ['Size', 'XL', 2]], rating: 4.3, sold: 412,
        description: 'Soft washed denim shirt with a regular fit and button-down pockets.',
        highlights: ['100% cotton denim', 'Regular fit', 'Machine wash'] },
      { title: 'Men’s White Cotton Kurta', cat: 'mens-ethnic', img: 'photo-1600586634514-0d856b8d187b', mrp: 249900, price: 129900, tax: 500,
        options: [['Size', 'M', 25], ['Size', 'L', 21], ['Size', 'XL', 0]], rating: 4.2, sold: 240,
        description: 'Breathable cotton kurta with a mandarin collar for festive and everyday wear.',
        highlights: ['Pure cotton', 'Mandarin collar', 'Relaxed fit'] },
      { title: 'Men’s Black Slim-Fit Suit', cat: 'suits-blazers', img: 'photo-1617127365659-c47fa864d8bc', mrp: 1499900, price: 899900, tax: 1200,
        options: [['Size', '38', 8], ['Size', '40', 10], ['Size', '42', 5]], rating: 4.5, sold: 96,
        description: 'Two-piece slim-fit suit in a stretch wool blend — weddings, interviews, everything between.',
        highlights: ['Two-piece', 'Stretch blend', 'Slim fit'] },
      { title: 'Men’s Navy Blazer Suit', cat: 'suits-blazers', img: 'photo-1617137968427-85924c800a22', mrp: 1299900, price: 799900, tax: 1200,
        options: [['Size', '38', 6], ['Size', '40', 9]], rating: 4.4, sold: 77,
        description: 'Sharp navy two-piece suit with a notch lapel and tapered trousers.',
        highlights: ['Notch lapel', 'Tapered trousers', 'Dry clean'] },
      { title: 'Men’s Crew-Neck Sweatshirt', cat: 'mens-winter', img: 'photo-1620799140408-edc6dcb6d633', mrp: 149900, price: 79900, tax: 500,
        options: [['Size', 'M', 40], ['Size', 'L', 35]], rating: 4.1, sold: 180,
        description: 'Brushed-fleece crew-neck sweatshirt in off-white — layer it all winter.',
        highlights: ['Brushed fleece', 'Ribbed cuffs', 'Unisex fit'] },
      { title: 'Banarasi Silk Blend Saree', cat: 'sarees', img: 'photo-1610030469983-98e550d6193c', mrp: 799900, price: 459900, tax: 500,
        options: [['Colour', 'Purple & Gold', 9]], rating: 4.7, sold: 188,
        description: 'Zari-woven silk-blend saree with an unstitched blouse piece. Festive and wedding ready.',
        highlights: ['Zari weave', '6.3 m with blouse', 'Dry clean only'] },
      { title: 'White Anarkali Gown', cat: 'womens-ethnic', img: 'photo-1583391733956-3750e0ff4e8b', mrp: 549900, price: 299900, tax: 500,
        options: [['Size', 'S', 14], ['Size', 'M', 3], ['Size', 'L', 18]], rating: 4.5, sold: 312,
        description: 'Flowing floor-length anarkali in soft georgette with delicate embroidery.',
        highlights: ['Georgette', 'Floor length', 'With dupatta'] },
      { title: 'Women’s White Summer Dress', cat: 'dresses', img: 'photo-1515372039744-b8f02a3ae446', mrp: 249900, price: 139900, tax: 500,
        options: [['Size', 'S', 20], ['Size', 'M', 20]], rating: 4.0, sold: 150,
        description: 'Light cotton off-shoulder dress for summer days.',
        highlights: ['Cotton', 'Off-shoulder', 'Lined'] },
      { title: 'Women’s Pink Joggers', cat: 'womens-bottoms', img: 'photo-1594633312681-425c7b97ccd1', mrp: 129900, price: 69900, tax: 500,
        options: [['Size', 'S', 30], ['Size', 'M', 30], ['Size', 'L', 10]], rating: 4.2, sold: 230,
        description: 'Soft, drapey joggers with an elastic waist and tapered ankles.',
        highlights: ['Elastic waist', 'Side pockets', 'Easy care'] },
    ],
  },
  {
    store: 'UrbanStep Bags & Shoes', slug: 'urbanstep', owner: 'Kabir Malhotra', email: 'urbanstep@demo.sureshot.com',
    city: 'Bengaluru', state: 'Karnataka', pin: '560038', gstin: '29AAFCU7890Q1Z6', commission: null,
    description: 'Backpacks, handbags, sneakers, formal shoes and heels.',
    products: [
      { title: 'Canvas Travel Backpack', cat: 'backpacks', img: 'photo-1547949003-9792a18a2601', mrp: 299900, price: 169900, tax: 1200,
        options: [['Colour', 'Charcoal', 35]], rating: 4.5, sold: 290,
        description: 'Water-resistant canvas with leather trims, padded laptop sleeve and 28 L capacity.',
        highlights: ['28 L', '15.6" laptop sleeve', 'Water resistant'] },
      { title: 'Everyday Laptop Backpack', cat: 'backpacks', img: 'photo-1553062407-98eeb64c6a62', mrp: 199900, price: 109900, tax: 1200,
        options: [['Colour', 'Navy', 50]], rating: 4.3, sold: 410,
        description: 'Slim everyday backpack with a hidden anti-theft pocket.',
        highlights: ['Anti-theft pocket', 'USB port', '22 L'] },
      { title: 'Red Structured Handbag', cat: 'handbags', img: 'photo-1584917865442-de89df76afd3', mrp: 349900, price: 189900, tax: 1200,
        options: [['Colour', 'Red', 20]], rating: 4.4, sold: 160,
        description: 'Top-handle structured handbag in vegan leather with a detachable strap.',
        highlights: ['Vegan leather', 'Detachable strap', 'Zip pocket'] },
      { title: 'Woven Tan Handbag', cat: 'handbags', img: 'photo-1590874103328-eac38a683ce7', mrp: 249900, price: 149900, tax: 1200,
        options: [['Colour', 'Tan', 15]], rating: 4.2, sold: 95,
        description: 'Hand-woven cane-style bag for weekends and holidays.',
        highlights: ['Hand woven', 'Cotton lining', 'Magnetic clasp'] },
      { title: 'Chunky Running Sneakers', cat: 'sneakers', img: 'photo-1560769629-975ec94e6a86', mrp: 399900, price: 219900, tax: 1200,
        options: [['Size', 'UK 7', 12], ['Size', 'UK 8', 15], ['Size', 'UK 9', 10]], rating: 4.3, sold: 260,
        description: 'Cushioned chunky sneakers with breathable mesh uppers.',
        highlights: ['Cushioned sole', 'Breathable mesh', 'Lightweight'] },
      { title: 'Pastel Low-Top Sneakers', cat: 'sneakers', img: 'photo-1595950653106-6c9ebd614d3a', mrp: 299900, price: 159900, tax: 1200,
        options: [['Size', 'UK 5', 10], ['Size', 'UK 6', 12]], rating: 4.1, sold: 140,
        description: 'Leather-look low-tops in soft pastel panels.',
        highlights: ['Padded collar', 'Rubber sole', 'Easy clean'] },
      { title: 'Brown Leather Oxford Shoes', cat: 'formal-shoes', img: 'photo-1614252235316-8c857d38b5f4', mrp: 449900, price: 279900, tax: 1200,
        options: [['Size', 'UK 8', 10], ['Size', 'UK 9', 8], ['Size', 'UK 10', 4]], rating: 4.6, sold: 190,
        description: 'Polished full-grain leather Oxfords with a leather sole.',
        highlights: ['Full-grain leather', 'Leather sole', 'Cushioned insole'] },
      { title: 'Navy Suede Pumps', cat: 'heels', img: 'photo-1515347619252-60a4bf4fff4f', mrp: 299900, price: 169900, tax: 1200,
        options: [['Size', 'UK 4', 8], ['Size', 'UK 5', 10]], rating: 4.2, sold: 110,
        description: 'Classic pointed-toe pumps in navy suede with a 9 cm heel.',
        highlights: ['9 cm heel', 'Faux suede', 'Padded footbed'] },
      { title: 'Floral Print Stilettos', cat: 'heels', img: 'photo-1543163521-1bf539c55dd2', mrp: 349900, price: 199900, tax: 1200,
        options: [['Size', 'UK 5', 6]], rating: 4.0, sold: 60,
        description: 'Statement floral-print stilettos for parties and weddings.',
        highlights: ['10 cm heel', 'Floral print', 'Cushioned'] },
    ],
  },
  {
    store: 'Rangoli Jewels', slug: 'rangoli-jewels', owner: 'Meera Soni', email: 'rangoli@demo.sureshot.com',
    city: 'Surat', state: 'Gujarat', pin: '395003', gstin: '24AAGCR3456P1Z1', commission: null,
    description: 'Handcrafted necklaces, earrings and rings — gold-plated, silver and pearl.',
    products: [
      { title: 'Freshwater Pearl Necklace', cat: 'necklaces', img: 'photo-1515562141207-7a88fb7ce338', mrp: 699900, price: 399900, tax: 300,
        options: [['Length', '18 inch', 12]], rating: 4.7, sold: 140,
        description: 'Single-strand freshwater pearls with a silver clasp, in a gift box.',
        highlights: ['Freshwater pearls', 'Silver clasp', 'Gift box'] },
      { title: 'Crescent Moon Pendant', cat: 'necklaces', img: 'photo-1599643478518-a784e5dc4c8f', mrp: 199900, price: 109900, tax: 300,
        options: [['Finish', 'Gold Plated', 30]], rating: 4.4, sold: 260,
        description: 'Layered gold-plated chains with a crescent moon and crystal drop.',
        highlights: ['Gold plated', 'Layered chains', 'Anti-tarnish'] },
      { title: 'Crystal Drop Earrings', cat: 'earrings', img: 'photo-1535632066927-ab7c9ab60908', mrp: 149900, price: 79900, tax: 300,
        options: [['Finish', 'Silver Tone', 40]], rating: 4.5, sold: 310,
        description: 'Statement crystal drop earrings with a blue stone centre.',
        highlights: ['Hypoallergenic', 'Crystal stones', 'Push-back'] },
      { title: 'Solitaire Halo Ring', cat: 'rings', img: 'photo-1605100804763-247f67b3557e', mrp: 499900, price: 299900, tax: 300,
        options: [['Size', '12', 6], ['Size', '14', 8]], rating: 4.6, sold: 90,
        description: 'Sterling silver ring with a halo-set cubic zirconia solitaire.',
        highlights: ['925 silver', 'CZ solitaire', 'Certificate'] },
    ],
  },
  {
    store: 'AutoPro Accessories', slug: 'autopro-accessories', owner: 'Harpreet Singh', email: 'autopro@demo.sureshot.com',
    city: 'Ludhiana', state: 'Punjab', pin: '141001', gstin: '03AAFCA1122L1Z4', commission: null,
    description: 'Car and bike accessories — riding gear, interiors and EV charging.',
    products: [
      { title: 'Leather Steering Wheel Cover', cat: 'car-accessories', img: 'photo-1449965408869-eaa3f722e40d', mrp: 149900, price: 79900, tax: 1800,
        options: [['Colour', 'Black', 60]], rating: 4.2, sold: 220,
        description: 'Anti-slip stitched leather cover that fits 37–39 cm steering wheels.',
        highlights: ['Anti-slip grip', 'Universal 37–39 cm', 'Breathable'] },
      { title: 'Portable EV Charging Cable', cat: 'car-accessories', img: 'photo-1617886322168-72b886573c35', mrp: 1999900, price: 1499900, tax: 1800,
        options: [['Rating', '16 A', 10]], rating: 4.4, sold: 45,
        description: 'Type-2 portable EV charger with adjustable current and a 5 m cable.',
        highlights: ['Type 2', '5 m cable', 'Over-heat protection'] },
      { title: 'Full-Face Riding Helmet', cat: 'bike-accessories', img: 'photo-1558981806-ec527fa84c39', mrp: 399900, price: 249900, tax: 1800,
        options: [['Size', 'M', 15], ['Size', 'L', 12]], rating: 4.5, sold: 180,
        description: 'ISI-certified full-face helmet with an anti-fog visor and quick-release strap.',
        highlights: ['ISI certified', 'Anti-fog visor', 'Quick release'] },
    ],
  },
  {
    store: 'Happy Paws Pet Store', slug: 'happy-paws', owner: 'Sneha Joshi', email: 'happypaws@demo.sureshot.com',
    city: 'Pune', state: 'Maharashtra', pin: '411001', gstin: '27AAHCH9012L1Z4', commission: null,
    description: 'Food, clothes and comfort for dogs and cats.',
    products: [
      { title: 'Adult Dog Dry Food (Chicken)', cat: 'pet-food', img: 'photo-1589924691995-400dc9ecc119', mrp: 199900, price: 159900, tax: 1800,
        options: [['Pack', '3 kg', 40], ['Pack', '10 kg', 10, 449900, 549900, 10000]], rating: 4.6, sold: 330,
        description: 'Complete nutrition kibble with real chicken, omega oils and no artificial colours.',
        highlights: ['Real chicken', 'Omega 3 & 6', 'No artificial colours'] },
      { title: 'Dog Hoodie (Yellow)', cat: 'pet-accessories', img: 'photo-1583337130417-3346a1be7dee', mrp: 99900, price: 59900, tax: 1200,
        options: [['Size', 'S', 20], ['Size', 'M', 15]], rating: 4.4, sold: 140,
        description: 'Cosy fleece hoodie for small and medium dogs.',
        highlights: ['Soft fleece', 'Leash opening', 'Machine wash'] },
      { title: 'Soft Plush Pet Blanket', cat: 'pet-accessories', img: 'photo-1541781774459-bb2af2f05b55', mrp: 79900, price: 49900, tax: 1200,
        options: [['Size', 'Medium', 30]], rating: 4.5, sold: 190,
        description: 'Fluffy, washable blanket your cat or dog will refuse to leave.',
        highlights: ['Ultra soft', 'Washable', '100 × 75 cm'] },
    ],
  },
  {
    store: 'Glow & Co Beauty', slug: 'glow-and-co', owner: 'Diya Patel', email: 'glow@demo.sureshot.com',
    city: 'Ahmedabad', state: 'Gujarat', pin: '380009', gstin: '24AAGCG7788P1Z1', commission: null,
    description: 'Makeup and skincare — cruelty-free and dermatologically tested.',
    products: [
      { title: '12-Shade Eyeshadow Palette', cat: 'makeup', img: 'photo-1583241800698-e8ab01830a07', mrp: 149900, price: 89900, tax: 1800,
        options: [['Shade', 'Warm Nudes', 40]], rating: 4.5, sold: 410,
        description: 'Buttery mattes and shimmers in a warm nude palette.',
        highlights: ['12 shades', 'Highly pigmented', 'Cruelty-free'] },
      { title: 'Makeup Brush Set', cat: 'makeup', img: 'photo-1596462502278-27bfdc403348', mrp: 129900, price: 69900, tax: 1800,
        options: [['Set', '8 brushes', 50]], rating: 4.3, sold: 260,
        description: 'Soft synthetic brushes for foundation, powder, blush and eyes.',
        highlights: ['8 brushes', 'Vegan bristles', 'Travel pouch'] },
      { title: 'Volumising Mascara', cat: 'makeup', img: 'photo-1631214540553-ff044a3ff1d4', mrp: 59900, price: 39900, tax: 1800,
        options: [['Shade', 'Black', 80]], rating: 4.2, sold: 520,
        description: 'Smudge-proof, buildable volume that lasts all day.',
        highlights: ['Smudge-proof', '24 h wear', 'Easy removal'] },
      { title: 'Vitamin C Face Serum', cat: 'skincare', img: 'photo-1608571423902-eed4a5ad8108', mrp: 129900, price: 79900, tax: 1800,
        options: [['Size', '30 ml', 120]], rating: 4.4, sold: 680,
        description: '20% vitamin C with hyaluronic acid to brighten and even skin tone.',
        highlights: ['20% vitamin C', 'Hyaluronic acid', 'Derm tested'] },
      { title: 'Ayurvedic Skincare Kit', cat: 'skincare', img: 'photo-1612817288484-6f916006741a', mrp: 249900, price: 169900, tax: 1800,
        options: [['Kit', 'Cleanser, toner, oil & cream', 25]], rating: 4.6, sold: 140,
        description: 'A four-step ritual made with kumkumadi, neem and saffron.',
        highlights: ['4-step kit', 'Ayurvedic', 'Paraben-free'] },
      { title: 'Daily Moisturising Lotion', cat: 'skincare', img: 'photo-1620916566398-39f1143ab7be', mrp: 49900, price: 34900, tax: 1800,
        options: [['Size', '200 ml', 90]], rating: 4.3, sold: 300,
        description: 'Lightweight, non-greasy lotion with ceramides for all skin types.',
        highlights: ['Ceramides', 'Non-greasy', 'Fragrance-free'] },
    ],
  },
  {
    store: 'HomeChef Kitchenware', slug: 'homechef-kitchenware', owner: 'Priya Kulkarni', email: 'homechef@demo.sureshot.com',
    city: 'Pune', state: 'Maharashtra', pin: '411004', gstin: '27AAHCA9012L1Z9', commission: null,
    description: 'Cookware, appliances, knives and tableware for Indian kitchens.',
    products: [
      { title: 'Stainless Steel Cookware Set', cat: 'cookware', img: 'photo-1556911220-bff31c812dba', mrp: 1299900, price: 799900, tax: 1800,
        options: [['Set', '5 pieces', 20]], rating: 4.5, sold: 230,
        description: 'Tri-ply stainless steel, induction compatible and oven-safe to 260 °C.',
        highlights: ['Tri-ply', 'Induction ready', 'Lifetime warranty'] },
      { title: 'Professional Knife Set', cat: 'knives-tools', img: 'photo-1593618998160-e34014e67546', mrp: 449900, price: 269900, tax: 1800,
        options: [['Set', '6 knives + roll', 15]], rating: 4.6, sold: 120,
        description: 'High-carbon steel knives with wooden handles and a canvas knife roll.',
        highlights: ['High-carbon steel', 'Wooden handles', 'Knife roll'] },
      { title: 'High-Speed Blender', cat: 'kitchen-appliances', img: 'photo-1585515320310-259814833e62', mrp: 699900, price: 449900, tax: 1800,
        options: [['Power', '1000 W', 18]], rating: 4.4, sold: 160,
        description: '1000 W blender with a 1.5 L jar for smoothies, chutneys and soups.',
        highlights: ['1000 W', '1.5 L jar', '2-year warranty'] },
      { title: 'Burr Coffee Grinder', cat: 'kitchen-appliances', img: 'photo-1570222094114-d054a817e56b', mrp: 599900, price: 399900, tax: 1800,
        options: [['Colour', 'Black', 10]], rating: 4.3, sold: 70,
        description: 'Conical burr grinder with 30 grind settings, espresso to French press.',
        highlights: ['30 settings', 'Conical burr', 'Low noise'] },
      { title: 'Ceramic Bowl Set', cat: 'tableware', img: 'photo-1603199506016-b9a594b593c0', mrp: 179900, price: 99900, tax: 1200,
        options: [['Set', '4 bowls', 40]], rating: 4.5, sold: 210,
        description: 'Hand-glazed ceramic bowls — microwave and dishwasher safe.',
        highlights: ['Set of 4', 'Microwave safe', 'Hand glazed'] },
    ],
  },
  {
    store: 'ToyTown', slug: 'toytown', owner: 'Rahul Verma', email: 'toytown@demo.sureshot.com',
    city: 'Lucknow', state: 'Uttar Pradesh', pin: '226010', gstin: '09AAFCT4455Q1Z6', commission: null,
    description: 'Building sets, wooden toys and play sets for every age.',
    products: [
      { title: 'Building Bricks Set (500 pcs)', cat: 'building-toys', img: 'photo-1587654780291-39c9404d746b', mrp: 199900, price: 129900, tax: 1200,
        options: [['Pack', '500 pieces', 40]], rating: 4.6, sold: 380,
        description: 'Colourful compatible bricks in a storage box — endless builds for ages 4+.',
        highlights: ['500 pieces', 'Storage box', 'BPA-free'] },
      { title: 'Mini Figures Mega Pack', cat: 'building-toys', img: 'photo-1558060370-d644479cb6f7', mrp: 149900, price: 99900, tax: 1200,
        options: [['Pack', '40 figures', 25]], rating: 4.3, sold: 150,
        description: 'Forty assorted mini figures with accessories for story play.',
        highlights: ['40 figures', 'Accessories included', 'Ages 5+'] },
      { title: 'Wooden Train Play Set', cat: 'play-sets', img: 'photo-1596461404969-9ae70f2830c1', mrp: 249900, price: 169900, tax: 1200,
        options: [['Set', '42 pieces', 20]], rating: 4.7, sold: 120,
        description: 'Sustainably sourced wooden train, tracks and town pieces.',
        highlights: ['42 pieces', 'Non-toxic paint', 'Ages 3+'] },
    ],
  },
];

const APPLICATIONS = [
  { store: 'Shree Ganesh Kirana', slug: 'shree-ganesh-kirana', owner: 'Ramesh Agarwal', email: 'ganeshkirana@demo.sureshot.com', status: 'pending',
    city: 'Nagpur', state: 'Maharashtra', gstin: '27AAGCG3456P1Z1', description: 'Neighbourhood kirana — staples, dairy and daily needs.', docs: ['gst_certificate', 'pan_card'] },
  { store: 'FitFuel Sports', slug: 'fitfuel-sports', owner: 'Arjun Reddy', email: 'fitfuel@demo.sureshot.com', status: 'under_review',
    city: 'Hyderabad', state: 'Telangana', gstin: '36AAFCF7890Q1Z6', description: 'Gym equipment, yoga gear and sports nutrition.', docs: ['gst_certificate'] },
];

const CUSTOMERS = [
  ['Aarav Sharma', 'Mumbai', 'Maharashtra', '400050'], ['Diya Patel', 'Ahmedabad', 'Gujarat', '380009'],
  ['Kabir Singh', 'Chandigarh', 'Chandigarh', '160017'], ['Ishita Banerjee', 'Kolkata', 'West Bengal', '700019'],
  ['Rahul Verma', 'Lucknow', 'Uttar Pradesh', '226010'], ['Sneha Joshi', 'Bengaluru', 'Karnataka', '560038'],
  ['Farhan Qureshi', 'Hyderabad', 'Telangana', '500034'], ['Neha Gupta', 'Jaipur', 'Rajasthan', '302017'],
];

// Status mix for the order book; spread across the last ~45 days.
const ORDER_PLAN = [
  'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered',
  'delivered', 'delivered', 'delivered', 'delivered', 'shipped', 'shipped', 'out_for_delivery', 'packed', 'processing', 'confirmed',
  'confirmed', 'confirmed', 'cancelled', 'cancelled', 'return_requested', 'delivered', 'delivered', 'shipped', 'confirmed', 'delivered',
  'delivered', 'processing', 'delivered', 'refunded',
];
const SHIPMENT_STATUS = {
  confirmed: 'pending', processing: 'processing', packed: 'packed', shipped: 'shipped', out_for_delivery: 'out_for_delivery',
  delivered: 'delivered', cancelled: 'cancelled', return_requested: 'delivered', refunded: 'delivered',
};
const HISTORY_PATH = {
  confirmed: ['confirmed'], processing: ['confirmed', 'processing'], packed: ['confirmed', 'processing', 'packed'],
  shipped: ['confirmed', 'processing', 'packed', 'shipped'], out_for_delivery: ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery'],
  delivered: ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'], cancelled: ['confirmed', 'cancelled'],
  return_requested: ['confirmed', 'processing', 'packed', 'shipped', 'delivered', 'return_requested'],
  refunded: ['confirmed', 'processing', 'packed', 'shipped', 'delivered', 'return_requested', 'refunded'],
};

// Deterministic pseudo-random so re-seeding a fresh database gives the same demo.
let state = 7;
const rand = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
const pick = (list) => list[Math.floor(rand() * list.length)];

exports.seed = async function seed(knex) {
  assertDemoDatabase(knex);
  if (await knex('vendors').where({ store_slug: 'techzone-electronics' }).first()) return;

  const roles = Object.fromEntries((await knex('roles').select('id', 'name')).map((r) => [r.name, r.id]));
  const admin = await knex('users').where({ email: process.env.DEMO_ADMIN_EMAIL || 'admin@demo.sureshot.com' }).first();
  const categories = Object.fromEntries((await knex('categories').select('id', 'slug', 'commission_rate_bp')).map((c) => [c.slug, c]));
  const vendorPasswordHash = await argon2.hash(demoPassword('DEMO_SELLER_PASSWORD'), { type: argon2.argon2id });
  const customerPasswordHash = await argon2.hash(demoPassword('DEMO_CUSTOMER_PASSWORD'), { type: argon2.argon2id });

  await knex.transaction(async (trx) => {
    const newUser = async ({ email, name, roleNames, passwordHash, createdAt }) => {
      const id = uuid();
      await trx('users').insert({
        id, email, full_name: name, password_hash: passwordHash, is_email_verified: true, status: 'active',
        referral_code: `SS${id.slice(0, 6).toUpperCase()}`, created_at: createdAt ?? trx.fn.now(),
      });
      await trx('user_roles').insert(roleNames.map((r) => ({ user_id: id, role_id: roles[r] })));
      await trx('wallets').insert({ id: uuid(), user_id: id });
      return id;
    };

    // ---- approved vendors with catalogues
    const catalog = []; // { productId, variantId, vendorId, warehouseId, title, sku, price, mrp, tax, commissionBp, image, label }
    const existingVendor = await trx('vendors').where({ store_slug: 'sureshot-mart' }).first();
    if (existingVendor) {
      const rows = await trx('product_variants as v').join('products as p', 'p.id', 'v.product_id')
        .leftJoin('categories as c', 'c.id', 'p.category_id')
        .where('p.vendor_id', existingVendor.id).where('v.is_default', true)
        .select('p.id as productId', 'v.id as variantId', 'p.title', 'v.sku', 'v.sale_price_minor', 'v.mrp_minor', 'p.tax_rate_bp', 'c.commission_rate_bp');
      const warehouse = await trx('warehouses').where({ vendor_id: existingVendor.id }).first();
      const media = Object.fromEntries((await trx('product_media').whereIn('product_id', rows.map((r) => r.productId)).where('sort_order', 0)).map((m) => [m.product_id, m.url]));
      for (const r of rows) {
        catalog.push({ productId: r.productId, variantId: r.variantId, vendorId: existingVendor.id, warehouseId: warehouse?.id ?? null, title: r.title, sku: r.sku,
          price: Number(r.sale_price_minor), mrp: Number(r.mrp_minor), tax: r.tax_rate_bp, commissionBp: r.commission_rate_bp ?? 1000, image: media[r.productId] ?? null, label: null });
      }
    }

    for (const [vi, v] of VENDORS.entries()) {
      const ownerId = await newUser({ email: v.email, name: v.owner, roleNames: ['vendor', 'customer'], passwordHash: vendorPasswordHash, createdAt: daysAgo(80 - vi * 5) });
      const vendorId = uuid();
      await trx('vendors').insert({
        id: vendorId, owner_user_id: ownerId, store_name: v.store, store_slug: v.slug, description: v.description,
        support_email: v.email, support_phone: `+9198${String(76543210 + vi * 1111).padStart(8, '0')}`, gstin: v.gstin,
        pan: v.gstin.slice(2, 12), business_type: vi === 1 ? 'private_limited' : 'proprietorship', status: 'approved',
        commission_rate_bp: v.commission, approved_at: daysAgo(70 - vi * 5), approved_by: admin?.id ?? null,
        rating_avg: (4.1 + (vi % 5) * 0.2).toFixed(2), rating_count: 60 + vi * 35, created_at: daysAgo(78 - vi * 5),
      });
      await trx('vendor_kyc_documents').insert([
        { id: uuid(), vendor_id: vendorId, doc_type: 'gst_certificate', file_url: 'https://example.com/demo-kyc/gst-certificate.pdf', status: 'approved', reviewed_by: admin?.id ?? null, reviewed_at: daysAgo(71) },
        { id: uuid(), vendor_id: vendorId, doc_type: 'pan_card', file_url: 'https://example.com/demo-kyc/pan-card.pdf', status: 'approved', reviewed_by: admin?.id ?? null, reviewed_at: daysAgo(71) },
      ]);
      const warehouseId = uuid();
      await trx('warehouses').insert({ id: warehouseId, vendor_id: vendorId, name: `${v.store} Warehouse`, line1: `${12 + vi} Market Road`, city: v.city, state: v.state, postal_code: v.pin, contact_phone: '+919800000000' });

      for (const [pi, p] of v.products.entries()) {
        const productId = uuid();
        const category = categories[p.cat];
        await trx('products').insert({
          id: productId, vendor_id: vendorId, category_id: category.id, title: p.title,
          slug: `${p.title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')}-${v.slug}`,
          description: p.description, highlights: JSON.stringify(p.highlights), status: 'active', tax_rate_bp: p.tax, return_window_days: 7,
          rating_avg: p.rating.toFixed(2), rating_count: Math.round(p.sold / 4), review_count: Math.round(p.sold / 6), sold_count: p.sold,
          seo_title: `${p.title} | Sureshot`, published_at: daysAgo(60 - pi), created_at: daysAgo(65 - pi * 2),
        });
        await trx('product_media').insert([0, 1, 2].map((mi) => ({
          id: uuid(), product_id: productId, url: photo(p.img, 900, ['entropy', 'faces', 'edges'][mi]), thumbnail_url: photo(p.img, 240), alt_text: p.title, sort_order: mi,
        })));
        for (const [oi, [optName, optValue, stock, price = p.price, mrp = p.mrp, grams = 500]] of p.options.entries()) {
          const variantId = uuid();
          const sku = `${v.slug.split('-')[0].slice(0, 4).toUpperCase()}${pi}${oi}${optValue.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}`;
          await trx('product_variants').insert({ id: variantId, product_id: productId, sku, mrp_minor: mrp, sale_price_minor: price, is_default: oi === 0, weight_grams: grams });
          await trx('variant_options').insert({ id: uuid(), variant_id: variantId, option_name: optName, option_value: optValue });
          await trx('inventory_stocks').insert({ variant_id: variantId, warehouse_id: warehouseId, quantity: stock, low_stock_threshold: 5 });
          if (stock > 0) await trx('inventory_movements').insert({ id: uuid(), variant_id: variantId, warehouse_id: warehouseId, movement_type: 'purchase', quantity_delta: stock, reference_type: 'seed', actor_id: ownerId });
          catalog.push({ productId, variantId, vendorId, warehouseId, title: p.title, sku, price, mrp, tax: p.tax,
            commissionBp: v.commission ?? category.commission_rate_bp ?? 1000, image: photo(p.img, 400), label: `${optName}: ${optValue}` });
        }
      }
    }

    // ---- pending vendor applications
    for (const [ai, a] of APPLICATIONS.entries()) {
      const ownerId = await newUser({ email: a.email, name: a.owner, roleNames: ['vendor', 'customer'], passwordHash: vendorPasswordHash, createdAt: daysAgo(3 - ai) });
      const vendorId = uuid();
      await trx('vendors').insert({
        id: vendorId, owner_user_id: ownerId, store_name: a.store, store_slug: a.slug, description: a.description, gstin: a.gstin,
        pan: a.gstin.slice(2, 12), business_type: 'proprietorship', support_email: a.email, status: a.status, created_at: daysAgo(3 - ai),
      });
      await trx('vendor_kyc_documents').insert(a.docs.map((doc) => ({ id: uuid(), vendor_id: vendorId, doc_type: doc, file_url: `https://example.com/demo-kyc/${doc}.pdf`, status: 'pending' })));
      await trx('warehouses').insert({ id: uuid(), vendor_id: vendorId, name: `${a.store} Store`, line1: '1 Demo Lane', city: a.city, state: a.state, postal_code: '500001' });
    }

    // ---- customers with addresses
    const customers = [];
    for (const [ci, [name, city, stateName, pin]] of CUSTOMERS.entries()) {
      const email = `${name.split(' ')[0].toLowerCase()}@demo.sureshot.com`;
      const id = await newUser({ email, name, roleNames: ['customer'], passwordHash: customerPasswordHash, createdAt: daysAgo(55 - ci * 6) });
      const address = { recipientName: name, recipientPhone: `+9199${String(10000000 + ci * 1234567).slice(0, 8)}`, line1: `${21 + ci}, ${['MG Road', 'Park Street', 'Linking Road', 'Sector 17', 'Hazratganj', 'Indiranagar 100ft Rd', 'Banjara Hills', 'C-Scheme'][ci]}`, city, state: stateName, postalCode: pin, country: 'IN' };
      await trx('addresses').insert({ id: uuid(), user_id: id, label: 'home', recipient_name: name, recipient_phone: address.recipientPhone, line1: address.line1, city, state: stateName, postal_code: pin, is_default: true });
      customers.push({ id, name, address });
    }

    // ---- orders across the lifecycle, split into per-vendor shipments
    const seq = async () => (await trx.raw("SELECT nextval('order_number_seq') AS n")).rows[0].n;
    const reviewable = [];
    for (const [oi, status] of ORDER_PLAN.entries()) {
      const customer = customers[oi % customers.length];
      const placed = daysAgo(Math.max(0, 44 - Math.round(oi * 1.3)), 9 + (oi % 9));
      const lines = [];
      const count = 1 + Math.floor(rand() * 3);
      while (lines.length < count) {
        const item = pick(catalog);
        if (!lines.some((l) => l.item.variantId === item.variantId)) lines.push({ item, qty: 1 + Math.floor(rand() * 2) });
      }
      const subtotal = lines.reduce((s, l) => s + l.item.price * l.qty, 0);
      const shipping = subtotal >= 49900 ? 0 : 4900;
      const discount = oi % 7 === 3 ? Math.min(20000, Math.round(subtotal * 0.1)) : 0;
      const total = subtotal + shipping - discount;
      const paymentMethod = oi % 3 === 0 ? 'cod' : 'razorpay';
      const orderId = uuid();
      await trx('orders').insert({
        id: orderId, order_number: `SS${await seq()}`, user_id: customer.id, status,
        subtotal_minor: subtotal, discount_minor: discount, coupon_code: discount ? 'WELCOME10' : null, shipping_minor: shipping,
        tax_minor: lines.reduce((s, l) => s + Math.round((l.item.price * l.qty * l.item.tax) / (10000 + l.item.tax)), 0),
        total_minor: total, payment_method: paymentMethod, shipping_address: JSON.stringify(customer.address),
        cancelled_reason: status === 'cancelled' ? 'Customer changed their mind' : null,
        placed_at: placed, created_at: placed, updated_at: placed,
      });

      const shipmentByVendor = {};
      for (const { item } of lines) {
        if (shipmentByVendor[item.vendorId]) continue;
        const shipmentId = uuid();
        const sStatus = SHIPMENT_STATUS[status];
        const shipped = ['shipped', 'out_for_delivery', 'delivered'].includes(sStatus);
        await trx('order_shipments').insert({
          id: shipmentId, order_id: orderId, vendor_id: item.vendorId, warehouse_id: item.warehouseId, status: sStatus,
          courier: shipped ? pick(['delhivery', 'bluedart', 'shiprocket']) : null,
          awb_number: shipped ? `AWB${String(Math.floor(rand() * 1e10)).padStart(10, '0')}` : null,
          shipped_at: shipped ? new Date(placed.getTime() + DAY) : null,
          delivered_at: sStatus === 'delivered' ? new Date(placed.getTime() + 3 * DAY) : null, created_at: placed,
        });
        shipmentByVendor[item.vendorId] = shipmentId;
      }

      for (const { item, qty } of lines) {
        const line = item.price * qty;
        const itemId = uuid();
        await trx('order_items').insert({
          id: itemId, order_id: orderId, shipment_id: shipmentByVendor[item.vendorId], product_id: item.productId, variant_id: item.variantId,
          vendor_id: item.vendorId, title: item.title, variant_label: item.label, sku: item.sku, image_url: item.image,
          unit_price_minor: item.price, mrp_minor: item.mrp, quantity: qty, tax_rate_bp: item.tax,
          tax_minor: Math.round((line * item.tax) / (10000 + item.tax)), commission_rate_bp: item.commissionBp,
          commission_minor: Math.round((line * item.commissionBp) / 10000), line_total_minor: line, created_at: placed,
        });
        if (status === 'delivered') reviewable.push({ productId: item.productId, userId: customer.id, itemId, at: new Date(placed.getTime() + 5 * DAY) });
        if (status === 'return_requested' || status === 'refunded') {
          await trx('return_requests').insert({
            id: uuid(), order_id: orderId, order_item_id: itemId, user_id: customer.id, request_type: 'return', reason: 'damaged',
            description: 'Arrived with a scuffed corner, would like a refund.', status: status === 'refunded' ? 'refunded' : 'requested', quantity: 1,
            refund_amount_minor: item.price, created_at: new Date(placed.getTime() + 5 * DAY),
          });
        }
      }

      let at = placed.getTime();
      let previous = null;
      for (const step of HISTORY_PATH[status]) {
        await trx('order_status_history').insert({ id: uuid(), order_id: orderId, from_status: previous, to_status: step, note: step === 'confirmed' ? 'Order placed' : null, created_at: new Date(at) });
        previous = step;
        at += step === 'shipped' ? 2 * DAY : 9 * 3600000;
      }

      const captured = paymentMethod !== 'cod' ? status !== 'cancelled' || oi % 2 === 0 : ['delivered', 'return_requested', 'refunded'].includes(status);
      const paymentId = uuid();
      await trx('payments').insert({
        id: paymentId, order_id: orderId, provider: paymentMethod, amount_minor: total,
        provider_payment_id: paymentMethod === 'cod' ? null : `pay_DEMO${orderId.slice(0, 12)}`,
        status: captured ? 'captured' : paymentMethod === 'cod' ? 'pending' : 'cancelled',
        captured_at: captured ? new Date(placed.getTime() + (paymentMethod === 'cod' ? 3 * DAY : 60000)) : null, created_at: placed,
      });
      if (status === 'refunded' || (status === 'cancelled' && captured)) {
        await trx('refunds').insert({ id: uuid(), payment_id: paymentId, amount_minor: total, destination: 'source', status: 'completed', initiated_by: admin?.id ?? null, completed_at: new Date(placed.getTime() + 7 * DAY), created_at: new Date(placed.getTime() + 6 * DAY) });
      }
    }

    // ---- reviews (approved + a moderation queue)
    const seen = new Set();
    const reviewTexts = [
      [5, 'Exactly as shown', 'Quality is excellent and the delivery partner was quick and polite.'],
      [4, 'Good value', 'Good quality for the price. Packaging could be better.'],
      [5, 'Loved it', 'Second order from this seller. Consistent quality.'],
      [3, 'Decent', 'Does the job, colour slightly different from the photos.'],
      [4, 'Recommended', 'Well packed and delivered the same day. Will order again.'],
    ];
    for (const [ri, r] of reviewable.entries()) {
      const key = `${r.productId}:${r.userId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const [rating, title, body] = reviewTexts[ri % reviewTexts.length];
      await trx('reviews').insert({ id: uuid(), product_id: r.productId, user_id: r.userId, order_item_id: r.itemId, rating, title, body, status: ri % 4 === 0 ? 'pending' : 'approved', created_at: r.at });
    }

    // ---- promotions, banners and help content
    await trx('coupons').insert([
      { id: uuid(), code: 'WELCOME10', title: '10% off your first order', description: 'Up to ₹200 off for new shoppers.', discount_type: 'percent', discount_value: 1000, max_discount_minor: 20000, min_order_minor: 49900, usage_limit_total: 5000, usage_limit_per_user: 1, applicable_scope: 'all', created_by: admin?.id ?? null, starts_at: daysAgo(60), ends_at: daysAgo(-90), is_active: true },
      { id: uuid(), code: 'SURESHOT100', title: '₹100 off', description: 'On orders above ₹999.', discount_type: 'fixed', discount_value: 10000, min_order_minor: 99900, usage_limit_total: 2000, usage_limit_per_user: 2, applicable_scope: 'all', created_by: admin?.id ?? null, starts_at: daysAgo(10), ends_at: daysAgo(-30), is_active: true },
      { id: uuid(), code: 'GROCERY50', title: '₹50 off groceries', description: 'On grocery orders above ₹499.', discount_type: 'fixed', discount_value: 5000, min_order_minor: 49900, usage_limit_per_user: 3, applicable_scope: 'all', created_by: admin?.id ?? null, starts_at: daysAgo(5), ends_at: daysAgo(-60), is_active: true },
      { id: uuid(), code: 'MEGASALE25', title: 'Mega sale — 25% off', description: 'Scheduled campaign.', discount_type: 'percent', discount_value: 2500, max_discount_minor: 100000, min_order_minor: 149900, usage_limit_per_user: 1, applicable_scope: 'all', created_by: admin?.id ?? null, starts_at: daysAgo(-14), ends_at: daysAgo(-24), is_active: true },
    ]);
    await trx('banners').insert([
      { id: uuid(), title: 'Fresh groceries in minutes', image_url: photo('photo-1542838132-92c53300491e', 1600), placement: 'home_hero', target_type: 'category', target_value: 'grocery', sort_order: 0, is_active: true },
      { id: uuid(), title: 'Phones & electronics deals', image_url: photo('photo-1598327105666-5b89351aff97', 1600), placement: 'home_hero', target_type: 'category', target_value: 'electronics', sort_order: 1, is_active: true },
      { id: uuid(), title: 'Fashion for every occasion', image_url: photo('photo-1610030469983-98e550d6193c', 1600), placement: 'home_secondary', target_type: 'category', target_value: 'womens-fashion', sort_order: 0, is_active: true },
    ]);
    await trx('pages').insert([
      { id: uuid(), slug: 'shipping-and-returns', title: 'Delivery & Returns', is_published: true, body: 'Sureshot delivers with its own delivery partners. Groceries usually arrive the same day; other orders within 1–3 days in our service cities. Free delivery on orders above ₹499.\n\nEasy 7-day returns on eligible items. Fresh groceries can be reported within 24 hours of delivery for a refund or replacement.' },
      { id: uuid(), slug: 'about', title: 'About Sureshot', is_published: true, body: 'Sureshot Delivery brings local stores and trusted sellers into one app — groceries, electronics, fashion, beauty and more — delivered fast by our own delivery partners.\n\nYour Trust. Delivered Fast.' },
    ]);
    await trx('faqs').insert([
      { id: uuid(), category: 'orders', question: 'How do I track my order?', answer: 'Open Your orders from your account to see live status, including when your delivery partner is on the way.', sort_order: 0 },
      { id: uuid(), category: 'payments', question: 'Is cash on delivery available?', answer: 'Yes, on all orders up to ₹50,000. Pay your delivery partner in cash or UPI.', sort_order: 1 },
      { id: uuid(), category: 'returns', question: 'What is the return window?', answer: 'Eligible items can be returned within 7 days of delivery; groceries within 24 hours.', sort_order: 2 },
      { id: uuid(), category: 'sellers', question: 'How do I sell on Sureshot?', answer: 'Tap “Sell on Sureshot”, add your store and GST details, and our team reviews applications within 2 business days. Then list products from your seller panel.', sort_order: 3 },
    ]);
  });
};
