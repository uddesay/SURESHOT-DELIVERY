const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const config = require('../../config');
const db = require('../../config/database');
const { sha256, randomToken } = require('../../utils/crypto');
const ApiError = require('../../utils/ApiError');

/**
 * Access tokens: short-lived JWT carrying roles + permissions.
 * Refresh tokens: opaque random strings, stored hashed, rotated on every use.
 * Reuse of a rotated token revokes the whole family (stolen-token detection).
 */

const loadAuthorizationClaims = async (userId) => {
  const rows = await db('user_roles as ur')
    .join('roles as r', 'r.id', 'ur.role_id')
    .leftJoin('role_permissions as rp', 'rp.role_id', 'r.id')
    .leftJoin('permissions as p', 'p.id', 'rp.permission_id')
    .where('ur.user_id', userId)
    .select('r.name as role', 'p.name as permission');

  const roles = [...new Set(rows.map((r) => r.role))];
  const permissions = [...new Set(rows.map((r) => r.permission).filter(Boolean))];
  return { roles, permissions };
};

const signAccessToken = (userId, roles, permissions) =>
  jwt.sign({ sub: userId, roles, perms: permissions }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessTtl,
    algorithm: 'HS256',
  });

/**
 * Issues a new access + refresh pair.
 * @param {string} userId
 * @param {object} ctx - { familyId?, deviceName?, ip?, userAgent?, trx? }
 */
const issueTokenPair = async (userId, ctx = {}) => {
  const q = ctx.trx || db;
  const { roles, permissions } = await loadAuthorizationClaims(userId);

  const refreshToken = randomToken(48);
  const expiresAt = new Date(Date.now() + config.jwt.refreshTtlDays * 24 * 3600 * 1000);
  const familyId = ctx.familyId || uuid();

  const [row] = await q('refresh_tokens')
    .insert({
      user_id: userId,
      token_hash: sha256(refreshToken),
      family_id: familyId,
      device_name: ctx.deviceName || null,
      ip_address: ctx.ip || null,
      user_agent: ctx.userAgent || null,
      expires_at: expiresAt,
    })
    .returning('id');

  return {
    accessToken: signAccessToken(userId, roles, permissions),
    refreshToken,
    refreshTokenId: row.id,
    expiresIn: config.jwt.accessTtl,
    roles,
  };
};

/**
 * Rotates a refresh token. Detects reuse of already-rotated tokens and
 * revokes the entire family when it happens.
 */
const rotateRefreshToken = async (refreshToken, ctx = {}) => {
  const tokenHash = sha256(refreshToken);
  const existing = await db('refresh_tokens').where({ token_hash: tokenHash }).first();

  if (!existing) throw ApiError.unauthorized('Invalid refresh token', 'TOKEN_REVOKED');

  if (existing.revoked_at) {
    // Token reuse — assume compromise, kill the family.
    await db('refresh_tokens')
      .where({ family_id: existing.family_id })
      .whereNull('revoked_at')
      .update({ revoked_at: db.fn.now() });
    throw ApiError.unauthorized('Refresh token reuse detected — all sessions revoked', 'TOKEN_REVOKED');
  }

  if (new Date(existing.expires_at) < new Date()) {
    throw ApiError.unauthorized('Refresh token expired', 'TOKEN_EXPIRED');
  }

  const user = await db('users').where({ id: existing.user_id }).whereNull('deleted_at').first();
  if (!user || user.status !== 'active') {
    throw ApiError.unauthorized('Account is not active', 'TOKEN_REVOKED');
  }

  return db.transaction(async (trx) => {
    const pair = await issueTokenPair(existing.user_id, { ...ctx, familyId: existing.family_id, trx });
    await trx('refresh_tokens')
      .where({ id: existing.id })
      .update({ revoked_at: trx.fn.now(), replaced_by: pair.refreshTokenId });
    return { ...pair, userId: existing.user_id };
  });
};

const revokeRefreshToken = async (refreshToken) => {
  await db('refresh_tokens')
    .where({ token_hash: sha256(refreshToken) })
    .whereNull('revoked_at')
    .update({ revoked_at: db.fn.now() });
};

const revokeAllUserTokens = async (userId) => {
  await db('refresh_tokens')
    .where({ user_id: userId })
    .whereNull('revoked_at')
    .update({ revoked_at: db.fn.now() });
};

module.exports = {
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  loadAuthorizationClaims,
};
