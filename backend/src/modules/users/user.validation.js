const Joi = require('joi');

module.exports = {
  updateProfile: {
    body: Joi.object({
      fullName: Joi.string().min(2).max(120).trim(),
      avatarUrl: Joi.string().uri().max(2048),
      dateOfBirth: Joi.date().iso().less('now'),
      gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say'),
      preferredLanguage: Joi.string().length(2).lowercase(),
      preferredCurrency: Joi.string().length(3).uppercase(),
    }).min(1),
  },

  registerDevice: {
    body: Joi.object({
      fcmToken: Joi.string().max(4096).required(),
      platform: Joi.string().valid('android', 'ios', 'web').required(),
      deviceModel: Joi.string().max(120),
      appVersion: Joi.string().max(20),
    }),
  },

  deleteAccount: {
    body: Joi.object({
      confirmation: Joi.string().valid('DELETE').required()
        .messages({ 'any.only': "Type 'DELETE' to confirm account deletion" }),
    }),
  },
};
