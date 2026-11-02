const { v4: uuid } = require('uuid');
const db = require('../../config/database');
const logger = require('../../utils/logger');
const { emitToUser } = require('../../sockets');
const { sendPush } = require('./push.provider');

/**
 * Single entry point for user-facing notifications: persists the in-app
 * row, emits it over the user's socket room, and fans out an FCM push to
 * every registered device. Entirely best-effort — a notification failure
 * must never fail the business transaction that triggered it, so callers
 * fire-and-forget and errors are only logged.
 */
const notify = async (userId, { title, body, type = 'general', data = {}, imageUrl = null }) => {
  try {
    const [row] = await db('notifications')
      .insert({
        id: uuid(),
        user_id: userId,
        title,
        body,
        notification_type: type,
        data: JSON.stringify(data),
        image_url: imageUrl,
      })
      .returning('*');

    emitToUser(userId, 'notification', {
      id: row.id,
      title,
      body,
      type,
      data,
      createdAt: row.created_at,
    });

    const tokens = await db('user_devices').where({ user_id: userId }).pluck('fcm_token');
    const { invalidTokens } = await sendPush(tokens, { title, body, data: { ...data, type } });
    if (invalidTokens.length) {
      await db('user_devices').where({ user_id: userId }).whereIn('fcm_token', invalidTokens).del();
    }
  } catch (err) {
    logger.error({ err, userId, title }, 'Notification delivery failed (non-blocking)');
  }
};

const list = async (userId, { page = 1, limit = 20 }) => {
  const base = db('notifications').where({ user_id: userId });
  const [{ count }] = await base.clone().count('* as count');
  const [{ count: unread }] = await db('notifications')
    .where({ user_id: userId, is_read: false })
    .count('* as count');
  const rows = await base.clone().orderBy('created_at', 'desc').offset((page - 1) * limit).limit(limit);
  return { total: Number(count), unreadCount: Number(unread), rows };
};

const markRead = async (userId, notificationId) => {
  await db('notifications').where({ id: notificationId, user_id: userId }).update({ is_read: true });
};

const markAllRead = async (userId) => {
  await db('notifications').where({ user_id: userId, is_read: false }).update({ is_read: true });
};

module.exports = { notify, list, markRead, markAllRead };
