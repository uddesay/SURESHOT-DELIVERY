const ApiError = require('../utils/ApiError');

/**
 * Joi validation middleware.
 * @param {object} schemas - { body?, query?, params? } Joi schemas
 */
const validate = (schemas) => (req, res, next) => {
  const errors = [];

  for (const key of ['body', 'query', 'params']) {
    if (!schemas[key]) continue;
    const { error, value } = schemas[key].validate(req[key], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      errors.push(
        ...error.details.map((d) => ({ field: d.path.join('.'), message: d.message.replace(/"/g, "'") })),
      );
    } else if (key === 'query') {
      // Express 5 makes req.query a getter; mutate contents instead of reassigning
      Object.assign(req.query, value);
    } else {
      req[key] = value;
    }
  }

  if (errors.length) return next(ApiError.badRequest('Validation failed', errors));
  return next();
};

module.exports = validate;
