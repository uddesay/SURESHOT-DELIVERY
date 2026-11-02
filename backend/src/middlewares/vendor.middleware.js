const db = require('../config/database');
const ApiError = require('../utils/ApiError');

/**
 * Resolves the vendor owned by the authenticated user and attaches req.vendor.
 * Must run after authenticate(). Approval-gated actions use requireApprovedVendor.
 */
const requireVendor = async (req, res, next) => {
  try {
    const vendor = await db('vendors')
      .where({ owner_user_id: req.user.id })
      .whereNull('deleted_at')
      .first();
    if (!vendor) return next(ApiError.forbidden('No vendor account found for this user'));
    if (vendor.status === 'suspended') return next(ApiError.forbidden('Vendor account is suspended'));
    req.vendor = vendor;
    return next();
  } catch (err) {
    return next(err);
  }
};

const requireApprovedVendor = async (req, res, next) => {
  requireVendor(req, res, (err) => {
    if (err) return next(err);
    if (req.vendor.status !== 'approved') {
      return next(ApiError.forbidden('Vendor account is not approved yet'));
    }
    return next();
  });
};

module.exports = { requireVendor, requireApprovedVendor };
