const argon2 = require('argon2');
const db = require('../../config/database');
const config = require('../../config');
const logger = require('../../utils/logger');
const ApiError = require('../../utils/ApiError');
const { generateOtp } = require('../../utils/crypto');

/**
 * OTP lifecycle: request → hash + store with TTL → verify (attempt-limited,
 * single-use). Delivery is pluggable; 'console' provider logs the code in dev.
 */

const sendViaProvider = async (identifier, channel, code) => {
  if (!config.isProduction) {
    logger.info({ identifier, channel, code }, '[DEV] OTP code');
    return;
  }
  // Production providers (MSG91/Twilio for SMS, SMTP for email) are wired in
  // the notifications module (Phase 9); until then delivery uses queue jobs.
  throw new Error(`OTP provider '${config.otp.smsProvider}' not configured`);
};

const requestOtp = async ({ identifier, channel, purpose }) => {
  if (config.isProduction) throw new ApiError(503, 'OTP delivery is not configured. Contact support.', 'OTP_UNAVAILABLE');
  const code = generateOtp();

  // Invalidate previous unconsumed codes for this identifier+purpose.
  await db('otp_codes')
    .where({ identifier, purpose })
    .whereNull('consumed_at')
    .update({ consumed_at: db.fn.now() });

  await db('otp_codes').insert({
    identifier,
    channel,
    purpose,
    code_hash: await argon2.hash(code, { type: argon2.argon2id }),
    expires_at: new Date(Date.now() + config.otp.ttlSeconds * 1000),
  });

  await sendViaProvider(identifier, channel, code);
  return { ttlSeconds: config.otp.ttlSeconds };
};

const verifyOtp = async ({ identifier, purpose, code }) => {
  const record = await db('otp_codes')
    .where({ identifier, purpose })
    .whereNull('consumed_at')
    .orderBy('created_at', 'desc')
    .first();

  if (!record) throw ApiError.unauthorized('No active OTP found. Request a new code.');
  if (new Date(record.expires_at) < new Date()) {
    throw ApiError.unauthorized('OTP has expired. Request a new code.');
  }
  if (record.attempts >= config.otp.maxAttempts) {
    throw ApiError.rateLimited('Too many incorrect attempts. Request a new code.');
  }

  const valid = await argon2.verify(record.code_hash, code);
  if (!valid) {
    await db('otp_codes').where({ id: record.id }).increment('attempts', 1);
    throw ApiError.unauthorized('Incorrect OTP');
  }

  await db('otp_codes').where({ id: record.id }).update({ consumed_at: db.fn.now() });
  return true;
};

module.exports = { requestOtp, verifyOtp };
