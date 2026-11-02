/**
 * Operational error with HTTP status and machine-readable code.
 * Anything not an ApiError is treated as a programmer error and logged fully.
 */
class ApiError extends Error {
  constructor(statusCode, message, code = undefined, errors = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || ApiError.defaultCode(statusCode);
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static defaultCode(statusCode) {
    const map = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'BUSINESS_RULE',
      429: 'RATE_LIMITED',
      500: 'INTERNAL',
    };
    return map[statusCode] || 'ERROR';
  }

  static badRequest(message, errors) { return new ApiError(400, message, 'VALIDATION_ERROR', errors); }
  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED') { return new ApiError(401, message, code); }
  static forbidden(message = 'You do not have permission to perform this action') { return new ApiError(403, message); }
  static notFound(entity = 'Resource') { return new ApiError(404, `${entity} not found`); }
  static conflict(message) { return new ApiError(409, message); }
  static businessRule(message) { return new ApiError(422, message); }
  static rateLimited(message = 'Too many requests, please try again later') { return new ApiError(429, message); }
}

module.exports = ApiError;
