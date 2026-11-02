const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { encryptSensitive, decryptSensitive, maskLast4 } = require('../../utils/crypto');
const { slugify, uniqueSlug } = require('../../utils/slugify');
const notificationService = require('../notifications/notification.service');

const maskBankAccount = (row) => ({
  id: row.id,
  accountHolder: row.account_holder,
  accountNumberMasked: maskLast4(decryptSensitive(row.account_number_enc)),
  ifsc: row.ifsc,
  bankName: row.bank_name,
  isVerified: row.is_verified,
  isPrimary: row.is_primary,
  createdAt: row.created_at,
});

// ---------------------------------------------------------------- self-service

/** Applies for a vendor account: creates the vendor (pending), grants the role, and seeds a warehouse + primary bank account if supplied. */
const register = async (userId, attrs) => {
  const existing = await db('vendors').where({ owner_user_id: userId }).whereNull('deleted_at').first();
  if (existing) throw ApiError.conflict('A vendor account already exists for this user');

  if (attrs.gstin) {
    const gstinClash = await db('vendors').where({ gstin: attrs.gstin }).whereNull('deleted_at').first();
    if (gstinClash) throw ApiError.conflict('This GSTIN is already registered');
  }

  const vendorId = uuid();
  await db.transaction(async (trx) => {
    let slug = slugify(attrs.storeName);
    if (await trx('vendors').where({ store_slug: slug }).first()) slug = uniqueSlug(attrs.storeName);

    await trx('vendors').insert({
      id: vendorId,
      owner_user_id: userId,
      store_name: attrs.storeName,
      store_slug: slug,
      description: attrs.description || null,
      support_email: attrs.supportEmail || null,
      support_phone: attrs.supportPhone || null,
      gstin: attrs.gstin || null,
      pan: attrs.pan || null,
      business_type: attrs.businessType || null,
      status: 'pending',
    });

    const vendorRole = await trx('roles').where({ name: 'vendor' }).first();
    await trx('user_roles').insert({ user_id: userId, role_id: vendorRole.id }).onConflict(['user_id', 'role_id']).ignore();

    if (attrs.warehouse) {
      await trx('warehouses').insert({
        id: uuid(),
        vendor_id: vendorId,
        name: attrs.warehouse.name,
        line1: attrs.warehouse.line1,
        city: attrs.warehouse.city,
        state: attrs.warehouse.state,
        postal_code: attrs.warehouse.postalCode,
        country: attrs.warehouse.country || 'IN',
        contact_phone: attrs.warehouse.contactPhone || attrs.supportPhone || null,
      });
    }

    if (attrs.bankAccount) {
      await trx('vendor_bank_accounts').insert({
        id: uuid(),
        vendor_id: vendorId,
        account_holder: attrs.bankAccount.accountHolder,
        account_number_enc: encryptSensitive(attrs.bankAccount.accountNumber),
        ifsc: attrs.bankAccount.ifsc,
        bank_name: attrs.bankAccount.bankName,
        is_primary: true,
      });
    }
  });

  return getProfile(userId);
};

const findByOwner = async (userId) => {
  const vendor = await db('vendors').where({ owner_user_id: userId }).whereNull('deleted_at').first();
  if (!vendor) throw ApiError.notFound('Vendor account');
  return vendor;
};

const getProfile = async (userId) => {
  const vendor = await findByOwner(userId);
  const [warehouses, bankAccounts, kycDocuments] = await Promise.all([
    db('warehouses').where({ vendor_id: vendor.id }),
    db('vendor_bank_accounts').where({ vendor_id: vendor.id }),
    db('vendor_kyc_documents').where({ vendor_id: vendor.id }).orderBy('created_at', 'desc'),
  ]);
  return {
    ...vendor,
    warehouses,
    bankAccounts: bankAccounts.map(maskBankAccount),
    kycDocuments,
  };
};

const updateProfile = async (userId, attrs) => {
  const vendor = await findByOwner(userId);
  const patch = {
    ...(attrs.storeName !== undefined ? { store_name: attrs.storeName } : {}),
    ...(attrs.description !== undefined ? { description: attrs.description } : {}),
    ...(attrs.logoUrl !== undefined ? { logo_url: attrs.logoUrl } : {}),
    ...(attrs.bannerUrl !== undefined ? { banner_url: attrs.bannerUrl } : {}),
    ...(attrs.supportEmail !== undefined ? { support_email: attrs.supportEmail } : {}),
    ...(attrs.supportPhone !== undefined ? { support_phone: attrs.supportPhone } : {}),
  };
  if (Object.keys(patch).length) await db('vendors').where({ id: vendor.id }).update(patch);
  return getProfile(userId);
};

const addBankAccount = async (userId, attrs) => {
  const vendor = await findByOwner(userId);
  return db.transaction(async (trx) => {
    if (attrs.isPrimary) {
      await trx('vendor_bank_accounts').where({ vendor_id: vendor.id, is_primary: true }).update({ is_primary: false });
    }
    const [row] = await trx('vendor_bank_accounts')
      .insert({
        id: uuid(),
        vendor_id: vendor.id,
        account_holder: attrs.accountHolder,
        account_number_enc: encryptSensitive(attrs.accountNumber),
        ifsc: attrs.ifsc,
        bank_name: attrs.bankName,
        is_primary: Boolean(attrs.isPrimary),
      })
      .returning('*');
    return maskBankAccount(row);
  });
};

const submitKycDocument = async (userId, { docType, fileUrl }) => {
  const vendor = await findByOwner(userId);
  const [row] = await db('vendor_kyc_documents')
    .insert({ id: uuid(), vendor_id: vendor.id, doc_type: docType, file_url: fileUrl })
    .returning('*');
  // Resubmitting evidence moves the vendor back into review if previously rejected.
  if (vendor.status === 'rejected') await db('vendors').where({ id: vendor.id }).update({ status: 'under_review' });
  return row;
};

const listWarehouses = async (userId) => {
  const vendor = await findByOwner(userId);
  return db('warehouses').where({ vendor_id: vendor.id }).orderBy('created_at');
};

const addWarehouse = async (userId, attrs) => {
  const vendor = await findByOwner(userId);
  const [row] = await db('warehouses')
    .insert({
      id: uuid(),
      vendor_id: vendor.id,
      name: attrs.name,
      line1: attrs.line1,
      city: attrs.city,
      state: attrs.state,
      postal_code: attrs.postalCode,
      country: attrs.country || 'IN',
      contact_phone: attrs.contactPhone || null,
    })
    .returning('*');
  return row;
};

// ---------------------------------------------------------------- admin

const listVendors = async ({ page = 1, limit = 20, status, q }) => {
  const base = db('vendors')
    .whereNull('vendors.deleted_at')
    .modify((qb) => {
      if (status) qb.whereIn('vendors.status', String(status).split(','));
      if (q) qb.whereILike('vendors.store_name', `%${q}%`);
    });
  const [{ count }] = await base.clone().count('* as count');
  const rows = await base.clone()
    .leftJoin('users as owner', 'owner.id', 'vendors.owner_user_id')
    .orderBy('vendors.created_at', 'desc').offset((page - 1) * limit).limit(limit)
    .select('vendors.*', 'owner.full_name as owner_name', 'owner.email as owner_email',
      db.raw('(SELECT COUNT(*)::int FROM products p WHERE p.vendor_id = vendors.id AND p.deleted_at IS NULL) as product_count'),
      db.raw('(SELECT COUNT(DISTINCT oi.order_id)::int FROM order_items oi WHERE oi.vendor_id = vendors.id) as order_count'),
      db.raw(`(SELECT COALESCE(SUM(oi.line_total_minor), 0)::bigint FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.vendor_id = vendors.id AND o.status IN ('confirmed','processing','packed','shipped','out_for_delivery','delivered')) as revenue_minor`),
      db.raw(`(SELECT COALESCE(SUM(oi.commission_minor), 0)::bigint FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.vendor_id = vendors.id AND o.status IN ('confirmed','processing','packed','shipped','out_for_delivery','delivered')) as commission_minor`));
  return {
    total: Number(count),
    rows: rows.map((r) => ({ ...r, revenue_minor: Number(r.revenue_minor), commission_minor: Number(r.commission_minor) })),
  };
};

/** Asks an applicant for more detail; moves a fresh application into review. */
const requestVendorInfo = async (adminId, vendorId, message) => {
  const vendor = await db('vendors').where({ id: vendorId }).whereNull('deleted_at').first();
  if (!vendor) throw ApiError.notFound('Vendor');
  if (!['pending', 'under_review'].includes(vendor.status)) {
    throw ApiError.businessRule(`Information can only be requested for open applications (current: ${vendor.status})`);
  }
  await db('vendors').where({ id: vendorId }).update({ status: 'under_review', updated_at: db.fn.now() });
  notificationService.notify(vendor.owner_user_id, {
    title: 'More information needed',
    body: `We need a little more detail for "${vendor.store_name}": ${message}`,
    type: 'vendor_info_requested',
    data: { vendorId },
  });
  return getVendorDetailAdmin(vendorId);
};

const getVendorDetailAdmin = async (vendorId) => {
  const vendor = await db('vendors').where({ id: vendorId }).whereNull('deleted_at').first();
  if (!vendor) throw ApiError.notFound('Vendor');
  const NET = ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
  const [owner, kycDocuments, bankAccounts, warehouses, stats, payouts, reviews, categories] = await Promise.all([
    db('users').where({ id: vendor.owner_user_id }).select('id', 'full_name', 'email', 'phone').first(),
    db('vendor_kyc_documents').where({ vendor_id: vendorId }).orderBy('created_at', 'desc'),
    db('vendor_bank_accounts').where({ vendor_id: vendorId }),
    db('warehouses').where({ vendor_id: vendorId }),
    db('order_items as oi').join('orders as o', 'o.id', 'oi.order_id').where('oi.vendor_id', vendorId).whereIn('o.status', NET)
      .select(db.raw('COUNT(DISTINCT oi.order_id)::int as orders'), db.raw('COALESCE(SUM(oi.line_total_minor), 0)::bigint as revenue'),
        db.raw('COALESCE(SUM(oi.commission_minor), 0)::bigint as commission'), db.raw('COUNT(DISTINCT o.user_id)::int as customers')).first(),
    db('vendor_payouts').where({ vendor_id: vendorId }).orderBy('created_at', 'desc').limit(10),
    db('reviews as r').join('products as p', 'p.id', 'r.product_id').where('p.vendor_id', vendorId)
      .select('r.id', 'r.rating', 'r.title', 'r.status', 'r.created_at', 'p.title as product_title').orderBy('r.created_at', 'desc').limit(10),
    db('products as p').join('categories as c', 'c.id', 'p.category_id').where('p.vendor_id', vendorId).whereNull('p.deleted_at')
      .groupBy('c.id', 'c.name').select('c.id', 'c.name', db.raw('COUNT(*)::int as products')),
  ]);
  const productCounts = await db('products').where({ vendor_id: vendorId }).whereNull('deleted_at')
    .groupBy('status').select('status', db.raw('COUNT(*)::int as count'));
  return {
    ...vendor,
    owner,
    kycDocuments,
    bankAccounts: bankAccounts.map(maskBankAccount),
    warehouses,
    stats: {
      orders: stats.orders,
      customers: stats.customers,
      revenueMinor: Number(stats.revenue),
      commissionMinor: Number(stats.commission),
      products: Object.fromEntries(productCounts.map((p) => [p.status, p.count])),
    },
    payouts: payouts.map((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, k.endsWith('_minor') ? Number(v) : v]))),
    reviews,
    categories,
  };
};

const approveVendor = async (adminId, vendorId) => {
  const vendor = await db('vendors').where({ id: vendorId }).whereNull('deleted_at').first();
  if (!vendor) throw ApiError.notFound('Vendor');
  if (!['pending', 'under_review'].includes(vendor.status)) {
    throw ApiError.businessRule(`Vendor cannot be approved from '${vendor.status}' state`);
  }
  const pendingDocs = await db('vendor_kyc_documents').where({ vendor_id: vendorId, status: 'pending' }).first();
  if (pendingDocs) throw ApiError.businessRule('All KYC documents must be reviewed before approval');

  await db('vendors').where({ id: vendorId }).update({
    status: 'approved', approved_at: db.fn.now(), approved_by: adminId,
  });
  notificationService.notify(vendor.owner_user_id, {
    title: 'Seller application approved',
    body: `Congratulations! "${vendor.store_name}" is now live on Sureshot.`,
    type: 'vendor_approved',
    data: { vendorId },
  });
  return getVendorDetailAdmin(vendorId);
};

const rejectVendor = async (adminId, vendorId, reason) => {
  const vendor = await db('vendors').where({ id: vendorId }).whereNull('deleted_at').first();
  if (!vendor) throw ApiError.notFound('Vendor');
  if (!['pending', 'under_review'].includes(vendor.status)) {
    throw ApiError.businessRule(`Vendor cannot be rejected from '${vendor.status}' state`);
  }
  await db('vendors').where({ id: vendorId }).update({ status: 'rejected' });
  notificationService.notify(vendor.owner_user_id, {
    title: 'Seller application rejected',
    body: `Your application for "${vendor.store_name}" was rejected: ${reason}`,
    type: 'vendor_rejected',
    data: { vendorId },
  });
  return { reason };
};

const suspendVendor = async (adminId, vendorId) => {
  const updated = await db('vendors').where({ id: vendorId, status: 'approved' }).whereNull('deleted_at')
    .update({ status: 'suspended' });
  if (!updated) throw ApiError.businessRule('Only an approved vendor can be suspended');
};

const reactivateVendor = async (adminId, vendorId) => {
  const updated = await db('vendors').where({ id: vendorId, status: 'suspended' }).whereNull('deleted_at')
    .update({ status: 'approved' });
  if (!updated) throw ApiError.businessRule('Only a suspended vendor can be reactivated');
};

const reviewKycDocument = async (adminId, docId, status, rejectionReason) => {
  const [row] = await db('vendor_kyc_documents')
    .where({ id: docId })
    .update({
      status,
      rejection_reason: status === 'rejected' ? rejectionReason : null,
      reviewed_by: adminId,
      reviewed_at: db.fn.now(),
    })
    .returning('*');
  if (!row) throw ApiError.notFound('KYC document');
  return row;
};

const verifyBankAccount = async (adminId, bankAccountId) => {
  const updated = await db('vendor_bank_accounts').where({ id: bankAccountId }).update({ is_verified: true });
  if (!updated) throw ApiError.notFound('Bank account');
};

/** Per-vendor commission override in basis points; null falls back to category rates. */
const setCommission = async (adminId, vendorId, commissionRateBp) => {
  const updated = await db('vendors').where({ id: vendorId }).whereNull('deleted_at')
    .update({ commission_rate_bp: commissionRateBp, updated_at: db.fn.now() });
  if (!updated) throw ApiError.notFound('Vendor');
  return getVendorDetailAdmin(vendorId);
};

module.exports = {
  setCommission,
  requestVendorInfo,
  register, getProfile, updateProfile, addBankAccount, submitKycDocument, listWarehouses, addWarehouse,
  listVendors, getVendorDetailAdmin, approveVendor, rejectVendor, suspendVendor, reactivateVendor,
  reviewKycDocument, verifyBankAccount, findByOwner,
};
