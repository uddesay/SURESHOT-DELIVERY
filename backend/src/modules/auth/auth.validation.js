const Joi = require('joi');

const email = Joi.string().email().max(255).lowercase().trim();
const phone = Joi.string().pattern(/^\+?[1-9]\d{7,14}$/).message('Phone must be in international format, e.g. +919876543210');
const password = Joi.string().min(8).max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  .message('Password must be at least 8 characters with upper, lower and a digit');
const identifier = Joi.alternatives().try(email, phone).required()
  .messages({ 'alternatives.match': 'Identifier must be a valid email or phone number' });
const otpCode = Joi.string().pattern(/^\d{6}$/).required()
  .messages({ 'string.pattern.base': 'OTP must be 6 digits' });

module.exports = {
  register: {
    body: Joi.object({
      email,
      phone,
      password: password.required(),
      fullName: Joi.string().min(2).max(120).trim().required(),
      referralCode: Joi.string().alphanum().max(16).uppercase(),
    }).or('email', 'phone'),
  },

  login: {
    body: Joi.object({
      identifier,
      password: Joi.string().max(128).required(),
    }),
  },

  otpRequest: {
    body: Joi.object({ identifier }),
  },

  otpVerify: {
    body: Joi.object({
      identifier,
      code: otpCode,
      fullName: Joi.string().min(2).max(120).trim(),
    }),
  },

  googleOauth: {
    body: Joi.object({ idToken: Joi.string().max(4096).required() }),
  },

  refresh: {
    body: Joi.object({ refreshToken: Joi.string().max(512).required() }),
  },

  logout: {
    body: Joi.object({ refreshToken: Joi.string().max(512).required() }),
  },

  forgotPassword: {
    body: Joi.object({ identifier }),
  },

  resetPassword: {
    body: Joi.object({
      identifier,
      code: otpCode,
      newPassword: password.required(),
    }),
  },

  changePassword: {
    body: Joi.object({
      currentPassword: Joi.string().max(128).required(),
      newPassword: password.required(),
    }),
  },
};
