const jwt = require('jsonwebtoken');
const config = require('../config');
const ApiError = require('../utils/ApiError');

/**
 * Verifies the Bearer access token and attaches { id, roles, permissions } to req.user.
 * Access tokens are self-contained; revocation happens at the refresh-token layer,
 * which is why access TTL is kept short (15m).
 */
const authenticate = (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Authentication required'));
  }

  try {
    const payload = jwt.verify(token, config.jwt.accessSecret, { algorithms: ['HS256'] });
    req.user = {
      id: payload.sub,
      roles: payload.roles || [],
      permissions: payload.perms || [],
    };
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Access token expired', 'TOKEN_EXPIRED'));
    }
    return next(ApiError.unauthorized('Invalid access token'));
  }
};

/** Attaches req.user when a valid token is present; anonymous otherwise. */
const authenticateOptional = (req, res, next) => {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, (err) => next(err && err.code === 'TOKEN_EXPIRED' ? err : undefined));
};

module.exports = { authenticate, authenticateOptional };
