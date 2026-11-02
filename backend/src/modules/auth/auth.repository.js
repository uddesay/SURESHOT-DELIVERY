const db = require('../../config/database');
const { v4: uuid } = require('uuid');
const { generateReferralCode } = require('../../utils/crypto');

const findUserByEmail = (email) =>
  db('users').whereRaw('email = ?', [email]).whereNull('deleted_at').first();

const findUserByPhone = (phone) =>
  db('users').where({ phone }).whereNull('deleted_at').first();

const findUserById = (id) => db('users').where({ id }).whereNull('deleted_at').first();

const findUserByIdentifier = (identifier) =>
  identifier.includes('@') ? findUserByEmail(identifier) : findUserByPhone(identifier);

/**
 * Creates a user with the customer role, wallet, and (optionally) referral link
 * in one transaction.
 */
const createUser = async (attrs, { referredByCode } = {}) => {
  return db.transaction(async (trx) => {
    let referredBy = null;
    if (referredByCode) {
      const referrer = await trx('users').where({ referral_code: referredByCode }).first();
      referredBy = referrer ? referrer.id : null;
    }

    const [user] = await trx('users')
      .insert({
        id: uuid(),
        ...attrs,
        referral_code: generateReferralCode(),
        referred_by: referredBy,
      })
      .returning('*');

    const customerRole = await trx('roles').where({ name: 'customer' }).first();
    await trx('user_roles').insert({ user_id: user.id, role_id: customerRole.id });
    await trx('wallets').insert({ id: uuid(), user_id: user.id });

    if (referredBy) {
      await trx('referrals').insert({ id: uuid(), referrer_id: referredBy, referee_id: user.id });
    }
    return user;
  });
};

const findOauthAccount = (provider, providerUserId) =>
  db('oauth_accounts').where({ provider, provider_user_id: providerUserId }).first();

const linkOauthAccount = (userId, provider, providerUserId, email) =>
  db('oauth_accounts').insert({ user_id: userId, provider, provider_user_id: providerUserId, email });

const updateUser = (id, attrs) => db('users').where({ id }).update(attrs);

module.exports = {
  findUserByEmail,
  findUserByPhone,
  findUserById,
  findUserByIdentifier,
  createUser,
  findOauthAccount,
  linkOauthAccount,
  updateUser,
};
