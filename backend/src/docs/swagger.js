const swaggerJsdoc = require('swagger-jsdoc');
const config = require('../config');

const spec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Sureshot API',
      version: '1.0.0',
      description: 'Enterprise multi-vendor ecommerce platform REST API',
    },
    servers: [{ url: `${config.apiBaseUrl}/api/v1` }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    tags: [
      { name: 'Auth' }, { name: 'Users' }, { name: 'Addresses' },
    ],
  },
  apis: ['./src/modules/**/*.routes.js'],
});

module.exports = spec;
