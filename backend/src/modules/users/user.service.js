const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { sanitizeUser } = require('../auth/auth.service');
const { revokeAllUserTokens } = require('../auth/token.service');

const getProfile = async (userId) => {
  const user = await db('users').where({ id: userId }).whereNull('deleted_at').first();
  if (!user) throw ApiError.notFound('User');
  const wallet = await db('wallets').where({ user_id: userId }).first();
  return {
    ...sanitizeUser(user),
    wallet: wallet
      ? { balanceMinor: Number(wallet.balance_minor), rewardPoints: wallet.reward_points, currency: wallet.currency }
      : null,
  };
};

const updateProfile = async (userId, attrs) => {
  const updates = {};
  if (attrs.fullName !== undefined) updates.full_name = attrs.fullName;
  if (attrs.avatarUrl !== undefined) updates.avatar_url = attrs.avatarUrl;
  if (attrs.dateOfBirth !== undefined) updates.date_of_birth = attrs.dateOfBirth;
  if (attrs.gender !== undefined) updates.gender = attrs.gender;
  if (attrs.preferredLanguage !== undefined) updates.preferred_language = attrs.preferredLanguage;
  if (attrs.preferredCurrency !== undefined) updates.preferred_currency = attrs.preferredCurrency;

  await db('users').where({ id: userId }).update(updates);
  return getProfile(userId);
};

const registerDevice = async (userId, { fcmToken, platform, deviceModel, appVersion }) => {
  await db('user_devices')
    .insert({
      user_id: userId,
      fcm_token: fcmToken,
      platform,
      device_model: deviceModel || null,
      app_version: appVersion || null,
    })
    .onConflict(['user_id', 'fcm_token'])
    .merge({ last_seen_at: db.fn.now(), app_version: appVersion || null });
};

/**
 * GDPR-style soft delete: anonymize PII, revoke sessions, keep order history
 * for financial/legal retention.
 */
const deleteAccount = async (userId) => {
  await db.transaction(async (trx) => {
    await trx('users').where({ id: userId }).update({
      status: 'deleted',
      deleted_at: trx.fn.now(),
      email: null,
      phone: null,
      full_name: 'Deleted User',
      avatar_url: null,
      password_hash: null,
      date_of_birth: null,
    });
    await trx('user_devices').where({ user_id: userId }).del();
    await trx('addresses').where({ user_id: userId }).update({ deleted_at: trx.fn.now() });
  });
  await revokeAllUserTokens(userId);
};

module.exports = { getProfile, updateProfile, registerDevice, deleteAccount };
