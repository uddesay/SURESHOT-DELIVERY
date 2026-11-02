const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const config = require('../config');

const notFoundHandler = (req, res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl}`));
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Postgres unique violation → 409
  if (err.code === '23505') {
    err = ApiError.conflict('A record with these details already exists');
  }
  // Postgres FK violation → 422
  if (err.code === '23503') {
    err = ApiError.businessRule('Referenced resource does not exist');
  }

  const isOperational = err instanceof ApiError && err.isOperational;
  const statusCode = isOperational ? err.statusCode : 500;

  if (!isOperational) {
    logger.error({ err, url: req.originalUrl, method: req.method }, 'Unhandled error');
  } else if (statusCode >= 500) {
    logger.error({ err }, err.message);
  }

  res.status(statusCode).json({
    success: false,
    message: isOperational ? err.message : 'Something went wrong. Please try again.',
    code: isOperational ? err.code : 'INTERNAL',
    ...(err.errors ? { errors: err.errors } : {}),
    ...(config.isProduction ? {} : { stack: err.stack }),
  });
};

module.exports = { notFoundHandler, errorHandler };
