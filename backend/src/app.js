const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const pinoHttp = require('pino-http');

const config = require('./config');
const logger = require('./utils/logger');
const { globalLimiter } = require('./middlewares/rateLimiter.middleware');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');
const { metricsMiddleware, metricsHandler } = require('./middlewares/metrics.middleware');

const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const addressRoutes = require('./modules/addresses/address.routes');
const catalogRoutes = require('./modules/catalog/catalog.routes');
const searchRoutes = require('./modules/search/search.routes');
const mediaRoutes = require('./modules/media/media.routes');
const cartRoutes = require('./modules/cart/cart.routes');
const wishlistRoutes = require('./modules/wishlist/wishlist.routes');
const couponRoutes = require('./modules/coupons/coupon.routes');
const orderRoutes = require('./modules/orders/order.routes');
const paymentRoutes = require('./modules/payments/payment.routes');
const walletRoutes = require('./modules/wallet/wallet.routes');
const shippingRoutes = require('./modules/shipping/shipping.routes');
const returnRoutes = require('./modules/returns/return.routes');
const vendorRoutes = require('./modules/vendors/vendor.routes');
const vendorAnalyticsRoutes = require('./modules/vendors/vendor-analytics.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const payoutRoutes = require('./modules/payouts/payout.routes');
const cmsRoutes = require('./modules/cms/cms.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');
const supportRoutes = require('./modules/support/support.routes');
const storeRoutes = require('./modules/stores/stores.routes');
const deliveryRoutes = require('./modules/delivery/delivery.routes');

const app = express();

app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: { directives: {
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    // HTTP is used only for the local preview; TLS is terminated by the public reverse proxy.
    'upgrade-insecure-requests': null,
  } },
}));
app.use(cors({
  // `flutter run -d chrome` picks a new random localhost port each launch,
  // so pinning CORS_ORIGINS to one port is fragile for local dev — allow
  // any localhost/127.0.0.1 origin outside production instead. Production
  // always enforces the explicit CORS_ORIGINS allowlist (or blocks all
  // cross-origin requests if it's unset), regardless of this.
  origin: config.isProduction
    ? (config.corsOrigins.length ? config.corsOrigins : false)
    : (origin, callback) => {
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || config.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
  credentials: true,
  maxAge: 86400,
}));
app.use(compression());
app.use(express.json({
  limit: '1mb',
  // raw body needed for payment webhook signature verification
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(pinoHttp({
  logger,
  autoLogging: { ignore: (req) => ['/healthz', '/readyz', '/metrics'].includes(req.url) },
}));
app.use(metricsMiddleware);

// Liveness / readiness / metrics
app.get('/healthz', (req, res) => res.json({ status: 'ok', application: 'sureshot', instance: process.env.INSTANCE_ID, uptime: process.uptime() }));
app.get('/readyz', async (req, res) => {
  // Postgres is a hard dependency — without it the API cannot serve anything,
  // so it alone decides readiness. Redis is soft (rate limiting and caching
  // both fail open), so its absence is reported as degraded rather than
  // pulling the instance out of the load balancer.
  try {
    await require('./config/database').raw('SELECT 1');
  } catch (err) {
    return res.status(503).json({ status: 'not_ready', database: 'down' });
  }
  const redisUp = require('./config/redis').isAvailable();
  if (config.rateLimitStore === 'postgres') {
    try { await require('./config/database')('rate_limit_windows').select('key').limit(1); }
    catch { return res.status(503).json({ status: 'not_ready', rateLimiter: 'down' }); }
  }
  const limiterReady = config.rateLimitStore === 'postgres' || redisUp;
  return res.status(config.isProduction && !limiterReady ? 503 : 200).json({
    status: limiterReady ? 'ready' : 'degraded',
    database: 'up',
    rateLimiter: config.rateLimitStore,
    redis: redisUp ? 'up' : 'down',
  });
});
if (!config.isProduction) app.get('/metrics', metricsHandler);

// API v1
const v1 = express.Router();
v1.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
v1.use(globalLimiter);
v1.use('/auth', authRoutes);
v1.use('/users', userRoutes);
v1.use('/addresses', addressRoutes);
v1.use('/categories', catalogRoutes.categories);
v1.use('/brands', catalogRoutes.brands);
v1.use('/products', catalogRoutes.products);
v1.use('/vendor/products', catalogRoutes.vendorProducts);
v1.use('/admin', catalogRoutes.adminCatalog);
v1.use('/admin/coupons', couponRoutes.adminRouter);
v1.use('/search', searchRoutes);
v1.use('/stores', storeRoutes);
v1.use('/delivery/apply', deliveryRoutes.publicRouter);
v1.use('/delivery', deliveryRoutes.riderRouter);
v1.use('/admin/delivery', deliveryRoutes.adminRouter);
v1.use('/media', mediaRoutes);
v1.use('/cart', cartRoutes);
v1.use('/wishlist', wishlistRoutes.wishlist);
v1.use('/recently-viewed', wishlistRoutes.recentlyViewed);
v1.use('/coupons', couponRoutes.publicRouter);
v1.use('/orders', orderRoutes);
v1.use('/payments', paymentRoutes);
v1.use('/wallet', walletRoutes);
v1.use('/vendor/shipments', shippingRoutes.vendorRouter);
v1.use('/shipping/webhooks', shippingRoutes.webhookRouter);
v1.use('/admin/shipments', shippingRoutes.adminRouter);
v1.use('/returns', returnRoutes.customerRouter);
v1.use('/vendor/returns', returnRoutes.vendorRouter);
v1.use('/admin/returns', returnRoutes.adminRouter);
v1.use('/vendor/inventory', inventoryRoutes);
v1.use('/vendor/payouts', payoutRoutes.vendorRouter);
v1.use('/vendor/analytics', vendorAnalyticsRoutes);
v1.use('/vendor', vendorRoutes.selfRouter);
v1.use('/admin/vendors', vendorRoutes.adminRouter);
v1.use('/admin/payouts', payoutRoutes.adminRouter);
v1.use('/cms', cmsRoutes.publicRouter);
v1.use('/admin/cms', cmsRoutes.adminRouter);
v1.use('/admin', adminRoutes);
v1.use('/notifications', notificationRoutes);
v1.use('/support/tickets', supportRoutes.customerRouter);
v1.use('/admin/support/tickets', supportRoutes.staffRouter);
// API docs exist only outside production, and the doc tooling is not even loaded there.
if (!config.isProduction) {
  const swaggerUi = require('swagger-ui-express');
  const swaggerSpec = require('./docs/swagger');
  v1.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'Sureshot API' }));
}

app.use('/api/v1', v1);

if (config.serveWeb) require('./middlewares/web.middleware')(app);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
