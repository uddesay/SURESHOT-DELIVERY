const Joi = require('joi');
const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, paginated } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/rbac.middleware');
const audit = require('../../middlewares/audit.middleware');
const schemas = require('./vendor.validation');
const vendorService = require('./vendor.service');

// ---------------- self-service ----------------

const selfRouter = express.Router();
selfRouter.use(authenticate);

/**
 * @openapi
 * /vendor/register:
 *   post:
 *     tags: [Vendor]
 *     summary: Apply for a vendor account (KYC documents submitted separately)
 *     security: [{ bearerAuth: [] }]
 */
selfRouter.post('/register', validate(schemas.register), asyncHandler(async (req, res) =>
  created(res, await vendorService.register(req.user.id, req.body), 'Vendor application submitted for review')));

selfRouter.get('/profile', asyncHandler(async (req, res) => ok(res, await vendorService.getProfile(req.user.id))));

selfRouter.patch('/profile', validate(schemas.updateProfile), asyncHandler(async (req, res) =>
  ok(res, await vendorService.updateProfile(req.user.id, req.body), 'Vendor profile updated')));

selfRouter.post('/bank-accounts', validate(schemas.addBankAccount), asyncHandler(async (req, res) =>
  created(res, await vendorService.addBankAccount(req.user.id, req.body), 'Bank account added — pending verification')));

selfRouter.get('/warehouses', asyncHandler(async (req, res) => ok(res, await vendorService.listWarehouses(req.user.id))));

selfRouter.post('/warehouses', validate(schemas.addWarehouse), asyncHandler(async (req, res) =>
  created(res, await vendorService.addWarehouse(req.user.id, req.body), 'Warehouse added')));

selfRouter.post('/kyc-documents', validate(schemas.submitKycDocument), asyncHandler(async (req, res) =>
  created(res, await vendorService.submitKycDocument(req.user.id, req.body), 'Document submitted for review')));

// ---------------- admin ----------------

const adminRouter = express.Router();
adminRouter.use(authenticate, authorize('vendors:read'));

adminRouter.get('/', validate(schemas.adminList), asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const { total, rows } = await vendorService.listVendors(req.query);
  return paginated(res, rows, { page, limit, total });
}));

adminRouter.get('/:id', validate(schemas.idParam), asyncHandler(async (req, res) =>
  ok(res, await vendorService.getVendorDetailAdmin(req.params.id))));

adminRouter.post(
  '/:id/approve',
  authorize('vendors:approve'),
  validate(schemas.idParam),
  audit('vendors:approve', 'vendor'),
  asyncHandler(async (req, res) => ok(res, await vendorService.approveVendor(req.user.id, req.params.id), 'Vendor approved')),
);

adminRouter.post(
  '/:id/reject',
  authorize('vendors:approve'),
  validate(schemas.reject),
  audit('vendors:reject', 'vendor'),
  asyncHandler(async (req, res) => ok(res, await vendorService.rejectVendor(req.user.id, req.params.id, req.body.reason), 'Vendor rejected')),
);

adminRouter.post(
  '/:id/suspend',
  authorize('vendors:suspend'),
  validate(schemas.idParam),
  audit('vendors:suspend', 'vendor'),
  asyncHandler(async (req, res) => {
    await vendorService.suspendVendor(req.user.id, req.params.id);
    return ok(res, null, 'Vendor suspended');
  }),
);

adminRouter.post(
  '/:id/reactivate',
  authorize('vendors:suspend'),
  validate(schemas.idParam),
  audit('vendors:reactivate', 'vendor'),
  asyncHandler(async (req, res) => {
    await vendorService.reactivateVendor(req.user.id, req.params.id);
    return ok(res, null, 'Vendor reactivated');
  }),
);

adminRouter.patch(
  '/:id/commission',
  authorize('vendors:update'),
  validate({ ...schemas.idParam, body: Joi.object({ commissionRateBp: Joi.number().integer().min(0).max(5000).allow(null).required() }) }),
  audit('vendors:commission', 'vendor'),
  asyncHandler(async (req, res) =>
    ok(res, await vendorService.setCommission(req.user.id, req.params.id, req.body.commissionRateBp), 'Commission updated')),
);

adminRouter.post(
  '/:id/request-info',
  authorize('vendors:approve'),
  validate({ ...schemas.idParam, body: Joi.object({ message: Joi.string().trim().min(5).max(1000).required() }) }),
  audit('vendors:request_info', 'vendor'),
  asyncHandler(async (req, res) =>
    ok(res, await vendorService.requestVendorInfo(req.user.id, req.params.id, req.body.message), 'Information requested')),
);

adminRouter.post(
  '/kyc-documents/:docId/review',
  authorize('vendors:approve'),
  validate(schemas.reviewKycDocument),
  audit('vendors:review_kyc', 'vendor_kyc_document'),
  asyncHandler(async (req, res) =>
    ok(res, await vendorService.reviewKycDocument(req.user.id, req.params.docId, req.body.status, req.body.rejectionReason), 'KYC document reviewed')),
);

adminRouter.post(
  '/bank-accounts/:bankAccountId/verify',
  authorize('vendors:approve'),
  validate(schemas.bankAccountIdParam),
  audit('vendors:verify_bank_account', 'vendor_bank_account'),
  asyncHandler(async (req, res) => {
    await vendorService.verifyBankAccount(req.user.id, req.params.bankAccountId);
    return ok(res, null, 'Bank account verified');
  }),
);

module.exports = { selfRouter, adminRouter };
