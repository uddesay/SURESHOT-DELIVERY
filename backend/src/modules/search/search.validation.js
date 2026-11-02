const Joi = require('joi');

module.exports = {
  search: {
    query: Joi.object({
      q: Joi.string().max(200).trim().allow(''),
      category: Joi.string().uuid(),
      brand: Joi.string().uuid(),
      vendor: Joi.string().uuid(),
      priceMin: Joi.number().integer().min(0),
      priceMax: Joi.number().integer().min(0),
      rating: Joi.number().min(1).max(5),
      inStock: Joi.boolean(),
      sort: Joi.string().valid('relevance', 'price_asc', 'price_desc', 'rating', 'newest', 'popularity').default('relevance'),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
    }),
  },
  suggest: {
    query: Joi.object({ q: Joi.string().min(2).max(100).trim().required() }),
  },
};
