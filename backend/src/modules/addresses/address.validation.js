const Joi = require('joi');

const base = {
  label: Joi.string().valid('home', 'work', 'other'),
  recipientName: Joi.string().min(2).max(120).trim(),
  recipientPhone: Joi.string().pattern(/^\+?[1-9]\d{7,14}$/),
  line1: Joi.string().min(3).max(255).trim(),
  line2: Joi.string().max(255).trim().allow('', null),
  landmark: Joi.string().max(120).trim().allow('', null),
  city: Joi.string().min(2).max(80).trim(),
  state: Joi.string().min(2).max(80).trim(),
  postalCode: Joi.string().pattern(/^[A-Za-z0-9 -]{3,12}$/),
  country: Joi.string().length(2).uppercase(),
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
  isDefault: Joi.boolean(),
};

const idParam = { params: Joi.object({ id: Joi.string().uuid().required() }) };

module.exports = {
  create: {
    body: Joi.object({
      ...base,
      label: base.label.default('home'),
      recipientName: base.recipientName.required(),
      recipientPhone: base.recipientPhone.required(),
      line1: base.line1.required(),
      city: base.city.required(),
      state: base.state.required(),
      postalCode: base.postalCode.required(),
    }),
  },
  update: { ...idParam, body: Joi.object(base).min(1) },
  idOnly: idParam,
};
