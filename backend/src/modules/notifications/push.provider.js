const fs = require('fs');
const logger = require('../../utils/logger');

/**
 * FCM push delivery via firebase-admin, lazily initialized from the
 * service-account file at FCM_SERVICE_ACCOUNT_JSON_PATH. When unconfigured
 * (local dev, CI) pushes are logged and skipped — same pattern as the OTP
 * console provider, so the app never hard-depends on a Firebase project.
 */
let messaging = null;
let initAttempted = false;

const getMessaging = () => {
  if (initAttempted) return messaging;
  initAttempted = true;

  const keyPath = process.env.FCM_SERVICE_ACCOUNT_JSON_PATH;
  if (!keyPath || !fs.existsSync(keyPath)) {
    logger.info('FCM not configured — push notifications will be logged only');
    return null;
  }

  try {
    // Optional dependency: required lazily (not at module load) so the app
    // runs without firebase-admin installed until FCM is actually configured.
    const admin = require('firebase-admin');
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))),
    });
    messaging = admin.messaging();
    logger.info('FCM initialized');
  } catch (err) {
    logger.error({ err }, 'FCM initialization failed — push disabled');
  }
  return messaging;
};

/**
 * Sends a push to a list of device tokens. Returns tokens FCM reported as
 * invalid so the caller can prune them.
 */
const sendPush = async (tokens, { title, body, data = {} }) => {
  if (!tokens.length) return { invalidTokens: [] };

  const fcm = getMessaging();
  if (!fcm) {
    logger.debug({ tokenCount: tokens.length, title }, '[DEV] Push notification (FCM unconfigured)');
    return { invalidTokens: [] };
  }

  try {
    const response = await fcm.sendEachForMulticast({
      tokens,
      notification: { title, body },
      // FCM data payloads must be flat string maps.
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    });

    const invalidTokens = [];
    response.responses.forEach((res, idx) => {
      const code = res.error?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') {
        invalidTokens.push(tokens[idx]);
      }
    });
    return { invalidTokens };
  } catch (err) {
    logger.warn({ err }, 'FCM send failed (non-blocking)');
    return { invalidTokens: [] };
  }
};

module.exports = { sendPush };
