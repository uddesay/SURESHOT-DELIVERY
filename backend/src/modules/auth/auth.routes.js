const router = require('express').Router();
const controller = require('./auth.controller');
const schemas = require('./auth.validation');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authLimiter, otpRequestLimiter } = require('../../middlewares/rateLimiter.middleware');

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register with email/phone + password
 */
router.post('/register', authLimiter, validate(schemas.register), controller.register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email/phone + password
 */
router.post('/login', authLimiter, validate(schemas.login), controller.login);

/**
 * @openapi
 * /auth/otp/request:
 *   post:
 *     tags: [Auth]
 *     summary: Send a 6-digit OTP to email or phone
 */
router.post('/otp/request', otpRequestLimiter, validate(schemas.otpRequest), controller.requestOtp);

/**
 * @openapi
 * /auth/otp/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify OTP → tokens (auto-registers unknown identifiers)
 */
router.post('/otp/verify', authLimiter, validate(schemas.otpVerify), controller.verifyOtp);

/**
 * @openapi
 * /auth/oauth/google:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in with a Google ID token
 */
router.post('/oauth/google', authLimiter, validate(schemas.googleOauth), controller.googleOauth);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate refresh token → new access + refresh pair
 */
router.post('/refresh', validate(schemas.refresh), controller.refresh);

router.post('/logout', validate(schemas.logout), controller.logout);
router.post('/logout-all', authenticate, controller.logoutAll);

router.post('/password/forgot', otpRequestLimiter, validate(schemas.forgotPassword), controller.forgotPassword);
router.post('/password/reset', authLimiter, validate(schemas.resetPassword), controller.resetPassword);
router.post('/password/change', authenticate, validate(schemas.changePassword), controller.changePassword);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Current user profile with roles and permissions
 *     security: [{ bearerAuth: [] }]
 */
router.get('/me', authenticate, controller.me);

module.exports = router;
