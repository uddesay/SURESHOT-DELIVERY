const client = require('prom-client');

/**
 * Process-level metrics (CPU, memory, event loop lag, GC) plus a per-route
 * HTTP request duration histogram. One registry per process — scraped by
 * Prometheus at GET /metrics (see app.js). Route label uses the matched
 * Express route pattern (`req.route.path` via the mount path), never the
 * raw URL, so high-cardinality path params (order IDs, SKUs) don't blow up
 * the metric's label set.
 */
const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'sureshot_' });

const httpRequestDuration = new client.Histogram({
  name: 'sureshot_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: 'sureshot_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const routeLabel = (req) => {
  // req.baseUrl + route.path gives the matched pattern (e.g. /api/v1/orders/:orderId)
  // rather than the literal URL; falls back to the raw path for 404s where
  // no route matched at all.
  const matched = req.route?.path;
  return matched ? `${req.baseUrl}${matched}` : req.path;
};

const metricsMiddleware = (req, res, next) => {
  if (req.path === '/metrics') return next();
  const startTime = process.hrtime.bigint();
  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - startTime) / 1e9;
    const labels = { method: req.method, route: routeLabel(req), status_code: res.statusCode };
    httpRequestDuration.observe(labels, durationSeconds);
    httpRequestsTotal.inc(labels);
  });
  next();
};

const metricsHandler = async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
};

module.exports = { register, metricsMiddleware, metricsHandler };
