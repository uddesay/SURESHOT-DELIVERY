const ApiError = require('../utils/ApiError');

/**
 * RBAC guards. Must run after authenticate().
 * Permissions are embedded in the access token at issue time; role/permission
 * changes take effect on next token refresh (≤15 min).
 */

/** Require at least one of the given roles. */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.some((r) => req.user.roles.includes(r))) return next(ApiError.forbidden());
  return next();
};

/** Require a specific permission (super_admin bypasses). */
const authorize = (...permissions) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.roles.includes('super_admin')) return next();
  if (!permissions.every((p) => req.user.permissions.includes(p))) {
    return next(ApiError.forbidden());
  }
  return next();
};

/** Roles that operate the platform back office. Vendors and customers never pass. */
const STAFF_ROLES = ['super_admin', 'admin', 'support_agent'];
const requireStaff = requireRole(...STAFF_ROLES);

module.exports = { requireRole, authorize, requireStaff, STAFF_ROLES };
