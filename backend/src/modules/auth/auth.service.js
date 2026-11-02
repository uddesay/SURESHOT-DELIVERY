const argon2 = require('argon2');
const { OAuth2Client } = require('google-auth-library');
const config = require('../../config');
const ApiError = require('../../utils/ApiError');
const repo = require('./auth.repository');
const tokenService = require('./token.service');
const otpService = require('./otp.service');

const googleClient = new OAuth2Client(config.oauth.googleClientId);

const sanitizeUser = (user) => {
  const {
    password_hash: _ph, deleted_at: _da, ...safe
  } = user;
  return safe;
};

const assertActive = (user) => {
  if (user.status === 'suspended') throw ApiError.forbidden('Your account is suspended. Contact support.');
  if (user.status === 'banned' || user.status === 'deleted') {
    throw ApiError.unauthorized('Account is not available');
  }
};

// ---------------------------------------------------------------- register
const register = async ({ email, phone, password, fullName, referralCode }, ctx) => {
  if (email && (await repo.findUserByEmail(email))) {
    throw ApiError.conflict('An account with this email already exists');
  }
  if (phone && (await repo.findUserByPhone(phone))) {
    throw ApiError.conflict('An account with this phone number already exists');
  }

  const user = await repo.createUser(
    {
      email: email || null,
      phone: phone || null,
      password_hash: await argon2.hash(password, { type: argon2.argon2id }),
      full_name: fullName,
    },
    { referredByCode: referralCode },
  );

  // Kick off email/phone verification out-of-band.
  if (email) {
    await otpService.requestOtp({ identifier: email, channel: 'email', purpose: 'verify' }).catch(() => {});
  }

  const tokens = await tokenService.issueTokenPair(user.id, ctx);
  return { user: sanitizeUser(user), tokens };
};

// ---------------------------------------------------------------- login
const login = async ({ identifier, password }, ctx) => {
  const user = await repo.findUserByIdentifier(identifier);

  // Constant-shape flow: always run a hash verify to avoid user-enumeration timing.
  const dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const valid = await argon2
    .verify(user?.password_hash || dummyHash, password)
    .catch(() => false);

  if (!user || !user.password_hash || !valid) {
    throw ApiError.unauthorized('Invalid credentials');
  }
  assertActive(user);

  await repo.updateUser(user.id, { last_login_at: new Date() });
  const tokens = await tokenService.issueTokenPair(user.id, ctx);
  return { user: sanitizeUser(user), tokens };
};

// ---------------------------------------------------------------- OTP login
const requestLoginOtp = async ({ identifier }) => {
  const channel = identifier.includes('@') ? 'email' : 'sms';
  return otpService.requestOtp({ identifier, channel, purpose: 'login' });
};

/** Verify OTP; auto-register a new customer when the identifier is unknown. */
const verifyLoginOtp = async ({ identifier, code, fullName }, ctx) => {
  await otpService.verifyOtp({ identifier, purpose: 'login', code });

  let user = await repo.findUserByIdentifier(identifier);
  let isNewUser = false;

  if (!user) {
    const isEmail = identifier.includes('@');
    user = await repo.createUser({
      email: isEmail ? identifier : null,
      phone: isEmail ? null : identifier,
      full_name: fullName || '',
      is_email_verified: isEmail,
      is_phone_verified: !isEmail,
    });
    isNewUser = true;
  } else {
    assertActive(user);
    const verifyField = identifier.includes('@') ? 'is_email_verified' : 'is_phone_verified';
    await repo.updateUser(user.id, { [verifyField]: true, last_login_at: new Date() });
  }

  const tokens = await tokenService.issueTokenPair(user.id, ctx);
  return { user: sanitizeUser(user), tokens, isNewUser };
};

// ---------------------------------------------------------------- OAuth
const googleSignIn = async ({ idToken }, ctx) => {
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: config.oauth.googleClientId,
    });
    payload = ticket.getPayload();
  } catch {
    throw ApiError.unauthorized('Invalid Google token');
  }

  return oauthSignIn({
    provider: 'google',
    providerUserId: payload.sub,
    email: payload.email,
    fullName: payload.name,
    avatarUrl: payload.picture,
    emailVerified: payload.email_verified,
  }, ctx);
};

const oauthSignIn = async ({ provider, providerUserId, email, fullName, avatarUrl, emailVerified }, ctx) => {
  const linked = await repo.findOauthAccount(provider, providerUserId);
  let user;
  let isNewUser = false;

  if (linked) {
    user = await repo.findUserById(linked.user_id);
    if (!user) throw ApiError.unauthorized('Account is not available');
    assertActive(user);
  } else {
    user = email ? await repo.findUserByEmail(email) : null;
    if (user) {
      assertActive(user);
      await repo.linkOauthAccount(user.id, provider, providerUserId, email);
    } else {
      user = await repo.createUser({
        email: email || null,
        full_name: fullName || '',
        avatar_url: avatarUrl || null,
        is_email_verified: Boolean(emailVerified),
      });
      await repo.linkOauthAccount(user.id, provider, providerUserId, email);
      isNewUser = true;
    }
  }

  await repo.updateUser(user.id, { last_login_at: new Date() });
  const tokens = await tokenService.issueTokenPair(user.id, ctx);
  return { user: sanitizeUser(user), tokens, isNewUser };
};

// ---------------------------------------------------------------- passwords
const forgotPassword = async ({ identifier }) => {
  const user = await repo.findUserByIdentifier(identifier);
  // Always report success to prevent account enumeration.
  if (user) {
    const channel = identifier.includes('@') ? 'email' : 'sms';
    await otpService.requestOtp({ identifier, channel, purpose: 'password_reset' });
  }
  return { message: 'If an account exists, a reset code has been sent.' };
};

const resetPassword = async ({ identifier, code, newPassword }) => {
  await otpService.verifyOtp({ identifier, purpose: 'password_reset', code });
  const user = await repo.findUserByIdentifier(identifier);
  if (!user) throw ApiError.unauthorized('Account not found');

  await repo.updateUser(user.id, {
    password_hash: await argon2.hash(newPassword, { type: argon2.argon2id }),
  });
  await tokenService.revokeAllUserTokens(user.id);
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await repo.findUserById(userId);
  if (!user.password_hash || !(await argon2.verify(user.password_hash, currentPassword))) {
    throw ApiError.unauthorized('Current password is incorrect');
  }
  await repo.updateUser(userId, {
    password_hash: await argon2.hash(newPassword, { type: argon2.argon2id }),
  });
  await tokenService.revokeAllUserTokens(userId);
};

// ---------------------------------------------------------------- session
const refresh = (refreshToken, ctx) => tokenService.rotateRefreshToken(refreshToken, ctx);
const logout = (refreshToken) => tokenService.revokeRefreshToken(refreshToken);
const logoutAll = (userId) => tokenService.revokeAllUserTokens(userId);

const me = async (userId) => {
  const user = await repo.findUserById(userId);
  if (!user) throw ApiError.notFound('User');
  const { roles, permissions } = await tokenService.loadAuthorizationClaims(userId);
  return { ...sanitizeUser(user), roles, permissions };
};

module.exports = {
  register,
  login,
  requestLoginOtp,
  verifyLoginOtp,
  googleSignIn,
  forgotPassword,
  resetPassword,
  changePassword,
  refresh,
  logout,
  logoutAll,
  me,
  sanitizeUser,
};
