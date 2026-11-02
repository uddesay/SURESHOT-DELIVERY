const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Writes an append-only audit_logs row after a successful state-changing
 * request. Attach to admin/vendor mutation routes:
 *   router.post('/products/:id/approve', authenticate, authorize('products:approve'),
 *     audit('products:approve', 'product', (req) => req.params.id), controller.approve)
 */
/** Never persist credentials: blank out password / token / secret fields at any depth. */
const SENSITIVE = /pass(word)?|token|secret|otp|pin$/i;
const redact = (value) => {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) ? '[redacted]' : redact(v)]));
  }
  return value;
};

const audit = (action, entityType, entityIdResolver) => (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const entityId = entityIdResolver ? entityIdResolver(req, res) : req.params.id || null;
    db('audit_logs')
      .insert({
        actor_id: req.user?.id || null,
        action,
        entity_type: entityType,
        entity_id: entityId,
        after_data: JSON.stringify({ body: redact(req.body ?? null) }),
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || null,
      })
      .catch((err) => logger.error({ err, action }, 'Audit log write failed'));
  });
  next();
};

module.exports = audit;
