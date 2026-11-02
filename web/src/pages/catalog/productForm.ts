import type { ProductDetail, ProductInput } from '../../api/catalog';
import { fromMinor, toMinor } from '../../lib/format';

export interface VariantForm {
  key: string;
  sku: string;
  barcode: string;
  price: string;
  mrp: string;
  stock: string;
  weight: string;
  length: string;
  width: string;
  height: string;
  options: { name: string; value: string }[];
  /** Server-side available units (edit mode only, read-only). */
  available?: number;
  id?: string;
}

export interface ProductForm {
  title: string;
  description: string;
  highlights: string[];
  vendorId: string;
  categoryId: string;
  brandId: string;
  status: 'draft' | 'pending_approval' | 'active' | 'inactive';
  media: { key: string; url: string; alt: string }[];
  variants: VariantForm[];
  taxRate: string;
  hsnCode: string;
  isCodAvailable: boolean;
  isReturnable: boolean;
  returnWindowDays: string;
  seoTitle: string;
  seoDescription: string;
  specs: { key: string; group: string; name: string; value: string }[];
}

export type Section = 'general' | 'media' | 'pricing' | 'inventory' | 'variants' | 'shipping' | 'seo' | 'advanced';

let counter = 0;
export const uid = () => `k${Date.now().toString(36)}${(counter++).toString(36)}`;

export const blankVariant = (): VariantForm => ({
  key: uid(), sku: '', barcode: '', price: '', mrp: '', stock: '0', weight: '', length: '', width: '', height: '', options: [],
});

export const blankProduct = (): ProductForm => ({
  title: '', description: '', highlights: [], vendorId: '', categoryId: '', brandId: '', status: 'draft',
  media: [], variants: [blankVariant()], taxRate: '18', hsnCode: '', isCodAvailable: true, isReturnable: true,
  returnWindowDays: '7', seoTitle: '', seoDescription: '', specs: [],
});

export function fromDetail(p: ProductDetail): ProductForm {
  return {
    title: p.title,
    description: p.description ?? '',
    highlights: Array.isArray(p.highlights) ? p.highlights : [],
    vendorId: p.vendor_id,
    categoryId: p.category_id,
    brandId: p.brand_id ?? '',
    status: (['draft', 'pending_approval', 'active', 'inactive'].includes(p.status) ? p.status : 'draft') as ProductForm['status'],
    media: p.media.filter((m) => m.media_type === 'image').map((m) => ({ key: m.id, url: m.url, alt: m.alt_text ?? '' })),
    variants: p.variants.map((v) => ({
      key: v.id,
      id: v.id,
      sku: v.sku,
      barcode: v.barcode ?? '',
      price: fromMinor(v.sale_price_minor),
      mrp: fromMinor(v.mrp_minor),
      stock: '0',
      weight: v.weight_grams ? String(v.weight_grams) : '',
      length: v.length_mm ? String(v.length_mm) : '',
      width: v.width_mm ? String(v.width_mm) : '',
      height: v.height_mm ? String(v.height_mm) : '',
      options: v.options.map((o) => ({ name: o.name, value: o.value })),
      available: v.available_stock,
    })),
    taxRate: String(p.tax_rate_bp / 100),
    hsnCode: p.hsn_code ?? '',
    isCodAvailable: p.is_cod_available,
    isReturnable: p.is_returnable,
    returnWindowDays: String(p.return_window_days),
    seoTitle: p.seo_title ?? '',
    seoDescription: p.seo_description ?? '',
    specs: p.specifications.map((s) => ({ key: uid(), group: s.group_name, name: s.spec_key, value: s.spec_value })),
  };
}

const optInt = (v: string) => (v.trim() ? Math.round(Number(v)) : undefined);

function variantPayload(v: VariantForm, includeStock: boolean) {
  return {
    sku: v.sku.trim().toUpperCase(),
    ...(v.barcode.trim() ? { barcode: v.barcode.trim() } : {}),
    mrpMinor: toMinor(v.mrp || v.price),
    salePriceMinor: toMinor(v.price),
    ...(optInt(v.weight) ? { weightGrams: optInt(v.weight) } : {}),
    ...(optInt(v.length) ? { lengthMm: optInt(v.length) } : {}),
    ...(optInt(v.width) ? { widthMm: optInt(v.width) } : {}),
    ...(optInt(v.height) ? { heightMm: optInt(v.height) } : {}),
    options: Object.fromEntries(v.options.filter((o) => o.name.trim() && o.value.trim()).map((o) => [o.name.trim(), o.value.trim()])),
    ...(includeStock && Number(v.stock) > 0 ? { initialStock: Math.round(Number(v.stock)) } : {}),
  };
}

/** Full payload for create; for edit, `changedVariants` controls whether variants are re-synced. */
export function toPayload(form: ProductForm, { create, includeVariants = true }: { create: boolean; includeVariants?: boolean }): ProductInput {
  return {
    ...(create ? { vendorId: form.vendorId } : {}),
    title: form.title.trim(),
    categoryId: form.categoryId,
    brandId: form.brandId || null,
    description: form.description,
    highlights: form.highlights.map((h) => h.trim()).filter(Boolean),
    ...(form.hsnCode.trim() ? { hsnCode: form.hsnCode.trim() } : {}),
    taxRateBp: Math.round(Number(form.taxRate || 0) * 100),
    isReturnable: form.isReturnable,
    returnWindowDays: form.isReturnable ? Number(form.returnWindowDays || 0) : 0,
    isCodAvailable: form.isCodAvailable,
    ...(form.seoTitle.trim() ? { seoTitle: form.seoTitle.trim() } : {}),
    ...(form.seoDescription.trim() ? { seoDescription: form.seoDescription.trim() } : {}),
    variants: includeVariants ? form.variants.map((v) => variantPayload(v, create)) : (undefined as never),
    media: form.media.map((m) => ({ url: m.url.trim(), type: 'image' as const, ...(m.alt.trim() ? { altText: m.alt.trim() } : {}) })),
    specifications: form.specs.filter((s) => s.name.trim() && s.value.trim()).map((s) => ({ group: s.group.trim() || 'General', key: s.name.trim(), value: s.value.trim() })),
    status: form.status,
  };
}

export type Errors = Partial<Record<string, string>>;

const SECTION_OF: Record<string, Section> = {
  title: 'general', vendorId: 'general', categoryId: 'general', description: 'general',
  media: 'media',
  taxRate: 'advanced', hsnCode: 'advanced', specs: 'advanced',
  returnWindowDays: 'shipping',
  seoTitle: 'seo', seoDescription: 'seo',
};

export function sectionOf(field: string): Section {
  if (field.startsWith('variant.')) {
    if (/\.(price|mrp)$/.test(field)) return 'pricing';
    if (/\.stock$/.test(field)) return 'inventory';
    if (/\.(weight|length|width|height)$/.test(field)) return 'shipping';
    return 'variants';
  }
  if (field.startsWith('media.')) return 'media';
  return SECTION_OF[field] ?? 'general';
}

const isUrl = (u: string) => { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; } catch { return false; } };

/** Mirrors the backend Joi rules so problems are caught before saving. */
export function validate(form: ProductForm, { create, publishing }: { create: boolean; publishing: boolean }): Errors {
  const e: Errors = {};
  const title = form.title.trim();
  if (title.length < 3) e.title = 'Give the product a title of at least 3 characters.';
  else if (title.length > 255) e.title = 'Keep the title under 255 characters.';
  if (create && !form.vendorId) e.vendorId = 'Choose the vendor selling this product.';
  if (!form.categoryId) e.categoryId = 'Choose a category.';
  if (form.highlights.length > 20) e.description = 'Use 20 highlights or fewer.';
  if (form.media.length > 30) e.media = 'A product can have up to 30 images.';
  form.media.forEach((m, i) => { if (!isUrl(m.url.trim())) e[`media.${i}`] = 'Enter a full http(s) image URL.'; });
  if (publishing && form.media.length === 0) e.media = 'Add at least one image before publishing.';
  if (!form.variants.length) e['variant.0.sku'] = 'Add at least one variant.';
  const skus = new Map<string, number>();
  form.variants.forEach((v, i) => {
    const sku = v.sku.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,64}$/.test(sku)) e[`variant.${i}.sku`] = 'SKU must be 3–64 letters or digits (no spaces or dashes).';
    else if (skus.has(sku)) e[`variant.${i}.sku`] = 'Each variant needs a unique SKU.';
    skus.set(sku, i);
    const price = Number(v.price);
    const mrp = Number(v.mrp || v.price);
    if (!v.price.trim() || !Number.isFinite(price) || price < 0) e[`variant.${i}.price`] = 'Enter a selling price.';
    else if (!Number.isFinite(mrp) || mrp < price) e[`variant.${i}.mrp`] = 'MRP can’t be lower than the selling price.';
    if (v.stock.trim() && (!Number.isInteger(Number(v.stock)) || Number(v.stock) < 0)) e[`variant.${i}.stock`] = 'Stock must be a whole number.';
    for (const k of ['weight', 'length', 'width', 'height'] as const) {
      if (v[k].trim() && (!(Number(v[k]) >= 1))) e[`variant.${i}.${k}`] = 'Must be a positive number.';
    }
    if (form.variants.length > 1 && !v.options.some((o) => o.name.trim() && o.value.trim())) {
      e[`variant.${i}.options`] = 'Describe what makes this variant different (e.g. Size: M).';
    }
  });
  const tax = Number(form.taxRate);
  if (!Number.isFinite(tax) || tax < 0 || tax > 40) e.taxRate = 'Tax rate must be between 0 and 40%.';
  if (form.hsnCode.length > 10) e.hsnCode = 'HSN codes are at most 10 characters.';
  const days = Number(form.returnWindowDays);
  if (form.isReturnable && (!Number.isInteger(days) || days < 0 || days > 30)) e.returnWindowDays = 'Return window must be 0–30 days.';
  if (form.seoTitle.length > 160) e.seoTitle = 'SEO titles are at most 160 characters.';
  if (form.seoDescription.length > 320) e.seoDescription = 'SEO descriptions are at most 320 characters.';
  return e;
}

/** Stable comparison of variant-defining fields, to avoid re-syncing variants when untouched. */
export function variantSignature(variants: VariantForm[]): string {
  return JSON.stringify(variants.map((v) => [v.sku.trim().toUpperCase(), v.barcode, v.price, v.mrp, v.weight, v.length, v.width, v.height, v.options]));
}

export function slugPreview(title: string): string {
  return title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'product';
}
