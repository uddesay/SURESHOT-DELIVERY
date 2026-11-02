const router = require('express').Router();
const Joi = require('joi');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/ApiResponse');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { rateLimiter } = require('../../middlewares/rateLimiter.middleware');
const mediaService = require('./media.service');

const uploadLimiter = rateLimiter({ keyPrefix: 'media', windowSeconds: 60, max: 30 });

/**
 * @openapi
 * /media/presign:
 *   post:
 *     tags: [Media]
 *     summary: Get a presigned S3 PUT URL for direct upload
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/presign',
  authenticate,
  uploadLimiter,
  validate({
    body: Joi.object({
      contentType: Joi.string().max(100).required(),
      sizeBytes: Joi.number().integer().min(1).required(),
      purpose: Joi.string().valid('product', 'review', 'avatar', 'kyc', 'banner', 'support').required(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await mediaService.createPresignedUpload(req.user.id, req.body);
    return ok(res, result, 'Upload URL created');
  }),
);

module.exports = router;
